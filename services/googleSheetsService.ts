import { BudgetLineItem, Expense, BudgetCategory, GoogleSheetsConfig } from '../types';

const BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

export const fetchSheetValues = async (config: GoogleSheetsConfig, range: string) => {
  const response = await fetch(`${BASE_URL}/${config.spreadsheetId}/values/${range}`, {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Sheets API Error: ${response.statusText} - ${errorText}`);
  }
  
  return await response.json();
};

export const appendSheetRow = async (config: GoogleSheetsConfig, range: string, row: (string | number)[]) => {
  const response = await fetch(`${BASE_URL}/${config.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [row],
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to write to Google Sheets');
  }
};

export const parseBudgetFromSheet = (values: any[][]): BudgetLineItem[] => {
  if (!values || values.length <= 1) return []; // Empty or just header
  
  // Expected Header: Category, Item Name, Amount, Frequency
  return values.slice(1).map(row => {
    // Basic cleanup to handle currency symbols if user typed them in sheet
    const amountClean = typeof row[2] === 'string' ? Number(row[2].replace(/[^0-9.-]+/g, "")) : Number(row[2]);
    
    return {
      category: row[0] as BudgetCategory,
      name: row[1] || 'Unnamed Item',
      amount: isNaN(amountClean) ? 0 : amountClean,
      frequency: (row[3] === 'Monthly' || row[3] === 'Yearly') ? row[3] : 'Monthly'
    };
  });
};

export const parseExpensesFromSheet = (values: any[][]): Expense[] => {
  if (!values || values.length <= 1) return [];
  
  // Expected Header: ID, Date, Category, Description, Amount, ReceiptUrl
  return values.slice(1).map(row => {
     const amountClean = typeof row[4] === 'string' ? Number(row[4].replace(/[^0-9.-]+/g, "")) : Number(row[4]);

     return {
      id: row[0],
      date: row[1],
      category: row[2] as BudgetCategory,
      description: row[3],
      amount: isNaN(amountClean) ? 0 : amountClean,
      receiptUrl: row[5] || undefined
    };
  });
};
