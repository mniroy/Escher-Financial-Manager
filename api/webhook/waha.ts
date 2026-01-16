import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeReceipt } from '../_lib/analysis.js';
import { refreshGoogleToken, findOrCreateFolder, uploadToDrive, appendToSheet } from '../_lib/google.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log('[WAHA Webhook] Received request');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const configRaw = req.query.c as string;
    if (!configRaw) {
        return res.status(401).json({ error: 'Missing configuration' });
    }

    let config: { w: string; s: string; a: string; rt?: string; sid?: string; };
    try {
        config = JSON.parse(Buffer.from(configRaw, 'base64').toString());
    } catch (e) {
        return res.status(400).json({ error: 'Invalid configuration' });
    }

    const body = req.body;
    const eventName = body.event;

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

        // --- 3. Download Media ---
        let downloadUrl: string | null = null;
        if (payload.media?.url) {
            downloadUrl = payload.media.url.startsWith('http') ? payload.media.url : `${wahaUrl}${payload.media.url}`;
        } else {
            // Try API Query first
            const msgInfoRes = await fetch(`${wahaUrl}/api/${session}/chats/${encodeURIComponent(chatId)}/messages/${messageId}?downloadMedia=true`, {
                headers: { 'X-Api-Key': wahaKey || '' }
            });
            if (msgInfoRes.ok) {
                const msgInfo = await msgInfoRes.json();
                const remoteMediaUrl = msgInfo.media?.url;
                if (remoteMediaUrl) {
                    downloadUrl = remoteMediaUrl.startsWith('http') ? remoteMediaUrl : `${wahaUrl}${remoteMediaUrl}`;
                }
            }
        }

        if (!downloadUrl) {
            downloadUrl = `${wahaUrl}/api/${session}/messages/${messageId}/download`;
        }

        const mediaResponse = await fetch(downloadUrl!, {
            headers: { 'X-Api-Key': wahaKey || '' }
        });

        if (!mediaResponse.ok) {
            console.error('[WAHA Webhook] Media download failed status:', mediaResponse.status, 'Target:', downloadUrl);
            throw new Error(`Media download failed: ${mediaResponse.statusText}`);
        }

        const buffer = await mediaResponse.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString('base64');
        const mimeType = mediaResponse.headers.get('content-type') || 'image/jpeg';

        // --- 4. Analyze ---
        const analysis = await analyzeReceipt(base64Image, mimeType, geminiKey!);
        console.log('[WAHA Webhook] Analysis success:', analysis.merchant);

        let logStatus = 'Not Logged';

        // --- 5. LOGGING ---
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
                logStatus = '✅ Logged to Sheets & Drive';
            } catch (err: any) {
                console.error('[WAHA Webhook] Logging Error:', err);
                logStatus = `⚠️ Logging Failed: ${err.message}`;
            }
        }

        // --- 6. REPLY ---
        // Add delay to let WAHA engine stabilize (matches n8n latency)
        console.log('[WAHA Webhook] Step 6: Waiting 3s before reply...');
        await new Promise(r => setTimeout(r, 3000));

        const report = `📄 *Receipt Analyzed*
💰 Rp ${analysis.amount.toLocaleString('id-ID')}
🏪 ${analysis.merchant}
📅 ${analysis.date}
📂 ${analysis.category}

${logStatus}`;

        console.log('[WAHA Webhook] Sending reply now...');
        const replyRes = await fetch(`${wahaUrl}/api/sendText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': wahaKey || '' },
            body: JSON.stringify({
                chatId,
                text: report,
                session,
                linkPreview: true  // Match n8n config
            })
        });

        if (!replyRes.ok) {
            const errBody = await replyRes.text();
            console.error('[WAHA Webhook] Send error:', errBody);
        } else {
            console.log('[WAHA Webhook] Reply sent.');
        }

        return res.status(200).json({ success: true });

    } catch (error: any) {
        console.error('[WAHA Webhook] Fatal Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
