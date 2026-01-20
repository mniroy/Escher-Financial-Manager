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
                message: `Session "${session}" not found. Available: ${Array.isArray(data) ? data.map(s => s.name).join(', ') : 'unknown'}`
            });
        }

        return res.status(200).json({
            status: currentSession.status, // e.g., 'WORKING', 'SCAN_QR_CODE', 'STOPPED'
            message: currentSession.status === 'WORKING' ? 'Healthy' : `Status: ${currentSession.status}`
        });

    } catch (error: any) {
        return res.status(200).json({
            status: 'offline',
            message: error.message
        });
    }
}
