import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeReceipt } from '../_lib/analysis.js';
import { refreshGoogleToken, findOrCreateFolder, uploadToDrive, appendToSheet } from '../_lib/google.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log('[WAHA Webhook] Received request');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 1. Decode Smart Config
    const configRaw = req.query.c as string;
    if (!configRaw) {
        return res.status(401).json({ error: 'Missing configuration' });
    }

    let config: {
        w: string; s: string; a: string;
        rt?: string; sid?: string;
    };
    try {
        config = JSON.parse(Buffer.from(configRaw, 'base64').toString());
    } catch (e) {
        return res.status(400).json({ error: 'Invalid configuration' });
    }

    const body = req.body;
    const eventName = body.event;
    console.log('[WAHA Webhook] Event Name:', eventName);

    if (eventName !== 'message' && eventName !== 'message.any' && eventName !== 'message.upsert') {
        return res.status(200).json({ status: 'ignored' });
    }

    const payload = body.payload || body.data || body;
    const messageId = payload.id || payload.key?.id;
    const fromMe = payload.fromMe || payload.key?.fromMe;
    const chatId = payload.from || payload.key?.remoteJid;
    const hasMedia = payload.hasMedia || !!(payload.message?.imageMessage);

    if (!chatId || !messageId) {
        return res.status(200).json({ status: 'error', reason: 'malformed_payload' });
    }

    if (fromMe && eventName !== 'message.any') {
        return res.status(200).json({ status: 'ignored' });
    }

    // 2. Sender Filter
    if (config.a) {
        const allowed = config.a.split(',').map(id => id.trim());
        if (!allowed.includes(chatId)) {
            return res.status(200).json({ status: 'ignored' });
        }
    }

    if (!hasMedia) {
        return res.status(200).json({ status: 'ignored' });
    }

    console.log('[WAHA Webhook] Image detected:', messageId);

    try {
        const geminiKey = process.env.API_KEY;
        const wahaUrl = config.w.replace(/\/$/, '');
        const wahaKey = process.env.WAHA_API_KEY;
        const session = config.s || 'default';

        // 3. Download Media
        let downloadUrl: string | null = null;
        if (payload.media?.url) {
            downloadUrl = payload.media.url.startsWith('http') ? payload.media.url : `${wahaUrl}${payload.media.url}`;
            console.log('[WAHA Webhook] Strategy A (Payload URL):', downloadUrl);
        } else {
            console.log('[WAHA Webhook] Fetching message details for media URL...');
            const msgInfoRes = await fetch(`${wahaUrl}/api/${session}/chats/${encodeURIComponent(chatId)}/messages/${messageId}?downloadMedia=true`, {
                headers: { 'X-Api-Key': wahaKey || '' }
            });

            if (msgInfoRes.ok) {
                const msgInfo = await msgInfoRes.json();
                const remoteMediaUrl = msgInfo.media?.url;
                if (remoteMediaUrl) {
                    downloadUrl = remoteMediaUrl.startsWith('http') ? remoteMediaUrl : `${wahaUrl}${remoteMediaUrl}`;
                    console.log('[WAHA Webhook] Strategy B (API Query URL):', downloadUrl);
                }
            }
        }

        if (!downloadUrl) {
            downloadUrl = `${wahaUrl}/api/${session}/messages/${messageId}/download`;
            console.log('[WAHA Webhook] Strategy C (Legacy Download):', downloadUrl);
        }

        const mediaResponse = await fetch(downloadUrl!, {
            headers: { 'X-Api-Key': wahaKey || '' }
        });

        if (!mediaResponse.ok) {
            console.error('[WAHA Webhook] Media download failed status:', mediaResponse.status, 'Target:', downloadUrl);
            throw new Error(`Media download failed: ${mediaResponse.statusText} (${mediaResponse.status})`);
        }

        const buffer = await mediaResponse.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString('base64');
        const mimeType = mediaResponse.headers.get('content-type') || 'image/jpeg';

        // 4. Analyze
        const analysis = await analyzeReceipt(base64Image, mimeType, geminiKey!);
        console.log('[WAHA Webhook] Gemini analysis success for merchant:', analysis.merchant);

        let logStatus = 'Not Logged';

        // 5. BACKGROUND LOGGING
        if (config.rt && config.sid) {
            try {
                const googleToken = await refreshGoogleToken(config.rt);
                const dateParts = (analysis.date || new Date().toISOString().split('T')[0]).split('-');
                const rootId = await findOrCreateFolder(googleToken, 'Escher Finance Manager');
                const yearId = await findOrCreateFolder(googleToken, dateParts[0], rootId);

                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const monthName = months[parseInt(dateParts[1]) - 1] || 'Unknown';
                const monthId = await findOrCreateFolder(googleToken, monthName, yearId);

                const fileName = `receipt-${analysis.date}-${analysis.merchant.toLowerCase().replace(/[^a-z0-9]/g, '-')}.jpg`;
                const receiptUrl = await uploadToDrive(googleToken, monthId, base64Image, fileName, mimeType);

                const id = `${analysis.date.replace(/-/g, '')}-${analysis.category.replace(/\s+/g, '')}-${analysis.merchant.toLowerCase().substring(0, 10)}`;
                await appendToSheet(googleToken, config.sid, 'Expenses!A2', [
                    id, analysis.date, analysis.category, analysis.merchant, analysis.amount, receiptUrl, ''
                ]);

                logStatus = '✅ Successfully Logged to Google Sheets & Drive';
            } catch (err: any) {
                console.error('[WAHA Webhook] Logging Error:', err);
                logStatus = `⚠️ Analyzed but Logging Failed: ${err.message}`;
            }
        }

        // 6. Report Back (Reduced complexity to fix markedUnread crash)
        console.log('[WAHA Webhook] Step 6: Sending summary message...');

        // Strategy: Pre-warm chat context
        try {
            await fetch(`${wahaUrl}/api/${session}/presence`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Api-Key': wahaKey || '' },
                body: JSON.stringify({ chatId, presence: 'typing' })
            });
            // Longer sleep to allow engine to fully load chat memory
            await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
            console.warn('[WAHA Webhook] Failed to pre-warm chat.');
        }

        const report = `📄 *Receipt Analyzed*

💰 *Amount:* Rp ${analysis.amount.toLocaleString('id-ID')}
🏪 *Merchant:* ${analysis.merchant}
📅 *Date:* ${analysis.date}
📂 *Category:* ${analysis.category}

${logStatus}`;

        const replyRes = await fetch(`${wahaUrl}/api/sendText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': wahaKey || '' },
            body: JSON.stringify({
                chatId,
                text: report,
                session,
                linkPreview: false // STICK TO FALSE: major cause of crashes
            })
        });

        if (!replyRes.ok) {
            const errBody = await replyRes.text();
            console.error('[WAHA Webhook] Send error:', errBody);
        } else {
            console.log('[WAHA Webhook] Summary message sent successfully');
        }

        return res.status(200).json({ success: true });

    } catch (error: any) {
        console.error('[WAHA Webhook] Fatal Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
