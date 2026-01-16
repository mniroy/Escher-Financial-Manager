export interface AnalysisResult {
    amount: number;
    merchant: string;
    date: string;
    category: string;
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const BUDGET_CATEGORIES = [
    'Asset Aquire', 'Bill', 'Debt Payment', 'Education', 'Food', 'Grocery',
    'Home Maintenance', 'Mortgage', 'Shopping', 'Tax', 'Transportation', 'Vacation', 'Other'
];

function cleanBase64(base64: string): string {
    return base64
        .replace(/^data:image\/[a-z]+;base64,/, '')
        .replace(/^=/, '')
        .trim();
}

export async function analyzeReceipt(base64Image: string, mimeType: string, apiKey: string): Promise<AnalysisResult> {
    const cleanData = cleanBase64(base64Image);
    const currentDate = new Date().toISOString().split('T')[0];

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { inlineData: { mimeType, data: cleanData } },
                    {
                        text: `Analyze this receipt. Extract total amount, merchant, date, and category.
                        
CONTEXT:
- Today's date is ${currentDate}.
- Use this as reference when parsing the year (e.g., if you see "26", it's likely 2026).
- CRITICAL: Indonesian Rupiah - dots are THOUSAND separators (Rp134.100 = 134100).
- Categories: ${BUDGET_CATEGORIES.join(', ')}.

Return JSON: {"amount": number, "merchant": string, "date": "YYYY-MM-DD", "category": string}`
                    }
                ]
            }],
            generationConfig: { responseMimeType: "application/json" }
        })
    });
    if (!response.ok) throw new Error(`Gemini error: ${await response.text()}`);
    const data = await response.json();
    const result = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');

    // Normalize category
    if (!BUDGET_CATEGORIES.includes(result.category)) {
        result.category = 'Other';
    }

    return result;
}
