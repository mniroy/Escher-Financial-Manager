import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Simple endpoint that returns the OAuth token from the Authorization header.
 * Used by n8n to extract the Google OAuth token from its credentials.
 * 
 * n8n calls this with OAuth credentials → we return the token → n8n uses it for other APIs
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const authHeader = req.headers['authorization'] as string;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(400).json({
            success: false,
            error: 'No Bearer token in Authorization header'
        });
    }

    const token = authHeader.replace('Bearer ', '');

    return res.status(200).json({
        success: true,
        access_token: token
    });
}
