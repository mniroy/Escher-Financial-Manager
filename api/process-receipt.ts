import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeReceipt } from './_lib/analysis.js';

// Constants for normalization
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

// Read raw body helper
async function getRawBody(req: VercelRequest): Promise<string> {
    if (req.body && typeof req.body !== 'string') return JSON.stringify(req.body);
    if (typeof req.body === 'string') return req.body;
    return new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => { resolve(body); });
    });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    // API Key authentication
    const apiKey = req.headers['x-api-key'];
    if (!process.env.RECEIPT_API_KEY || apiKey !== process.env.RECEIPT_API_KEY) {
        return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    const geminiKey = process.env.API_KEY;
    if (!geminiKey) return res.status(500).json({ success: false, error: 'Gemini API key not configured' });

    try {
        const rawBody = await getRawBody(req);
        if (!rawBody) return res.status(400).json({ success: false, error: 'Request body is empty' });

        const body = JSON.parse(rawBody);
        const { base64Image, mimeType } = body;

        if (!base64Image || !mimeType) {
            return res.status(400).json({ success: false, error: 'Missing base64Image or mimeType' });
        }

        // Analyze receipt with Gemini
        const analysis = await analyzeReceipt(base64Image, mimeType, geminiKey);

        // Normalize response
        const expenseDate = analysis.date || new Date().toISOString().split('T')[0];
        const merchant = analysis.merchant || 'Unknown';
        const amount = analysis.amount || 0;
        const category = analysis.category;

        // Generate expense ID
        const dateSlug = expenseDate.replace(/-/g, '');
        const descSlug = merchant.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
        const expenseId = `${dateSlug}-${category.replace(/\s+/g, '')}-${descSlug}`;

        return res.status(200).json({
            success: true,
            data: {
                id: expenseId,
                date: expenseDate,
                category: category,
                merchant: merchant,
                amount: amount,
                base64Image: base64Image,
                mimeType: mimeType
            }
        });
    } catch (error: any) {
        console.error('API Error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Internal error' });
    }
}
