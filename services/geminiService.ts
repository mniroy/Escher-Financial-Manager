import { GoogleGenAI, Type } from "@google/genai";
import { BudgetCategory, AnalysisResult } from '../types';

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

export const analyzeReceipt = async (base64Image: string, mimeType: string): Promise<AnalysisResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key not found in environment variables");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const categoriesList = Object.values(BudgetCategory).join(', ');

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
- Food = restaurants, cafes, food delivery
- Grocery = supermarkets, grocery stores  
- Shopping = retail, e-commerce (Shopee, Tokopedia, etc.), general purchases
- Transportation = taxi, Grab, Gojek rides, gas, tolls
- Bill = utilities, subscriptions, services
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
            enum: Object.values(BudgetCategory),
            description: "Must be one of the exact budget categories"
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