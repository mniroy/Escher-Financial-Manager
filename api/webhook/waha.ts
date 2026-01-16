import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeReceipt } from '../_lib/analysis.js';
import { refreshGoogleToken, findOrCreateFolder, uploadToDrive, appendToSheet } from '../_lib/google.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log('[WAHA Webhook] Received request');

    if (req.method !== 'POST') {
        console.warn('[WAHA Webhook] Rejected: Not a POST request');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // 1. Decode Smart Config
    const configRaw = req.query.c as string;
    if (!configRaw) {
        console.error('[WAHA Webhook] Error: Missing configuration query parameter (c)');
        return res.status(401).json({ error: 'Missing configuration' });
    }

    let config: {
        w: string; s: string; a: string;
        rt?: string; sid?: string;
    };
    try {
        config = JSON.parse(Buffer.from(configRaw, 'base64').toString());
        console.log('[WAHA Webhook] Smart Config Decoded:', {
            wahaUrl: config.w,
            session: config.s,
            hasRefreshToken: !!config.rt,
            spreadsheetId: config.sid
        });
    } catch (e) {
        console.error('[WAHA Webhook] Error: Failed to decode configuration', e);
        return res.status(400).json({ error: 'Invalid configuration' });
    }

    const body = req.body;
    const eventName = body.event;
    console.log('[WAHA Webhook] Event Name:', eventName);

    // Filter only message events
    if (eventName !== 'message' && eventName !== 'message.any' && eventName !== 'message.upsert') {
        console.log('[WAHA Webhook] Ignoring non-message event:', eventName);
        return res.status(200).json({ status: 'ignored' });
    }

    // WAHA structures vary by engine/version.
    const payload = body.payload || body.data || body;

    // Extract core identifiers
    const messageId = payload.id || payload.key?.id;
    const fromMe = payload.fromMe || payload.key?.fromMe;
    const chatId = payload.from || payload.key?.remoteJid;
    const hasMedia = payload.hasMedia || !!(payload.message?.imageMessage);

    console.log('[WAHA Webhook] Message context:', { chatId, fromMe, messageId, hasMedia });

    if (!chatId || !messageId) {
        console.error('[WAHA Webhook] Error: Could not determine chatId or messageId from payload');
        return res.status(200).json({ status: 'error', reason: 'malformed_payload' });
    }

    if (fromMe && eventName !== 'message.any') {
        console.log('[WAHA Webhook] Ignoring message from self');
        return res.status(200).json({ status: 'ignored' });
    }

    // 2. Sender Filter
    if (config.a) {
        const allowed = config.a.split(',').map(id => id.trim());
        if (!allowed.includes(chatId)) {
            console.warn('[WAHA Webhook] Unauthorized sender:', chatId);
            return res.status(200).json({ status: 'ignored' });
        }
        console.log('[WAHA Webhook] Authorized sender verified');
    }

    if (!hasMedia) {
        console.log('[WAHA Webhook] Ignoring message without media');
        return res.status(200).json({ status: 'ignored' });
    }

    console.log('[WAHA Webhook] Image detected. Starting processing...');

    try {
        const geminiKey = process.env.API_KEY;
        const wahaUrl = config.w;
        const wahaKey = process.env.WAHA_API_KEY;
        const session = config.s || 'default';

        if (!geminiKey) console.error('[DEBUG] ENV API_KEY is missing');
        if (!wahaKey) console.warn('[DEBUG] ENV WAHA_API_KEY is missing');

        // 3. Download Media
        let downloadUrl: string | null = null;

        // Optimization: check if media URL is already in the payload
        if (payload.media?.url) {
            downloadUrl = payload.media.url.startsWith('http')
                ? payload.media.url
                : `${wahaUrl.replace(/\/$/, '')}${payload.media.url}`;
            console.log('[WAHA Webhook] Using media URL from payload:', downloadUrl);
        } else {
            // Fallback: Fetch message details to get the media URL
            console.log('[WAHA Webhook] media.url missing in payload, fetching message details...');
            const msgInfoRes = await fetch(`${wahaUrl.replace(/\/$/, '')}/api/${session}/chats/${encodeURIComponent(chatId)}/messages/${messageId}?downloadMedia=true`, {
                headers: { 'X-Api-Key': wahaKey || '' }
            });

            if (msgInfoRes.ok) {
                const msgInfo = await msgInfoRes.json();
                const remoteMediaUrl = msgInfo.media?.url;
                if (remoteMediaUrl) {
                    downloadUrl = remoteMediaUrl.startsWith('http')
                        ? remoteMediaUrl
                        : `${wahaUrl.replace(/\/$/, '')}${remoteMediaUrl}`;
                    console.log('[WAHA Webhook] Retrieved media URL via API:', downloadUrl);
                }
            } else {
                console.warn('[WAHA Webhook] Failed to fetch message details:', msgInfoRes.status);
            }
        }

        // If still no URL, try the direct message download endpoint (some engines support this)
        if (!downloadUrl) {
            downloadUrl = `${wahaUrl.replace(/\/$/, '')}/api/${session}/messages/${messageId}/download`;
            console.log('[WAHA Webhook] Falling back to direct /download endpoint (Legacy):', downloadUrl);
        }

        console.log('[WAHA Webhook] Step 3: Downloading media file...');
        const mediaResponse = await fetch(downloadUrl, {
            headers: { 'X-Api-Key': wahaKey || '' }
        });

        if (!mediaResponse.ok) {
            const errText = await mediaResponse.text();
            console.error('[WAHA Webhook] Media download failed status:', mediaResponse.status, errText, 'URL:', downloadUrl);
            throw new Error(`Media download failed: ${mediaResponse.statusText} (${mediaResponse.status})`);
        }

        const buffer = await mediaResponse.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString('base64');
        const mimeType = mediaResponse.headers.get('content-type') || 'image/jpeg';
        console.log('[WAHA Webhook] Media downloaded successfully. Mime:', mimeType, 'Size:', buffer.byteLength, 'bytes');

        // 4. Analyze with Gemini
        console.log('[WAHA Webhook] Step 4: Analyzing receipt with Gemini...');
        const analysis = await analyzeReceipt(base64Image, mimeType, geminiKey!);
        console.log('[WAHA Webhook] Gemini Analysis Result:', analysis);

        let logStatus = 'Not Logged (No Refresh Token)';

        // 5. BACKGROUND LOGGING
        if (config.rt && config.sid) {
            console.log('[WAHA Webhook] Step 5: Background Logging triggered');
            try {
                // Get a fresh access token
                console.log('[WAHA Webhook] Refreshing Google Token...');
                const googleToken = await refreshGoogleToken(config.rt);

                const dateParts = (analysis.date || new Date().toISOString().split('T')[0]).split('-');
                const year = dateParts[0];
                const monthIdx = parseInt(dateParts[1]) - 1;
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const monthName = months[monthIdx] || 'Unknown';

                console.log('[WAHA Webhook] Ensuring Drive folders exist...');
                const rootId = await findOrCreateFolder(googleToken, 'Escher Finance Manager');
                const yearId = await findOrCreateFolder(googleToken, year, rootId);
                const monthId = await findOrCreateFolder(googleToken, monthName, yearId);

                // Upload Original To Drive
                console.log('[WAHA Webhook] Uploading image to Google Drive...');
                const fileName = `receipt-${analysis.date}-${analysis.merchant.toLowerCase().replace(/[^a-z0-9]/g, '-')}.jpg`;
                const receiptUrl = await uploadToDrive(googleToken, monthId, base64Image, fileName, mimeType);
                console.log('[WAHA Webhook] Drive URL:', receiptUrl);

                // Append to Sheet
                console.log('[WAHA Webhook] Appending row to Google Sheets...');
                const id = `${analysis.date.replace(/-/g, '')}-${analysis.category.replace(/\s+/g, '')}-${analysis.merchant.toLowerCase().substring(0, 10)}`;

                await appendToSheet(googleToken, config.sid, 'Expenses!A2', [
                    id,
                    analysis.date,
                    analysis.category,
                    analysis.merchant,
                    analysis.amount,
                    receiptUrl,
                    ''
                ]);

                console.log('[WAHA Webhook] Sheet append successful');
                logStatus = '✅ Successfully Logged to Google Sheets & Drive';
            } catch (logError: any) {
                console.error('[WAHA Webhook] Background logging error:', logError);
                logStatus = `⚠️ Analyzed but Logging Failed: ${logError.message}`;
            }
        } else {
            console.log('[WAHA Webhook] Skipping Step 5: Missing rt or sid in config');
        }

        // 6. Report Back to WhatsApp
        console.log('[WAHA Webhook] Step 6: Sending WhatsApp reply...');
        const report = `📄 *Receipt Analyzed*

💰 *Amount:* Rp ${analysis.amount.toLocaleString('id-ID')}
shop *Merchant:* ${analysis.merchant}
📅 *Date:* ${analysis.date}
📂 *Category:* ${analysis.category}

${logStatus}`;

        const replyRes = await fetch(`${wahaUrl.replace(/\/$/, '')}/api/sendText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': wahaKey || '' },
            body: JSON.stringify({ chatId, text: report, session })
        });

        if (!replyRes.ok) {
            console.error('[WAHA Webhook] Failed to send WhatsApp reply:', await replyRes.text());
        } else {
            console.log('[WAHA Webhook] WhatsApp reply sent successfully');
        }

        return res.status(200).json({ success: true });

    } catch (error: any) {
        console.error('[WAHA Webhook] Top-level Error:', error);
        try {
            console.log('[WAHA Webhook] Attempting to send error message to WhatsApp...');
            await fetch(`${config.w.replace(/\/$/, '')}/api/sendText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Api-Key': process.env.WAHA_API_KEY || '' },
                body: JSON.stringify({ chatId, text: `❌ *Error:* ${error.message}`, session: config.s || 'default' })
            });
        } catch (e) {
            console.error('[WAHA Webhook] Failed to send error message to WhatsApp:', e);
        }
        return res.status(500).json({ error: error.message });
    }
}
