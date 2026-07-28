import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeReceipt, analyzeIncome } from '../_lib/analysis.js';
import { refreshGoogleToken, findOrCreateFolder, uploadToDrive, appendToSheet, getSheetValues, ensureSheetExists } from '../_lib/google.js';
import { IncomeEntry } from '../../types';

// In-memory caches to prevent duplicate webhook delivery, retries, and duplicate WhatsApp replies
const processedMessageIds = new Set<string>();
const recentReplies = new Map<string, number>();

const isRecentlyReplied = (key: string, ttlMs = 60000): boolean => {
    const now = Date.now();
    const last = recentReplies.get(key);
    if (last && now - last < ttlMs) {
        return true;
    }
    recentReplies.set(key, now);
    if (recentReplies.size > 200) {
        for (const [k, t] of recentReplies.entries()) {
            if (now - t >= ttlMs) recentReplies.delete(k);
        }
    }
    return false;
};

const parseSheetAmount = (val: any): number => {
    if (typeof val === 'number') return Math.round(val);
    if (typeof val === 'string') {
        const cleanStr = val.replace(/[,.]00$/, '').replace(/[^0-9]/g, '');
        return parseInt(cleanStr, 10) || 0;
    }
    return 0;
};

const normalizeMerchant = (m: string): string => {
    const cleaned = (m || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleaned || (m || '').trim().toLowerCase();
};

const isMerchantMatch = (m1: string, m2: string): boolean => {
    const n1 = normalizeMerchant(m1);
    const n2 = normalizeMerchant(m2);
    if (!n1 || !n2) return false;
    if (n1 === n2) return true;
    if (n1.length >= 4 && n2.length >= 4) {
        return n1.includes(n2) || n2.includes(n1);
    }
    return false;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log('[WAHA Webhook] Received request');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get config from environment variables
    const envWahaUrl = process.env.WAHA_API_URL?.replace(/\/$/, '');
    const envWahaKey = process.env.WAHA_API_KEY;
    const envWahaSession = process.env.WAHA_SESSION || 'default';

    // Get user-specific config from query (refresh token, spreadsheet ID, engine, etc)
    let userConfig: { rt?: string; sid?: string; eng?: 'waha' | 'gowa'; apiUrl?: string; session?: string; gowaUsername?: string; gowaPassword?: string; ars?: string; ais?: string } = {};
    const configRaw = req.query.c as string;
    if (configRaw) {
        try {
            userConfig = JSON.parse(Buffer.from(configRaw, 'base64').toString());
        } catch (e) {
            console.warn('[WAHA Webhook] Could not decode user config');
        }
    }

    const allowedReceiptSenders = (userConfig.ars || process.env.WAHA_ALLOWED_SENDERS_RECEIPT || process.env.WAHA_ALLOWED_SENDERS || '').split(',').map(id => id.trim()).filter(Boolean);
    const allowedIncomeSenders = (userConfig.ais || process.env.WAHA_ALLOWED_SENDERS_INCOME || '').split(',').map(id => id.trim()).filter(Boolean);

    const engine = userConfig.eng || 'waha';
    const baseUrl = (userConfig.apiUrl || (engine === 'waha' ? envWahaUrl : process.env.GOWA_API_URL))?.replace(/\/$/, '');
    const wahaKey = envWahaKey;
    const session = userConfig.session || (engine === 'waha' ? envWahaSession : '1');
    const auth = engine === 'gowa'
        ? (userConfig.gowaUsername && userConfig.gowaPassword
            ? Buffer.from(`${userConfig.gowaUsername}:${userConfig.gowaPassword}`).toString('base64')
            : Buffer.from(`${process.env.GOWA_USERNAME || ''}:${process.env.GOWA_PASSWORD || ''}`).toString('base64'))
        : '';

    if (!baseUrl) {
        console.error('[WAHA Webhook] Missing API URL');
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    const body = req.body;
    const eventName = body.event;

    const payload = body.payload || body.data || body;
    const messageId = payload.id || payload.key?.id;
    const fromMe = payload.fromMe || payload.key?.fromMe;
    const chatId = payload.from || payload.key?.remoteJid || payload.chat_id || payload.peer_id;
    const hasMedia = payload.hasMedia || !!(payload.message?.imageMessage) || !!(payload.image) || !!(payload.file);

    if (!chatId || !messageId) {
        return res.status(200).json({ status: 'error', reason: 'malformed_payload' });
    }

    // WAHA Webhook Event Deduplication Rules:
    // 1. For incoming messages from others (!fromMe): WAHA fires both 'message' and 'message.any'.
    //    We ONLY process 'message' and ignore 'message.any' to avoid double processing.
    // 2. For outgoing messages sent by self/bot (fromMe): WAHA fires 'message.any' on creation (ack=0 or undefined)
    //    and on every ACK change (ack=1, ack=2). We ONLY process 'message.any' when ack is 0 or undefined.
    if (!fromMe && eventName !== 'message') {
        console.log(`[WAHA Webhook] Ignoring event "${eventName}" for incoming message:`, messageId);
        return res.status(200).json({ status: 'ignored', reason: 'incoming_requires_message_event' });
    }
    if (fromMe && eventName !== 'message.any') {
        console.log(`[WAHA Webhook] Ignoring event "${eventName}" for outgoing message:`, messageId);
        return res.status(200).json({ status: 'ignored', reason: 'outgoing_requires_message_any_event' });
    }

    // Ignore ACK status updates (when WAHA notifies that a sent message reached server/device/read, ack >= 1)
    const ack = payload.ack ?? payload.key?.ack ?? body.ack;
    if (fromMe && typeof ack === 'number' && ack >= 1) {
        console.log(`[WAHA Webhook] Ignoring ack status update (ack=${ack}) for messageId:`, messageId);
        return res.status(200).json({ status: 'ignored', reason: 'fromme_ack_update_ignored' });
    }
    if (!fromMe && typeof ack === 'number' && ack >= 2) {
        console.log(`[WAHA Webhook] Ignoring incoming ack status update (ack=${ack}) for messageId:`, messageId);
        return res.status(200).json({ status: 'ignored', reason: 'incoming_ack_update_ignored' });
    }

    // Deduplicate webhook retries / duplicate deliveries by messageId and timestamp
    const dedupKey = `${chatId}_${messageId}`;
    if (processedMessageIds.has(dedupKey)) {
        console.log('[WAHA Webhook] Duplicate messageId ignored:', dedupKey);
        return res.status(200).json({ status: 'ignored', reason: 'duplicate_message_id' });
    }
    processedMessageIds.add(dedupKey);
    if (processedMessageIds.size > 500) {
        const first = processedMessageIds.values().next().value;
        if (first) processedMessageIds.delete(first);
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

    console.log('[WAHA Webhook] Processing messageId:', messageId, '| event:', eventName, '| fromMe:', fromMe);

    // Persistent Cross-Instance Deduplication using Google Sheets (auto-creates Locks sheet if needed)
    // Write-First pattern: both instances write a nonce, wait 2s, then check who wrote first.
    // First row (lowest row number) = winner. Others bail out.
    if (userConfig.rt && userConfig.sid) {
        const lockNonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        try {
            const lockToken = await refreshGoogleToken(userConfig.rt);
            // Auto-create the Locks sheet if it doesn't exist
            await ensureSheetExists(lockToken, userConfig.sid, 'Locks');
            // Step 1: Write this instance's claim entry and get the row number it landed on
            const myRow = await appendToSheet(lockToken, userConfig.sid, 'Locks!A2', [messageId, lockNonce, new Date().toISOString()]);
            console.log(`[WAHA Webhook] Lock entry written at row ${myRow} with nonce ${lockNonce}`);
            // Step 2: Wait 2s for any concurrent instance to also write its claim
            await new Promise(r => setTimeout(r, 2000));
            // Step 3: Read all lock entries for this messageId
            const allLocks = await getSheetValues(lockToken, userConfig.sid, 'Locks!A2:C');
            const msgLocks = allLocks.filter(row => row && row[0] === messageId);
            if (msgLocks.length > 1) {
                // Multiple instances raced. Winner = the one with the earliest (lowest) row index.
                // The first row in msgLocks corresponds to the earliest append (Google Sheets serializes appends).
                const winnerNonce = msgLocks[0][1];
                if (winnerNonce !== lockNonce) {
                    console.log(`[WAHA Webhook] Yielding to winner nonce=${winnerNonce}. Skipping processing for messageId:`, messageId);
                    return res.status(200).json({ status: 'ignored', reason: 'lock_yield_to_winner' });
                }
                console.log(`[WAHA Webhook] Winner! Proceeding for messageId:`, messageId);
            }
        } catch (lockErr) {
            // Lock failed (network, permissions, etc.) — proceed anyway but log it
            console.warn('[WAHA Webhook] Sheets lock failed, proceeding without lock:', lockErr);
        }
    }

    try {
        const geminiKey = process.env.API_KEY;
        let base64Image: string | null = null;
        let mimeType: string | null = null;

        // --- 3. Handle Media if present ---
        if (hasMedia) {
            let downloadUrl: string | null = null;
            let headers: any = {};

            if (engine === 'gowa') {
                downloadUrl = `${baseUrl}/message/${messageId}/download?phone=${encodeURIComponent(chatId)}`;
                headers = {
                    'Authorization': `Basic ${auth}`,
                    'X-Device-Id': session
                };
            } else {
                // WAHA Logic
                headers = { 'X-Api-Key': wahaKey || '' };
                if (payload.media?.url) {
                    downloadUrl = payload.media.url.startsWith('http') ? payload.media.url : `${baseUrl}${payload.media.url}`;
                } else {
                    const msgInfoRes = await fetch(`${baseUrl}/api/${session}/chats/${encodeURIComponent(chatId)}/messages/${messageId}?downloadMedia=true`, {
                        headers
                    });
                    if (msgInfoRes.ok) {
                        const msgInfo = await msgInfoRes.json();
                        const remoteMediaUrl = msgInfo.media?.url;
                        if (remoteMediaUrl) {
                            downloadUrl = remoteMediaUrl.startsWith('http') ? remoteMediaUrl : `${baseUrl}${remoteMediaUrl}`;
                        }
                    }
                }

                if (!downloadUrl) {
                    downloadUrl = `${baseUrl}/api/${session}/messages/${messageId}/download`;
                }
            }

            const mediaResponse = await fetch(downloadUrl!, { headers });

            if (mediaResponse.ok) {
                if (engine === 'gowa') {
                    const gowaData = await mediaResponse.json();
                    base64Image = gowaData.data; // GoWA returns base64 in "data" field
                    mimeType = gowaData.mime_type || 'image/jpeg';
                } else {
                    const buffer = await mediaResponse.arrayBuffer();
                    base64Image = Buffer.from(buffer).toString('base64');
                    mimeType = mediaResponse.headers.get('content-type') || 'image/jpeg';
                }
            } else {
                console.error(`[WAHA Webhook] Media download failed: ${mediaResponse.status}`, await mediaResponse.text());
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
📅 ${analysis.date}

➕ Gross: Rp ${analysis.totalIncome.toLocaleString('id-ID')}
➖ Deduct: Rp ${analysis.deduction.toLocaleString('id-ID')}
💵 *Net: Rp ${analysis.takeHomePay.toLocaleString('id-ID')}*

💳 ${analysis.paymentMethod}

${logStatus}`;

        } else if (isReceiptSender && base64Image) {
            console.log('[WAHA Webhook] Processing Receipt:', messageId);

            let customCategories: string[] = [];
            let googleToken: any = null;

            // Pre-fetch categories if we have user config
            if (userConfig.rt && userConfig.sid) {
                try {
                    googleToken = await refreshGoogleToken(userConfig.rt);
                    const budgetData = await getSheetValues(googleToken, userConfig.sid, 'Budget!A2:A');
                    // Extract non-empty categories
                    const cats = new Set<string>();
                    budgetData.forEach((row: any[]) => {
                        if (row[0]) cats.add(row[0]);
                    });
                    customCategories = Array.from(cats);
                } catch (e) {
                    console.warn('[WAHA Webhook] Failed to fetch custom categories:', e);
                }
            }

            const analysis = await analyzeReceipt(base64Image, mimeType!, geminiKey!, customCategories);

            let isDuplicate = false;
            let existingDate = '';
            let existingCategory = '';

            if (userConfig.rt && userConfig.sid) {
                try {
                    if (!googleToken) {
                        googleToken = await refreshGoogleToken(userConfig.rt);
                    }

                    // Check if this receipt was already entered in Expenses sheet
                    try {
                        const existingExpenses = await getSheetValues(googleToken, userConfig.sid, 'Expenses!A2:G');
                        const targetAmount = Math.round(analysis.amount || 0);
                        const targetDate = String(analysis.date || '').trim();

                        for (const row of existingExpenses) {
                            if (!row || row.length < 5) continue;
                            const rowDate = String(row[1] || '').trim();
                            const rowCategory = String(row[2] || '').trim();
                            const rowMerchant = String(row[3] || '');
                            const rowAmount = parseSheetAmount(row[4]);

                            if (rowDate === targetDate && rowAmount === targetAmount && isMerchantMatch(rowMerchant, analysis.merchant)) {
                                isDuplicate = true;
                                existingDate = rowDate;
                                existingCategory = rowCategory || analysis.category;
                                break;
                            }
                        }
                    } catch (e) {
                        console.warn('[WAHA Webhook] Failed to check existing expenses for duplicates:', e);
                    }

                    if (isDuplicate) {
                        console.log(`[WAHA Webhook] Duplicate receipt detected for merchant "${analysis.merchant}" on ${existingDate}`);
                        logStatus = `⚠️ Already entered on date ${existingDate}`;
                    } else {
                        const dateParts = (analysis.date || new Date().toISOString().split('T')[0]).split('-');
                        const rootId = await findOrCreateFolder(googleToken, 'Escher Finance Manager');
                        const yearId = await findOrCreateFolder(googleToken, dateParts[0], rootId);
                        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                        const monthName = months[parseInt(dateParts[1]) - 1] || 'Unknown';
                        const monthId = await findOrCreateFolder(googleToken, monthName, yearId);

                        const fileName = `receipt-${analysis.date}-${analysis.merchant.toLowerCase().replace(/[^a-z0-9]/g, '-')}.jpg`;
                        const receiptUrl = await uploadToDrive(googleToken, monthId, base64Image, fileName, mimeType!);

                        // Check for active Period Modes
                        let appliedPeriod = '';
                        try {
                            const periods = await getSheetValues(googleToken, userConfig.sid!, 'PeriodModes!A2:D');
                            const txDate = new Date(analysis.date);
                            for (const row of periods) {
                                // Row: [0:ID, 1:StartDate, 2:EndDate, 3:TargetPlan]
                                if (row.length >= 4) {
                                    const startDate = new Date(row[1]);
                                    const endDate = new Date(row[2]);
                                    if (txDate >= startDate && txDate <= endDate) {
                                        appliedPeriod = row[3]; // Target Plan Name
                                        break;
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('[WAHA Webhook] Failed to fetch periods:', e);
                        }

                        const id = `${analysis.date.replace(/-/g, '')}-${analysis.category.replace(/\s+/g, '')}-${analysis.merchant.toLowerCase().substring(0, 10)}`;
                        await appendToSheet(googleToken, userConfig.sid, 'Expenses!A2', [
                            id, analysis.date, analysis.category, analysis.merchant, analysis.amount, receiptUrl, appliedPeriod
                        ]);
                        logStatus = '✅ Logged to Expenses & Drive' + (appliedPeriod ? ` (Period: ${appliedPeriod})` : '');
                    }
                } catch (err: any) {
                    console.error('[WAHA Webhook] Receipt Logging Error:', err);
                    logStatus = `⚠️ Logging Failed: ${err.message}`;
                }
            }

            if (isDuplicate) {
                report = `⚠️ *Receipt Already Entered*
💰 Rp ${analysis.amount.toLocaleString('id-ID')}
🏪 ${analysis.merchant}
📅 ${existingDate || analysis.date}
📂 ${existingCategory || analysis.category}

ℹ️ Already entered on date ${existingDate || analysis.date}. Previous entry preserved.`;
            } else {
                report = `📄 *Receipt Analyzed*
💰 Rp ${analysis.amount.toLocaleString('id-ID')}
🏪 ${analysis.merchant}
📅 ${analysis.date}
📂 ${analysis.category}

${logStatus}`;
            }
        } else {
            console.log('[WAHA Webhook] No media for receipt, skipping reply.');
            return;
        }

        // --- 5. Confirmation Reply ---
        console.log('[WAHA Webhook] Step 5: Preparing reply...');

        try {
            if (engine === 'waha') {
                await fetch(`${baseUrl}/api/sendSeen`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Api-Key': wahaKey || '' },
                    body: JSON.stringify({ chatId, session, messageIds: [messageId] })
                });
            }
        } catch (e) {
            console.warn('[WAHA Webhook] sendSeen failed');
        }

        // Suppress duplicate WhatsApp replies to the same chat within 60 seconds (prevents double replies on WAHA retries)
        const replyDedupKey = `${chatId}_${report.trim().substring(0, 100)}`;
        if (isRecentlyReplied(replyDedupKey, 60000)) {
            console.log('[WAHA Webhook] Suppressing duplicate reply within 60s for:', replyDedupKey);
            return;
        }

        console.log(`[WAHA Webhook] Sending reply via ${engine.toUpperCase()}...`);
        let replyRes;
        if (engine === 'gowa') {
            replyRes = await fetch(`${baseUrl}/send/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${auth}`,
                    'X-Device-Id': session
                },
                body: JSON.stringify({ phone: chatId, message: report })
            });
        } else {
            replyRes = await fetch(`${baseUrl}/api/sendText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Api-Key': wahaKey || '' },
                body: JSON.stringify({ chatId, text: report, session, linkPreview: true })
            });
        }

        if (!replyRes.ok) {
            console.error('[WAHA Webhook] Send error:', await replyRes.text());
        }

    } catch (error: any) {
        console.error('[WAHA Webhook] Fatal Error:', error);
    }
}
