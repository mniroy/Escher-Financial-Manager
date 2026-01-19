import { IncomeEntry } from '../../types';

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

export async function analyzeIncome(text: string, base64Image: string | null, mimeType: string | null, apiKey: string): Promise<IncomeEntry> {
    const currentDate = new Date().toISOString().split('T')[0];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    const parts: any[] = [
        {
            text: `Analyze this income information. Extract date, person, source, category, base income, allowance, deduction, and payment method.
            
CONTEXT:
- Today's date is ${currentDate}.
- Extract the person receiving the income if mentioned (e.g., "Royyan" or "Inez").
- Source is where the money comes from.
- Category is the type of income (Salary, Bonus, Side Hustle, etc.).
- Base Income is the main amount.
- Allowance and Deduction are optional additional amounts.
- Total Income = Base + Allowance.
- Take Home Pay = Total - Deduction.
- Payment Method is how it was paid (Bank Transfer, Cash, etc.).
- CRITICAL: Indonesian Rupiah - dots are THOUSAND separators.

Message Text: "${text}"

Return JSON matching this structure:
{
  "date": "YYYY-MM-DD",
  "person": "string",
  "source": "string",
  "category": "string",
  "baseIncome": number,
  "allowance": number,
  "deduction": number,
  "paymentMethod": "string"
}`
        }
    ];

    if (base64Image && mimeType) {
        parts.unshift({ inlineData: { mimeType, data: cleanBase64(base64Image) } });
    }

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { responseMimeType: "application/json" }
        })
    });

    if (!response.ok) throw new Error(`Gemini error: ${await response.text()}`);
    const data = await response.json();
    const result = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');

    const totalIncome = (result.baseIncome || 0) + (result.allowance || 0);
    const takeHomePay = totalIncome - (result.deduction || 0);
    const dateObj = new Date(result.date || currentDate);
    const monthYear = `${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

    return {
        date: result.date || currentDate,
        month: monthYear,
        person: result.person || 'Unknown',
        source: result.source || 'Unknown',
        category: result.category || 'Income',
        baseIncome: result.baseIncome || 0,
        allowance: result.allowance || 0,
        totalIncome: totalIncome,
        deduction: result.deduction || 0,
        takeHomePay: takeHomePay,
        paymentMethod: result.paymentMethod || 'Unknown'
    };
}
