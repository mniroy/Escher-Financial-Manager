import type { VercelRequest, VercelResponse } from '@vercel/node';

// API URLs
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const BUDGET_CATEGORIES = ['Asset Aquire', 'Bill', 'Debt Payment', 'Education', 'Food', 'Grocery', 'Home Maintenance', 'Mortgage', 'Shopping', 'Tax', 'Transportation', 'Vacation', 'Other'];

interface AnalysisResult { amount: number; merchant: string; date: string; category: string; }
interface ProcessedExpense { id: string; date: string; category: string; description: string; amount: number; receiptUrl: string; }

// Helper to clean base64 data (removes prefixes and leading/trailing garbage)
function cleanBase64(base64: string): string {
    return base64
        .replace(/^data:image\/[a-z]+;base64,/, '') // Remove data URI prefix
        .replace(/^=/, '')                          // Remove accidental leading '='
        .trim();                                     // Remove any whitespace
}

// ============= GEMINI AI ANALYSIS =============
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

// ============= GOOGLE DRIVE =============
async function findFolder(token: string, name: string, parentId?: string): Promise<string | null> {
    let q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) q += ` and '${parentId}' in parents`;
    const res = await fetch(`${DRIVE_API_URL}/files?q=${encodeURIComponent(q)}&fields=files(id)`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return data.files?.[0]?.id || null;
}

async function createFolder(token: string, name: string, parentId?: string): Promise<string> {
    const res = await fetch(`${DRIVE_API_URL}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parentId && { parents: [parentId] }) })
    });
    if (!res.ok) {
        const existing = await findFolder(token, name, parentId);
        if (existing) return existing;
        throw new Error('Failed to create folder');
    }
    return (await res.json()).id;
}

async function ensureFolder(token: string, name: string, parentId?: string): Promise<string> {
    return await findFolder(token, name, parentId) || await createFolder(token, name, parentId);
}

async function uploadToDrive(token: string, base64: string, mime: string, fileName: string, date: Date): Promise<string> {
    const root = await ensureFolder(token, 'Escher Finance Manager');
    const year = await ensureFolder(token, date.getFullYear().toString(), root);
    const month = await ensureFolder(token, MONTH_NAMES[date.getMonth()], year);

    // Node.js compatible way to convert base64 to bytes
    const bytes = Buffer.from(base64, 'base64');

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: fileName, mimeType: mime, parents: [month] })], { type: 'application/json' }));
    form.append('file', new Blob([bytes], { type: mime }));

    const res = await fetch(DRIVE_UPLOAD_URL, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    if (!res.ok) throw new Error('Drive upload failed');
    const fileId = (await res.json()).id;

    await fetch(`${DRIVE_API_URL}/files/${fileId}/permissions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    return `https://drive.google.com/file/d/${fileId}/view`;
}

// ============= GOOGLE SHEETS =============
async function appendToSheet(token: string, sheetId: string, expense: ProcessedExpense): Promise<void> {
    const row = [expense.id, expense.date, expense.category, expense.description, expense.amount, expense.receiptUrl, ''];
    const res = await fetch(`${SHEETS_API_URL}/${sheetId}/values/Expenses!A:G:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [row] })
    });
    if (!res.ok) throw new Error(`Sheets error: ${await res.text()}`);
}

// Helper to read raw body if Vercel doesn't parse it
async function getRawBody(req: VercelRequest): Promise<string> {
    if (req.body && typeof req.body !== 'string') return JSON.stringify(req.body);
    if (typeof req.body === 'string') return req.body;

    return new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => { resolve(body); });
    });
}

// ============= MAIN HANDLER =============
export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Debug logging
    console.log('--- Request Debug ---');
    console.log('Method:', req.method);
    console.log('Headers:', JSON.stringify(req.headers));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

    // API Key authentication
    const apiKey = req.headers['x-api-key'];
    if (!process.env.RECEIPT_API_KEY || apiKey !== process.env.RECEIPT_API_KEY) {
        return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    // Get Google OAuth token
    const authHeader = req.headers['authorization'] as string;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Missing Authorization header (Bearer token)' });
    }
    const googleAccessToken = authHeader.replace('Bearer ', '');

    const geminiKey = process.env.API_KEY;
    if (!geminiKey) return res.status(500).json({ success: false, error: 'Gemini API key not configured' });

    try {
        // Read body manually to be bulletproof
        const rawBody = await getRawBody(req);
        console.log('Raw Body Length:', rawBody?.length || 0);

        if (!rawBody || rawBody === '{}' || rawBody === '') {
            return res.status(400).json({ success: false, error: 'Request body is empty' });
        }

        let body;
        try {
            body = JSON.parse(rawBody);
        } catch (e) {
            return res.status(400).json({ success: false, error: 'Request body is not valid JSON' });
        }

        const { base64Image, mimeType, spreadsheetId } = body;
        if (!base64Image || !mimeType || !spreadsheetId) {
            const missing = [];
            if (!base64Image) missing.push('base64Image');
            if (!mimeType) missing.push('mimeType');
            if (!spreadsheetId) missing.push('spreadsheetId');
            return res.status(400).json({ success: false, error: `Missing fields: ${missing.join(', ')}` });
        }

        const analysis = await analyzeReceipt(base64Image, mimeType, geminiKey);
        const expenseDate = analysis.date || new Date().toISOString().split('T')[0];
        const description = analysis.merchant || 'Receipt';
        const category = BUDGET_CATEGORIES.includes(analysis.category) ? analysis.category : 'Other';

        const dateSlug = expenseDate.replace(/-/g, '');
        const descSlug = description.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
        const expenseId = `${dateSlug}-${category.replace(/\s+/g, '')}-${descSlug}`;

        const receiptUrl = await uploadToDrive(googleAccessToken, base64Image, mimeType, `receipt-${expenseId}.jpg`, new Date(expenseDate));

        const expense: ProcessedExpense = { id: expenseId, date: expenseDate, category, description, amount: analysis.amount, receiptUrl };
        await appendToSheet(googleAccessToken, spreadsheetId, expense);

        return res.status(200).json({ success: true, expense });
    } catch (error: any) {
        console.error('Full Error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Internal error' });
    }
}
