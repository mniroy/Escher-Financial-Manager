import { GoogleGenAI, Type } from "@google/genai";
import { BudgetCategory, AnalysisResult, IncomeAnalysisResult } from '../types';

// Helper to convert file to base64
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const analyzeReceipt = async (base64Image: string, mimeType: string, customCategories: string[] = []): Promise<AnalysisResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key not found in environment variables");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Merge default categories with custom ones and remove duplicates
  const allCategories = Array.from(new Set([
    ...Object.values(BudgetCategory),
    ...customCategories
  ])).sort();

  const categoriesList = allCategories.join(', ');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
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
- Match the item to the best fitting category from the list above.
- If unsure, use "Other"

DATE: Return in YYYY-MM-DD format. Look for order date or transaction date.

MERCHANT: Extract the store/seller name.`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          amount: {
            type: Type.NUMBER,
            description: "Total amount as a number WITHOUT thousand separators. Example: Rp134.100 should be 134100"
          },
          merchant: { type: Type.STRING, description: "Name of the store or vendor" },
          date: { type: Type.STRING, description: "Date of purchase in YYYY-MM-DD format" },
          category: {
            type: Type.STRING,
            enum: allCategories,
            description: "Must be one of the provided budget categories"
          }
        },
        required: ["amount", "merchant", "category"]
      }
    }
  });

  if (!response.text) {
    throw new Error("No response from AI");
  }

  const result = JSON.parse(response.text) as AnalysisResult;
  return result;
};

export const analyzeIncome = async (base64Image: string, mimeType: string): Promise<IncomeAnalysisResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key not found in environment variables");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image
          }
        },
        {
          text: `Analyze this payslip or bank transfer proof image to extract income details.
          
CRITICAL - AMOUNT EXTRACTION (Indonesian Format):
- DOTS (.) are THOUSAND separators, NOT decimals.
- Return amounts as plain NUMBERS.

FIELDS TO EXTRACT:
1. DATE: Transaction/Payment date in YYYY-MM-DD.
2. PERSON: "Royyan" or "Inez" (Look for names like 'Royyan Wicaksono' or 'Inez').
3. SOURCE: Company/Sender name (e.g. "PT Johnson & Johnson", "Google").
4. CATEGORY: "Salary", "Bonus", "THR", "Side Hustle", or "Other".
5. BASE INCOME: Basic salary amount.
6. ALLOWANCE: Total of all bonuses/additions other than base salary.
7. DEDUCTIONS: Total of tax, BPJS, insurance, or any local deductions.
8. TAKE HOME PAY: The final net amount received.

Note: If a value is missing, return 0 for numbers and guess logically for text.`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING },
          person: { type: Type.STRING, enum: ["Royyan", "Inez"] },
          source: { type: Type.STRING },
          category: { type: Type.STRING, enum: ["Salary", "Bonus", "THR", "Side Hustle", "Other"] },
          baseIncome: { type: Type.NUMBER },
          allowance: { type: Type.NUMBER },
          deduction: { type: Type.NUMBER },
          totalIncome: { type: Type.NUMBER },
          takeHomePay: { type: Type.NUMBER },
          paymentMethod: { type: Type.STRING }
        },
        required: ["source", "category", "baseIncome", "takeHomePay"]
      }
    }
  });

  if (!response.text) throw new Error("No response from AI");
  return JSON.parse(response.text) as IncomeAnalysisResult;
};