import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeReceipt } from '../_lib/analysis';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // 1. Decode Smart Config
    const configRaw = req.query.c as string;
    if (!configRaw) return res.status(401).json({ error: 'Missing configuration' });

    let config: { w: string; k: string; s: string; a: string; ps: any };
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
        const wahaKey = config.k;
        const session = config.s || 'default';

        // 3. Download Media for Analysis
        const messageId = message.key.id;
        const mediaResponse = await fetch(`${wahaUrl}/api/${session}/messages/${messageId}/download`, {
            headers: { 'X-Api-Key': wahaKey || '' }
        });
        if (!mediaResponse.ok) throw new Error(`Media download failed: ${mediaResponse.statusText}`);

        const buffer = await mediaResponse.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString('base64');
        const mimeType = imageMsg.mimetype || 'image/jpeg';

        // 4. Analyze with Gemini
        const analysis = await analyzeReceipt(base64Image, mimeType, geminiKey!);

        // 5. Trigger Push Notification to App
        // NOTE: We don't send the full base64 in the push payload (4KB limit).
        // Instead, the app will download it from WAHA using the messageId.
        if (config.ps) {
            try {
                const host = req.headers.host || 'escher-financial-manager.vercel.app';
                const protocol = host.includes('localhost') ? 'http' : 'https';
                const appUrl = `${protocol}://${host}`;

                await fetch(`${appUrl}/api/send-notification`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subscription: config.ps,
                        title: 'Receipt Analyzed!',
                        body: `Detected Rp ${analysis.amount.toLocaleString()} at ${analysis.merchant}. Tap to log it!`,
                        url: `/?wa_expense=${btoa(JSON.stringify({ ...analysis, messageId, mimeType }))}`
                    })
                });
            } catch (pError) {
                console.error('Push failed:', pError);
            }
        }

        // 6. Report Back to WhatsApp
        const report = `✅ *Receipt Processed*

💰 *Amount:* Rp ${analysis.amount.toLocaleString('id-ID')}
shop *Merchant:* ${analysis.merchant}
📂 *Category:* ${analysis.category}

_A notification was sent to your phone. Tap it to confirm and log this expense to your sheet!_`;

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
                headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.k || '' },
                body: JSON.stringify({ chatId, text: `❌ *Error:* ${error.message}`, session: config.s || 'default' })
            });
        } catch (e) { }
        return res.status(500).json({ error: error.message });
    }
}
