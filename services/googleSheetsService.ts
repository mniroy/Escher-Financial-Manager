import { BudgetLineItem, Expense, BudgetCategory, User } from '../types';

const BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

export const fetchSheetValues = async (user: User, range: string) => {
  if (!user.spreadsheetId) throw new Error("No spreadsheet ID linked to user");

  const url = `${BASE_URL}/${user.spreadsheetId}/values/${range}`;

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${user.accessToken}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
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

export const saveBudgetToSheet = async (user: User, budgetItems: BudgetLineItem[]) => {
  if (!user.spreadsheetId) throw new Error("No spreadsheet ID linked to user");

  // 1. Intelligent Detection of Table Bounds
  // We fetch existing data to find where the "Budget" table actually ends.
  // We stop counting as soon as we hit a row that doesn't look like a budget item 
  // (e.g. empty row, or user notes/footers), ensuring we never touch data below.
  let tableRowCount = 0;
  try {
    const currentData = await fetchSheetValues(user, 'Budget!A2:A'); // Only need column A to check categories
    if (currentData.values && Array.isArray(currentData.values)) {
      const validCategories = new Set(Object.values(BudgetCategory));

      for (const row of currentData.values) {
        const cellValue = row[0];
        // If cell is empty or NOT a valid category, we assume end of table.
        if (!cellValue || !validCategories.has(cellValue)) {
          break;
        }
        tableRowCount++;
      }
    }
  } catch (error) {
    // If fetch fails, proceed with safe default (0 known rows)
    console.warn("Could not determine table bounds, proceeding with write only.", error);
  }

  // Format data for sheet
  const rows = budgetItems.map(item => [
    item.category,
    item.name,
    item.amount,
    item.frequency
  ]);

  // 2. Write New Data
  if (rows.length > 0) {
    const writeResponse = await fetch(`${BASE_URL}/${user.spreadsheetId}/values/Budget!A2?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: 'Budget!A2',
        majorDimension: 'ROWS',
        values: rows
      })
    });

    if (!writeResponse.ok) {
      if (writeResponse.status === 401) throw new Error("TOKEN_EXPIRED");
      const errText = await writeResponse.text();
      throw new Error(`Failed to update budget sheet: ${errText}`);
    }
  }

  // 3. Surgical Cleanup
  // Only clear rows that were part of the *detected* budget table but are no longer needed.
  // This leaves everything else (notes, other tables) completely alone.
  if (tableRowCount > rows.length) {
    const startClearRow = 2 + rows.length;
    const endClearRow = 2 + tableRowCount - 1;

    // We overwrite with empty strings instead of :clear to be gentler on formatting
    // Calculate how many rows to blank out
    const rowsToClearCount = endClearRow - startClearRow + 1;
    const emptyRows = Array(rowsToClearCount).fill(["", "", "", ""]); // Clear A-D

    const clearResponse = await fetch(`${BASE_URL}/${user.spreadsheetId}/values/Budget!A${startClearRow}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: `Budget!A${startClearRow}`,
        majorDimension: 'ROWS',
        values: emptyRows
      })
    });

    if (!clearResponse.ok) {
      console.warn('Failed to clean up stale rows', await clearResponse.text());
    }
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
      receiptUrl: row[5] || undefined,
      budgetItemName: row[6] || undefined // Read from Column G
    };
  });
};

export const saveExpensesToSheet = async (user: User, expenses: Expense[]) => {
  if (!user.spreadsheetId) throw new Error("No spreadsheet ID linked to user");

  // Format expenses for sheet (keeping header row intact)
  const rows = expenses.map(expense => [
    expense.id,
    expense.date,
    expense.category,
    expense.description,
    expense.amount,
    expense.receiptUrl || '',
    expense.budgetItemName || ''
  ]);

  // Clear existing data and write new (starting from row 2 to preserve header)
  // First, get current row count
  let currentRowCount = 0;
  try {
    const currentData = await fetchSheetValues(user, 'Expenses!A2:A');
    if (currentData.values && Array.isArray(currentData.values)) {
      currentRowCount = currentData.values.length;
    }
  } catch (e) {
    console.warn("Could not get current expense count", e);
  }

  // Write new data
  if (rows.length > 0) {
    const writeResponse = await fetch(`${BASE_URL}/${user.spreadsheetId}/values/Expenses!A2?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: 'Expenses!A2',
        majorDimension: 'ROWS',
        values: rows
      })
    });

    if (!writeResponse.ok) {
      if (writeResponse.status === 401) throw new Error("TOKEN_EXPIRED");
      throw new Error('Failed to update expenses in Google Sheets');
    }
  }

  // Clear any leftover rows if the new list is shorter
  if (currentRowCount > rows.length) {
    const startClearRow = 2 + rows.length;
    const endClearRow = 2 + currentRowCount - 1;
    const rowsToClearCount = endClearRow - startClearRow + 1;
    const emptyRows = Array(rowsToClearCount).fill(["", "", "", "", "", "", ""]);

    const clearResponse = await fetch(`${BASE_URL}/${user.spreadsheetId}/values/Expenses!A${startClearRow}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: `Expenses!A${startClearRow}`,
        majorDimension: 'ROWS',
        values: emptyRows
      })
    });

    if (!clearResponse.ok) {
      console.warn('Failed to clean up stale expense rows', await clearResponse.text());
    }
  }
};

