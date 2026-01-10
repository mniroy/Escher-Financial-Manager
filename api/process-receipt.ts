import type { VercelRequest, VercelResponse } from '@vercel/node';

// Gemini API URL
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Budget categories for classification
const BUDGET_CATEGORIES = [
    'Asset Aquire', 'Bill', 'Debt Payment', 'Education', 'Food', 'Grocery',
    'Home Maintenance', 'Mortgage', 'Shopping', 'Tax', 'Transportation', 'Vacation', 'Other'
];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

interface AnalysisResult {
    amount: number;
    merchant: string;
    date: string;
    category: string;
}

// Helper to clean base64 data
function cleanBase64(base64: string): string {
    return base64
        .replace(/^data:image\/[a-z]+;base64,/, '')
        .replace(/^=/, '')
        .trim();
}

// Gemini AI Analysis
async function analyzeReceipt(base64Image: string, mimeType: string, apiKey: string): Promise<AnalysisResult> {
    const cleanData = cleanBase64(base64Image);
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { inlineData: { mimeType, data: cleanData } },
                    {
                        text: `Analyze this receipt. Extract total amount, merchant, date, category.
CRITICAL: Indonesian Rupiah - dots are THOUSAND separators (Rp134.100 = 134100).
Categories: ${BUDGET_CATEGORIES.join(', ')}. Return JSON: {"amount": number, "merchant": string, "date": "YYYY-MM-DD", "category": string}`
                    }
                ]
            }],
            generationConfig: { responseMimeType: "application/json" }
        })
    });
    if (!response.ok) throw new Error(`Gemini error: ${await response.text()}`);
    const data = await response.json();
    return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
}

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

// Main Handler - Only does Gemini analysis
// Google Drive and Sheets operations are handled by n8n
export default async function handler(req: VercelRequest, res: VercelResponse) {
    console.log('--- Request Debug ---');
    console.log('Method:', req.method);

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
        if (!rawBody || rawBody === '{}' || rawBody === '') {
            return res.status(400).json({ success: false, error: 'Request body is empty' });
        }

        let body;
        try {
            body = JSON.parse(rawBody);
        } catch (e) {
            return res.status(400).json({ success: false, error: 'Request body is not valid JSON' });
        }

        const { base64Image, mimeType } = body;
        if (!base64Image || !mimeType) {
            const missing = [];
            if (!base64Image) missing.push('base64Image');
            if (!mimeType) missing.push('mimeType');
            return res.status(400).json({ success: false, error: `Missing fields: ${missing.join(', ')}` });
        }

        // Analyze receipt with Gemini
        const analysis = await analyzeReceipt(base64Image, mimeType, geminiKey);

        // Normalize response
        const expenseDate = analysis.date || new Date().toISOString().split('T')[0];
        const merchant = analysis.merchant || 'Unknown';
        const category = BUDGET_CATEGORIES.includes(analysis.category) ? analysis.category : 'Other';
        const amount = typeof analysis.amount === 'number' ? analysis.amount : 0;

        // Parse date for folder info
        const dateParts = expenseDate.split('-');
        const year = dateParts[0];
        const monthIndex = parseInt(dateParts[1], 10) - 1;
        const month = MONTH_NAMES[monthIndex] || 'January';

        // Generate expense ID
        const dateSlug = expenseDate.replace(/-/g, '');
        const descSlug = merchant.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
        const expenseId = `${dateSlug}-${category.replace(/\s+/g, '')}-${descSlug}`;
        const fileName = `receipt-${expenseId}.jpg`;

        // Return analysis + metadata for n8n to use
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
        console.error('Full Error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Internal error' });
    }
}
