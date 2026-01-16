import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeReceipt } from '../_lib/analysis';
import { refreshGoogleToken, findOrCreateFolder, uploadToDrive, appendToSheet } from '../_lib/google';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // 1. Decode Smart Config
    const configRaw = req.query.c as string;
    if (!configRaw) return res.status(401).json({ error: 'Missing configuration' });

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
    if (body.event !== 'message.upsert') return res.status(200).json({ status: 'ignored' });

    const message = body.data;
    const chatId = message.key?.remoteJid;
    if (message.key?.fromMe) return res.status(200).json({ status: 'ignored' });

    // 2. Sender Filter
    if (config.a) {
        const allowed = config.a.split(',').map(id => id.trim());
        if (!allowed.includes(chatId)) return res.status(200).json({ status: 'ignored' });
    }

    const imageMsg = message.message?.imageMessage || message.message?.viewOnceMessageV2?.message?.imageMessage;
    if (!imageMsg) return res.status(200).json({ status: 'ignored' });

    try {
        const geminiKey = process.env.API_KEY;
        const wahaUrl = config.w;
        const wahaKey = process.env.WAHA_API_KEY; // Only use ENV for security
        const session = config.s || 'default';

        // 3. Download Media
        const mediaResponse = await fetch(`${wahaUrl}/api/${session}/messages/${message.key.id}/download`, {
            headers: { 'X-Api-Key': wahaKey || '' }
        });
        if (!mediaResponse.ok) throw new Error(`Media download failed: ${mediaResponse.statusText}`);

        const buffer = await mediaResponse.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString('base64');
        const mimeType = imageMsg.mimetype || 'image/jpeg';

        // 4. Analyze with Gemini
        const analysis = await analyzeReceipt(base64Image, mimeType, geminiKey!);

        let logStatus = 'Not Logged (No Refresh Token)';

        // 5. BACKGROUND LOGGING (Direct Google Auth via Refresh Token)
        if (config.rt && config.sid) {
            try {
                // Get a fresh access token from Google using the saved refresh token
                const googleToken = await refreshGoogleToken(config.rt);

                // Folder structure: Escher Finance Manager / Year / Month
                const date = new Date(analysis.date || new Date());
                const year = date.getFullYear().toString();
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const month = months[date.getMonth()];

                const rootId = await findOrCreateFolder(googleToken, 'Escher Finance Manager');
                const yearId = await findOrCreateFolder(googleToken, year, rootId);
                const monthId = await findOrCreateFolder(googleToken, month, yearId);

                // Upload Original To Drive
                const fileName = `receipt-${analysis.date}-${analysis.merchant.toLowerCase().replace(/[^a-z0-9]/g, '-')}.jpg`;
                const receiptUrl = await uploadToDrive(googleToken, monthId, base64Image, fileName, mimeType);

                // Append to Sheet
                // ID Format: DateSlug-Category-Merchant
                const id = `${analysis.date.replace(/-/g, '')}-${analysis.category.replace(/\s+/g, '')}-${analysis.merchant.toLowerCase().substring(0, 10)}`;

                await appendToSheet(googleToken, config.sid, 'Expenses!A2', [
                    id,
                    analysis.date,
                    analysis.category,
                    analysis.merchant,
                    analysis.amount,
                    receiptUrl,
                    '' // BudgetItemName (Empty for background logs by default)
                ]);

                logStatus = '✅ Successfully Logged to Google Sheets & Drive';
            } catch (logError: any) {
                console.error('Background logging failed:', logError);
                logStatus = `⚠️ Analyzed but Logging Failed: ${logError.message}`;
            }
        }

        // 6. Report Back to WhatsApp
        const report = `📄 *Receipt Analyzed*

💰 *Amount:* Rp ${analysis.amount.toLocaleString('id-ID')}
shop *Merchant:* ${analysis.merchant}
📅 *Date:* ${analysis.date}
📂 *Category:* ${analysis.category}

${logStatus}`;

        await fetch(`${wahaUrl}/api/sendText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': wahaKey || '' },
            body: JSON.stringify({ chatId, text: report, session })
        });

        return res.status(200).json({ success: true });

    } catch (error: any) {
        console.error('WAHA Error:', error);
        try {
            await fetch(`${config.w}/api/sendText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Api-Key': process.env.WAHA_API_KEY || '' },
                body: JSON.stringify({ chatId, text: `❌ *Error:* ${error.message}`, session: config.s || 'default' })
            });
        } catch (e) { }
        return res.status(500).json({ error: error.message });
    }
}
