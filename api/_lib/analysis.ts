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

const INCOME_CATEGORIES = [
    'Salary', 'Bonus', 'Dividend', 'Interest', 'Cashback', 'Gift', 'Side Hustle', 'Refund', 'Other'
];

function cleanBase64(base64: string): string {
    return base64
        .replace(/^data:image\/[a-z]+;base64,/, '')
        .replace(/^=/, '')
        .trim();
}

export async function analyzeReceipt(base64Image: string, mimeType: string, apiKey: string, customCategories: string[] = []): Promise<AnalysisResult> {
    const cleanData = cleanBase64(base64Image);
    const currentDate = new Date().toISOString().split('T')[0];

    // Combine default and custom categories
    const allCategories = Array.from(new Set([...BUDGET_CATEGORIES, ...customCategories]));

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
- CURRENCY CONVERSION: If the receipt is NOT in IDR (Indonesian Rupiah), you MUST convert the total amount to IDR using the latest known exchange rate.
- RESULT: The "amount" field MUST be in IDR (integer).
- CRITICAL: Indonesian Rupiah - dots are THOUSAND separators (Rp134.100 = 134100).
- Categories: ${allCategories.join(', ')}.

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
    if (!allCategories.includes(result.category)) {
        result.category = 'Other';
    }

    return result;
}

export async function analyzeIncome(text: string, base64Image: string | null, mimeType: string | null, apiKey: string): Promise<IncomeEntry> {
    const currentDate = new Date().toISOString().split('T')[0];

    const parts: any[] = [
        {
            text: `Analyze this income information. Extract date, person (recipient), source, category, base income, allowance, deduction, and payment method.
            
CONTEXT:
- Today's date is ${currentDate}.
- IMPORTANT - PERSON IDENTIFICATION: 
  - If you see names like "Callista", "Hapsari", "Almira", "Inez", or "Ersya", the person is "Inez".
  - If you see names like "Royyan", "Nur", or "Wicaksono", the person is "Royyan".
  - It usually appears in the "Recipient" or "Receiver" field of a bank transfer.
- Source is the sender or entity paying the money.
- Category must be one of: ${INCOME_CATEGORIES.join(', ')}.
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
  "person": "Royyan" | "Inez",
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
    const monthNum = String(dateObj.getMonth() + 1).padStart(2, '0');

    return {
        date: result.date || currentDate,
        month: monthNum,
        person: result.person || 'Royyan',
        source: result.source || 'Unknown',
        category: result.category || 'Other',
        baseIncome: result.baseIncome || 0,
        allowance: result.allowance || 0,
        totalIncome: totalIncome,
        deduction: result.deduction || 0,
        takeHomePay: takeHomePay,
        paymentMethod: result.paymentMethod || 'Unknown'
    };
}
