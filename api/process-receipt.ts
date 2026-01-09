import type { VercelRequest, VercelResponse } from '@vercel/node';

// Google Genai imports
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Google Drive API
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

// Google Sheets API
const SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

// Month names for folder naming
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// Budget categories (must match frontend)
const BUDGET_CATEGORIES = [
    'Asset Aquire', 'Bill', 'Debt Payment', 'Education', 'Food',
    'Grocery', 'Home Maintenance', 'Mortgage', 'Shopping',
    'Tax', 'Transportation', 'Vacation', 'Other'
];

interface AnalysisResult {
    amount: number;
    merchant: string;
    date: string;
    category: string;
}

interface ProcessedExpense {
    id: string;
    date: string;
    category: string;
    description: string;
    amount: number;
    receiptUrl: string;
}

// ============= GEMINI AI ANALYSIS =============

async function analyzeReceipt(base64Image: string, mimeType: string, apiKey: string): Promise<AnalysisResult> {
    const categoriesList = BUDGET_CATEGORIES.join(', ');

    const requestBody = {
        contents: [{
            parts: [
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Image
                    }
                },
                {
                    text: `Analyze this receipt/order confirmation image. Extract the final total amount paid, merchant name, date, and category.

CRITICAL - AMOUNT EXTRACTION:
- This is Indonesian Rupiah (IDR) currency
- In Indonesian format, DOTS (.) are THOUSAND separators, NOT decimals
- Examples: "Rp134.100" = 134100, "Rp1.500.000" = 1500000, "Rp50.000" = 50000
- Look for "Total Pesanan", "Grand Total", "Total Pembayaran", or similar
- Return the amount as a plain NUMBER without dots or currency symbols
- The amount should typically be in thousands or hundreds of thousands

CATEGORY - Use EXACTLY one of: [${categoriesList}]
- Food = restaurants, cafes, food delivery
- Grocery = supermarkets, grocery stores  
- Shopping = retail, e-commerce (Shopee, Tokopedia, etc.), general purchases
- Transportation = taxi, Grab, Gojek rides, gas, tolls
- Bill = utilities, subscriptions, services
- If unsure, use "Other"

DATE: Return in YYYY-MM-DD format. Look for order date or transaction date.

MERCHANT: Extract the store/seller name.

Return JSON: {"amount": number, "merchant": string, "date": string, "category": string}`
                }
            ]
        }],
        generationConfig: {
            responseMimeType: "application/json"
        }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
        throw new Error('No response from Gemini AI');
    }

    return JSON.parse(text) as AnalysisResult;
}

// ============= GOOGLE DRIVE UPLOAD =============

async function findFolder(accessToken: string, folderName: string, parentId?: string): Promise<string | null> {
    let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    }

    const response = await fetch(
        `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    return data.files?.[0]?.id || null;
}

async function createFolder(accessToken: string, folderName: string, parentId?: string): Promise<string> {
    const metadata: any = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) metadata.parents = [parentId];

    const response = await fetch(`${DRIVE_API_URL}/files`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
    });

    if (!response.ok) {
        // Race condition: folder might have been created by another request
        const existingId = await findFolder(accessToken, folderName, parentId);
        if (existingId) return existingId;
        throw new Error(`Failed to create folder: ${folderName}`);
    }

    const data = await response.json();
    return data.id;
}

async function ensureFolder(accessToken: string, folderName: string, parentId?: string): Promise<string> {
    const existingId = await findFolder(accessToken, folderName, parentId);
    if (existingId) return existingId;
    return await createFolder(accessToken, folderName, parentId);
}

async function uploadToDrive(
    accessToken: string,
    base64Data: string,
    mimeType: string,
    fileName: string,
    expenseDate: Date
): Promise<string> {
    // Create folder structure: Escher Finance Manager / Year / Month
    const rootFolderId = await ensureFolder(accessToken, 'Escher Finance Manager');
    const yearFolderId = await ensureFolder(accessToken, expenseDate.getFullYear().toString(), rootFolderId);
    const monthFolderId = await ensureFolder(accessToken, MONTH_NAMES[expenseDate.getMonth()], yearFolderId);

    // Upload file
    const metadata = {
        name: fileName,
        mimeType: mimeType,
        parents: [monthFolderId],
    };

    // Convert base64 to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([bytes], { type: mimeType }));

    const uploadResponse = await fetch(DRIVE_UPLOAD_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
    });

    if (!uploadResponse.ok) {
        throw new Error('Failed to upload to Google Drive');
    }

    const fileData = await uploadResponse.json();
    const fileId = fileData.id;

    // Make file publicly viewable
    await fetch(`${DRIVE_API_URL}/files/${fileId}/permissions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });

    return `https://drive.google.com/file/d/${fileId}/view`;
}

// ============= GOOGLE SHEETS APPEND =============

async function appendToSheet(
    accessToken: string,
    spreadsheetId: string,
    expense: ProcessedExpense
): Promise<void> {
    const row = [
        expense.id,
        expense.date,
        expense.category,
        expense.description,
        expense.amount,
        expense.receiptUrl,
        '' // budgetItemName (empty for API-created expenses)
    ];

    const response = await fetch(
        `${SHEETS_API_URL}/${spreadsheetId}/values/Expenses!A:G:append?valueInputOption=USER_ENTERED`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values: [row] }),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to append to Google Sheets: ${errorText}`);
    }
}

// ============= MAIN API HANDLER =============

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    // API Key authentication
    const apiKey = req.headers['x-api-key'];
    const expectedApiKey = process.env.RECEIPT_API_KEY;

    if (!expectedApiKey || apiKey !== expectedApiKey) {
        return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    // Get Gemini API key from environment
    const geminiApiKey = process.env.API_KEY;
    if (!geminiApiKey) {
        return res.status(500).json({ success: false, error: 'Gemini API key not configured' });
    }

    try {
        const { base64Image, mimeType, accessToken, spreadsheetId } = req.body;

        // Validate required fields
        if (!base64Image || !mimeType || !accessToken || !spreadsheetId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: base64Image, mimeType, accessToken, spreadsheetId'
            });
        }

        // 1. Analyze receipt with Gemini
        const analysis = await analyzeReceipt(base64Image, mimeType, geminiApiKey);

        const expenseDate = analysis.date || new Date().toISOString().split('T')[0];
        const description = analysis.merchant || 'Receipt Expense';
        const category = BUDGET_CATEGORIES.includes(analysis.category) ? analysis.category : 'Other';

        // 2. Generate expense ID
        const dateSlug = expenseDate.replace(/-/g, '');
        const descSlug = description.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
        const expenseId = `${dateSlug}-${category.replace(/\s+/g, '')}-${descSlug}`;

        // 3. Upload receipt to Google Drive
        const fileName = `receipt-${expenseId}.${mimeType.split('/')[1] || 'jpg'}`;
        const receiptUrl = await uploadToDrive(
            accessToken,
            base64Image,
            mimeType,
            fileName,
            new Date(expenseDate)
        );

        // 4. Create expense object
        const expense: ProcessedExpense = {
            id: expenseId,
            date: expenseDate,
            category: category,
            description: description,
            amount: analysis.amount,
            receiptUrl: receiptUrl
        };

        // 5. Append to Google Sheets
        await appendToSheet(accessToken, spreadsheetId, expense);

        // 6. Return success
        return res.status(200).json({
            success: true,
            expense: expense
        });

    } catch (error: any) {
        console.error('Process receipt error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
}
