import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Get user-specific config from query (refresh token, spreadsheet ID, engine)
    let userConfig: { rt?: string; sid?: string; eng?: 'waha' | 'gowa'; apiUrl?: string; session?: string; gowaUsername?: string; gowaPassword?: string } = {};
    const configRaw = req.query.c as string;
    if (configRaw) {
        try {
            userConfig = JSON.parse(Buffer.from(configRaw, 'base64').toString());
        } catch (e) {
            console.warn('[Status Webhook] Could not decode user config');
        }
    }

    const engine = userConfig.eng || 'waha';
    const apiUrl = (userConfig.apiUrl || (engine === 'waha' ? process.env.WAHA_API_URL : process.env.GOWA_API_URL))?.replace(/\/$/, '');
    const wahaKey = process.env.WAHA_API_KEY;
    const session = userConfig.session || (engine === 'waha' ? (process.env.WAHA_SESSION || 'default') : '1');

    if (!apiUrl) {
        return res.status(200).json({
            status: 'unconfigured',
            message: `${engine.toUpperCase()}_API_URL not set`
        });
    }

    if (engine === 'gowa') {
        try {
            const auth = userConfig.gowaUsername && userConfig.gowaPassword
                ? Buffer.from(`${userConfig.gowaUsername}:${userConfig.gowaPassword}`).toString('base64')
                : Buffer.from(`${process.env.GOWA_USERNAME || ''}:${process.env.GOWA_PASSWORD || ''}`).toString('base64');

            const response = await fetch(`${apiUrl}/app/status`, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'X-Device-Id': session
                }
            });

            if (!response.ok) {
                return res.status(200).json({
                    status: 'error',
                    message: `GoWA returned ${response.status}`
                });
            }

            const data = await response.json();
            // GoWA status usually returns { is_connected: true, is_logged_in: true } if healthy
            if (data.is_connected && data.is_logged_in) {
                return res.status(200).json({
                    status: 'WORKING',
                    message: 'Healthy: GoWA Connected and Logged In'
                });
            } else if (!data.is_logged_in) {
                return res.status(200).json({
                    status: 'SCAN_QR_CODE',
                    message: 'GoWA: QR Code Needed or Session Expired'
                });
            } else {
                return res.status(200).json({
                    status: 'disconnected',
                    message: 'GoWA: Disconnected'
                });
            }
        } catch (error: any) {
            return res.status(200).json({
                status: 'offline',
                message: `GoWA Offline: ${error.message}`
            });
        }
    }

    // Default WAHA logic follows...
    const wahaUrl = apiUrl;


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
