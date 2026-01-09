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
          text: `Analyze this receipt image. Extract the final total amount paid (net/grand total), the merchant/vendor name, the date, and categorize the expense.

IMPORTANT: You MUST categorize into EXACTLY one of these categories (use exact spelling): [${categoriesList}]. 
- Food = restaurants, cafes, eating out
- Grocery = supermarkets, grocery stores
- Shopping = retail, online shopping, general purchases  
- Transportation = taxi, gas, tolls, parking
- Bill = utilities, subscriptions, services
- If unsure, use "Other"

Return the date in YYYY-MM-DD format.`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          amount: { type: Type.NUMBER, description: "Total amount of the receipt" },
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