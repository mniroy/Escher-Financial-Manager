import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const wahaUrl = process.env.WAHA_API_URL?.replace(/\/$/, '');
    const wahaKey = process.env.WAHA_API_KEY;
    const session = process.env.WAHA_SESSION || 'default';

    if (!wahaUrl) {
        return res.status(200).json({
            status: 'unconfigured',
            message: 'WAHA_API_URL not set'
        });
    }

    try {
        // Check session status
        const response = await fetch(`${wahaUrl}/api/sessions?name=${session}`, {
            headers: { 'X-Api-Key': wahaKey || '' }
        });

        if (!response.ok) {
            return res.status(200).json({
                status: 'error',
                message: `WAHA returned ${response.status}`
            });
        }

        const data = await response.json();
        const currentSession = Array.isArray(data)
            ? data.find((s: any) => s.name === session)
            : (data.name === session ? data : null);

        if (!currentSession) {
            return res.status(200).json({
                status: 'disconnected',
                message: `Session "${session}" not found.`
            });
        }

        if (currentSession.status !== 'WORKING') {
            return res.status(200).json({
                status: currentSession.status,
                message: `WhatsApp session is ${currentSession.status}`
            });
        }

        // Session is WORKING, now check if Webhook is configured
        try {
            const webhookRes = await fetch(`${wahaUrl}/api/webhooks`, {
                headers: { 'X-Api-Key': wahaKey || '' }
            });

            if (webhookRes.ok) {
                const webhooks = await webhookRes.json();
                const host = req.headers.host || '';
                // Look for a webhook that matches our endpoint
                const hasOurWebhook = webhooks.some((w: any) =>
                    w.url.includes('/api/webhook/waha') &&
                    (w.events.includes('message') || w.events.includes('message.upsert') || w.events.includes('message.any'))
                );

                if (!hasOurWebhook) {
                    return res.status(200).json({
                        status: 'NO_WEBHOOK',
                        message: 'Session active, but Webhook is not configured in WAHA'
                    });
                }
            }
        } catch (e) {
            console.warn('[Status] Could not verify webhooks');
        }

        return res.status(200).json({
            status: 'WORKING',
            message: 'Healthy: Session active and Webhook detected'
        });

    } catch (error: any) {
        return res.status(200).json({
            status: 'offline',
            message: error.message
        });
    }
}
