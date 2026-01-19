import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeReceipt, analyzeIncome } from '../_lib/analysis.js';
import { refreshGoogleToken, findOrCreateFolder, uploadToDrive, appendToSheet } from '../_lib/google.js';
import { IncomeEntry } from '../../types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log('[WAHA Webhook] Received request');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get config from environment variables
    const wahaUrl = process.env.WAHA_API_URL?.replace(/\/$/, '');
    const wahaKey = process.env.WAHA_API_KEY;
    const session = process.env.WAHA_SESSION || 'default';
    const allowedReceiptSenders = (process.env.WAHA_ALLOWED_SENDERS_RECEIPT || process.env.WAHA_ALLOWED_SENDERS || '').split(',').map(id => id.trim()).filter(Boolean);
    const allowedIncomeSenders = (process.env.WAHA_ALLOWED_SENDERS_INCOME || '').split(',').map(id => id.trim()).filter(Boolean);

    if (!wahaUrl) {
        console.error('[WAHA Webhook] Missing WAHA_API_URL env');
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    // Get user-specific config from query (refresh token, spreadsheet ID)
    let userConfig: { rt?: string; sid?: string } = {};
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

    // Determine message type and sender authorization
    const isIncomeSender = allowedIncomeSenders.includes(chatId);
    const isReceiptSender = allowedReceiptSenders.includes(chatId);

    if (!isIncomeSender && !isReceiptSender) {
        console.log('[WAHA Webhook] Unauthorized sender:', chatId);
        return res.status(200).json({ status: 'ignored' });
    }

    const messageText = payload.body || payload.message?.conversation || payload.message?.extendedTextMessage?.text || '';

    if (!hasMedia && !isIncomeSender) {
        return res.status(200).json({ status: 'ignored' });
    }

    console.log('[WAHA Webhook] Image detected:', messageId);

    try {
        const geminiKey = process.env.API_KEY;
        let base64Image: string | null = null;
        let mimeType: string | null = null;

        // --- 3. Handle Media if present ---
        if (hasMedia) {
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

            if (mediaResponse.ok) {
                const buffer = await mediaResponse.arrayBuffer();
                base64Image = Buffer.from(buffer).toString('base64');
                mimeType = mediaResponse.headers.get('content-type') || 'image/jpeg';
            }
        }

        let report = '';
        let logStatus = 'Not Logged';

        // --- 4. Analyze & Log ---
        if (isIncomeSender) {
            console.log('[WAHA Webhook] Processing Income:', messageId);
            const analysis = await analyzeIncome(messageText, base64Image, mimeType, geminiKey!);

            if (userConfig.rt && userConfig.sid) {
                try {
                    const googleToken = await refreshGoogleToken(userConfig.rt);
                    await appendToSheet(googleToken, userConfig.sid, 'Income!A2', [
                        analysis.date, analysis.month, analysis.person, analysis.source,
                        analysis.category, analysis.baseIncome, analysis.allowance,
                        analysis.totalIncome, analysis.deduction, analysis.takeHomePay,
                        analysis.paymentMethod
                    ]);
                    logStatus = '✅ Logged to Income Sheet';
                } catch (err: any) {
                    console.error('[WAHA Webhook] Income Logging Error:', err);
                    logStatus = `⚠️ Logging Failed: ${err.message}`;
                }
            }

            report = `💰 *Income Recorded*
👤 ${analysis.person}
🏢 ${analysis.source}
📂 ${analysis.category}
💵 Rp ${analysis.takeHomePay.toLocaleString('id-ID')}
📅 ${analysis.date}
💳 ${analysis.paymentMethod}

${logStatus}`;

        } else if (isReceiptSender && base64Image) {
            console.log('[WAHA Webhook] Processing Receipt:', messageId);
            const analysis = await analyzeReceipt(base64Image, mimeType!, geminiKey!);

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
                    const receiptUrl = await uploadToDrive(googleToken, monthId, base64Image, fileName, mimeType!);

                    const id = `${analysis.date.replace(/-/g, '')}-${analysis.category.replace(/\s+/g, '')}-${analysis.merchant.toLowerCase().substring(0, 10)}`;
                    await appendToSheet(googleToken, userConfig.sid, 'Expenses!A2', [
                        id, analysis.date, analysis.category, analysis.merchant, analysis.amount, receiptUrl, ''
                    ]);
                    logStatus = '✅ Logged to Expenses & Drive';
                } catch (err: any) {
                    console.error('[WAHA Webhook] Receipt Logging Error:', err);
                    logStatus = `⚠️ Logging Failed: ${err.message}`;
                }
            }

            report = `📄 *Receipt Analyzed*
💰 Rp ${analysis.amount.toLocaleString('id-ID')}
🏪 ${analysis.merchant}
📅 ${analysis.date}
📂 ${analysis.category}

${logStatus}`;
        } else {
            return res.status(200).json({ status: 'ignored', reason: 'no_media_for_receipt' });
        }

        // --- 5. Confirmation Reply ---
        console.log('[WAHA Webhook] Step 5: Waiting 2s before reply...');
        await new Promise(r => setTimeout(r, 2000));

        try {
            await fetch(`${wahaUrl}/api/sendSeen`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Api-Key': wahaKey || '' },
                body: JSON.stringify({ chatId, session, messageIds: [messageId] })
            });
        } catch (e) {
            console.warn('[WAHA Webhook] sendSeen failed');
        }

        console.log('[WAHA Webhook] Sending reply...');
        const replyRes = await fetch(`${wahaUrl}/api/sendText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': wahaKey || '' },
            body: JSON.stringify({ chatId, text: report, session, linkPreview: true })
        });

        if (!replyRes.ok) {
            console.error('[WAHA Webhook] Send error:', await replyRes.text());
        }

        return res.status(200).json({ success: true });

    } catch (error: any) {
        console.error('[WAHA Webhook] Fatal Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
