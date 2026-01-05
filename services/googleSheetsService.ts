import { BudgetLineItem, Expense, BudgetCategory, User } from '../types';

const BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

export const fetchSheetValues = async (user: User, range: string) => {
  if (!user.spreadsheetId) throw new Error("No spreadsheet ID linked to user");

  const response = await fetch(`${BASE_URL}/${user.spreadsheetId}/values/${range}`, {
    headers: {
      Authorization: `Bearer ${user.accessToken}`,
    },
  });
  
  if (!response.ok) {
    if (response.status === 401) {
       throw new Error("TOKEN_EXPIRED");
    }
    const errorText = await response.text();
    throw new Error(`Google Sheets API Error: ${response.statusText} - ${errorText}`);
  }
  
  return await response.json();
};

export const appendSheetRow = async (user: User, range: string, row: (string | number)[]) => {
  if (!user.spreadsheetId) throw new Error("No spreadsheet ID linked to user");

  const response = await fetch(`${BASE_URL}/${user.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [row],
    }),
  });

  if (!response.ok) {
     if (response.status === 401) {
       throw new Error("TOKEN_EXPIRED");
    }
    throw new Error('Failed to write to Google Sheets');
  }
};

export const parseBudgetFromSheet = (values: any[][]): BudgetLineItem[] => {
  if (!values || values.length <= 1) return []; 
  
  return values.slice(1).map(row => {
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