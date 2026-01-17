import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeReceipt } from '../_lib/analysis.js';
import { refreshGoogleToken, findOrCreateFolder, uploadToDrive, appendToSheet } from '../_lib/google.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log('[WAHA Webhook] Received request');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get config from environment variables
    const wahaUrl = process.env.WAHA_API_URL?.replace(/\/$/, '');
    const wahaKey = process.env.WAHA_API_KEY;
    const session = process.env.WAHA_SESSION || 'default';
    const allowedSenders = process.env.WAHA_ALLOWED_SENDERS;

    if (!wahaUrl) {
        console.error('[WAHA Webhook] Missing WAHA_API_URL env');
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    // Get user-specific config from query (refresh token, spreadsheet ID, push subscription)
    let userConfig: { rt?: string; sid?: string; push?: any } = {};
    const configRaw = req.query.c as string;
    if (configRaw) {
        try {
            userConfig = JSON.parse(Buffer.from(configRaw, 'base64').toString());
        } catch (e) {
            console.warn('[WAHA Webhook] Could not decode user config');
        }
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

    // Sender filter from env
    if (allowedSenders) {
        const allowed = allowedSenders.split(',').map(id => id.trim());
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

        // --- 3. Download Media ---
        let downloadUrl: string | null = null;
        if (payload.media?.url) {
            downloadUrl = payload.media.url.startsWith('http') ? payload.media.url : `${wahaUrl}${payload.media.url}`;
        } else {
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
            console.error('[WAHA Webhook] Media download failed:', mediaResponse.status, downloadUrl);
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
        if (userConfig.rt && userConfig.sid) {
            try {
                const googleToken = await refreshGoogleToken(userConfig.rt);
                const dateParts = (analysis.date || new Date().toISOString().split('T')[0]).split('-');
                const rootId = await findOrCreateFolder(googleToken, 'Escher Finance Manager');
                const yearId = await findOrCreateFolder(googleToken, dateParts[0], rootId);
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const monthName = months[parseInt(dateParts[1]) - 1] || 'Unknown';
                const monthId = await findOrCreateFolder(googleToken, monthName, yearId);

                const fileName = `receipt-${analysis.date}-${analysis.merchant.toLowerCase().replace(/[^a-z0-9]/g, '-')}.jpg`;
                const receiptUrl = await uploadToDrive(googleToken, monthId, base64Image, fileName, mimeType);

                const id = `${analysis.date.replace(/-/g, '')}-${analysis.category.replace(/\s+/g, '')}-${analysis.merchant.toLowerCase().substring(0, 10)}`;
                await appendToSheet(googleToken, userConfig.sid, 'Expenses!A2', [
                    id, analysis.date, analysis.category, analysis.merchant, analysis.amount, receiptUrl, ''
                ]);
                logStatus = '✅ Logged to Sheets & Drive';

                // Send push notification if subscription is available
                if (userConfig.push && userConfig.push.endpoint) {
                    try {
                        const webpush = await import('web-push');
                        const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
                        const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

                        if (VAPID_PRIVATE_KEY) {
                            webpush.setVapidDetails(
                                'mailto:escher@financial-manager.app',
                                VAPID_PUBLIC_KEY,
                                VAPID_PRIVATE_KEY
                            );

                            const notificationPayload = JSON.stringify({
                                title: '📱 WhatsApp Receipt',
                                body: `Rp ${analysis.amount.toLocaleString('id-ID')} at ${analysis.merchant}`,
                                icon: '/icon-512.png',
                                url: '/transactions',
                                tag: `wa-receipt-${id}`
                            });

                            await webpush.sendNotification(userConfig.push, notificationPayload);
                            console.log('[WAHA Webhook] Push notification sent');
                        }
                    } catch (pushErr: any) {
                        console.warn('[WAHA Webhook] Push notification failed:', pushErr.message);
                    }
                }
            } catch (err: any) {
                console.error('[WAHA Webhook] Logging Error:', err);
                logStatus = `⚠️ Logging Failed: ${err.message}`;
            }
        }

        // --- 6. REPLY ---
        console.log('[WAHA Webhook] Step 6: Waiting 3s before reply...');
        await new Promise(r => setTimeout(r, 3000));

        try {
            await fetch(`${wahaUrl}/api/sendSeen`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Api-Key': wahaKey || '' },
                body: JSON.stringify({ chatId, session, messageIds: [messageId] })
            });
            await new Promise(r => setTimeout(r, 500));
        } catch (e) {
            console.warn('[WAHA Webhook] sendSeen failed');
        }

        const report = `📄 *Receipt Analyzed*
💰 Rp ${analysis.amount.toLocaleString('id-ID')}
🏪 ${analysis.merchant}
📅 ${analysis.date}
📂 ${analysis.category}

${logStatus}`;

        console.log('[WAHA Webhook] Sending reply...');
        const replyRes = await fetch(`${wahaUrl}/api/sendText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': wahaKey || '' },
            body: JSON.stringify({ chatId, text: report, session, linkPreview: true })
        });

        if (!replyRes.ok) {
            console.error('[WAHA Webhook] Send error:', await replyRes.text());
        } else {
            console.log('[WAHA Webhook] Reply sent.');
        }

        return res.status(200).json({ success: true });

    } catch (error: any) {
        console.error('[WAHA Webhook] Fatal Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