export const parseIncomeFromSheet = (values: any[][]): import('../types').IncomeEntry[] => {
  if (!values || values.length <= 1) return [];

  return values.slice(1).map(row => {
    // Helper to parse currency values
    const parseAmount = (val: any): number => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const cleaned = val.replace(/[^0-9.-]+/g, '');
        return parseFloat(cleaned) || 0;
      }
      return 0;
    };

    return {
      date: row[0] || '',
      month: row[1] || '',
      person: row[2] || '',
      source: row[3] || '',
      category: row[4] || '',
      baseIncome: parseAmount(row[5]),
      allowance: parseAmount(row[6]),
      totalIncome: parseAmount(row[7]),
      deduction: parseAmount(row[8]),
      takeHomePay: parseAmount(row[9]),
      paymentMethod: row[10] || '',
      id: row[11] || crypto.randomUUID()
    };
  });
};

export const saveIncomeToSheet = async (user: User, incomeEntries: import('../types').IncomeEntry[]) => {
  if (!user.spreadsheetId) throw new Error("No spreadsheet ID linked to user");

  // Format desc for sheet (keeping header row intact)
  // Columns: Date, Month, Person, Source, Category, Base, Allowance, Total, Deduction, Net, PaymentMethod, ID
  const rows = incomeEntries.map(entry => [
    entry.date,
    entry.month,
    entry.person,
    entry.source,
    entry.category,
    entry.baseIncome,
    entry.allowance,
    entry.totalIncome,
    entry.deduction,
    entry.takeHomePay,
    entry.paymentMethod || '',
    entry.id || crypto.randomUUID()
  ]);

  // Clear existing data and write new (starting from row 2 to preserve header)
  // First, get current row count
  let currentRowCount = 0;
  try {
    const currentData = await fetchSheetValues(user, 'Income!A2:A');
    if (currentData.values && Array.isArray(currentData.values)) {
      currentRowCount = currentData.values.length;
    }
  } catch (e) {
    console.warn("Could not get current income count", e);
  }

  // Write new data
  if (rows.length > 0) {
    const writeResponse = await fetch(`${BASE_URL}/${user.spreadsheetId}/values/Income!A2?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: 'Income!A2',
        majorDimension: 'ROWS',
        values: rows
      })
    });

    if (!writeResponse.ok) {
      if (writeResponse.status === 401) throw new Error("TOKEN_EXPIRED");
      throw new Error('Failed to update income in Google Sheets');
    }
  }

  // Clear any leftover rows if the new list is shorter
  if (currentRowCount > rows.length) {
    const startClearRow = 2 + rows.length;
    const endClearRow = 2 + currentRowCount - 1;
    const rowsToClearCount = endClearRow - startClearRow + 1;
    const emptyRows = Array(rowsToClearCount).fill(["", "", "", "", "", "", "", "", "", "", "", ""]); // Clear A-L

    const clearResponse = await fetch(`${BASE_URL}/${user.spreadsheetId}/values/Income!A${startClearRow}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: `Income!A${startClearRow}`,
        majorDimension: 'ROWS',
        values: emptyRows
      })
    });

    if (!clearResponse.ok) {
      console.warn('Failed to clean up stale income rows', await clearResponse.text());
    }
  }
};

export const parsePeriodModesFromSheet = (values: any[][]): import('../types').PeriodMode[] => {
  if (!values || values.length <= 1) return [];

  return values.slice(1).map(row => ({
    id: row[0],
    startDate: row[1],
    endDate: row[2],
    budgetItemName: row[3]
  }));
};

export const savePeriodModesToSheet = async (user: User, modes: import('../types').PeriodMode[]) => {
  if (!user.spreadsheetId) throw new Error("No spreadsheet ID linked to user");

  // Columns: ID, StartDate, EndDate, BudgetItemName
  const rows = modes.map(mode => [
    mode.id,
    mode.startDate,
    mode.endDate,
    mode.budgetItemName
  ]);

  // First, get current row count to know if we need cleanup
  let currentRowCount = 0;
  try {
    const currentData = await fetchSheetValues(user, 'PeriodModes!A2:A');
    if (currentData.values && Array.isArray(currentData.values)) {
      currentRowCount = currentData.values.length;
    }
  } catch (e) {
    console.warn("Could not get current period mode count", e);
  }

  // Write new data
  if (rows.length > 0) {
    const writeResponse = await fetch(`${BASE_URL}/${user.spreadsheetId}/values/PeriodModes!A2?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: 'PeriodModes!A2',
        majorDimension: 'ROWS',
        values: rows
      })
    });

    if (!writeResponse.ok) {
      if (writeResponse.status === 401) throw new Error("TOKEN_EXPIRED");
      throw new Error('Failed to update period modes in Google Sheets');
    }
  }

  // Cleanup stale rows
  if (currentRowCount > rows.length) {
    const startClearRow = 2 + rows.length;
    const endClearRow = 2 + currentRowCount - 1;
    const rowsToClearCount = endClearRow - startClearRow + 1;
    const emptyRows = Array(rowsToClearCount).fill(["", "", "", ""]); // Clear A-D

    const clearResponse = await fetch(`${BASE_URL}/${user.spreadsheetId}/values/PeriodModes!A${startClearRow}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range: `PeriodModes!A${startClearRow}`,
        majorDimension: 'ROWS',
        values: emptyRows
      })
    });

    if (!clearResponse.ok) {
      console.warn('Failed to clean up stale period mode rows', await clearResponse.text());
    }
  }
};