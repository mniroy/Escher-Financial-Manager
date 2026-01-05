import { User } from '../types';

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';

export const initTokenClient = (clientId: string, callback: (response: any) => void) => {
  // @ts-ignore
  if (typeof google === 'undefined') return null;
  
  try {
    // @ts-ignore
    return google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: callback,
    });
  } catch (e) {
    console.error("Error initializing token client", e);
    return null;
  }
};

export const getUserInfo = async (accessToken: string): Promise<Partial<User>> => {
  const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Failed to fetch user info');
  return await response.json();
};

export const findEscherSpreadsheet = async (accessToken: string): Promise<string | null> => {
  const q = "name = 'Escher Financial Manager' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  
  if (!response.ok) return null;
  
  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
};

export const createEscherSpreadsheet = async (accessToken: string): Promise<string> => {
  // 1. Create Sheet
  const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: { title: 'Escher Financial Manager' },
      sheets: [
        { properties: { title: 'Budget', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'Expenses', gridProperties: { frozenRowCount: 1 } } }
      ]
    })
  });
  
  if (!createResponse.ok) throw new Error('Failed to create spreadsheet');
  
  const sheetData = await createResponse.json();
  const spreadsheetId = sheetData.spreadsheetId;

  // 2. Add Headers
  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  await fetch(updateUrl, {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: 'Budget!A1:D1',
          values: [['Category', 'Item Name', 'Amount', 'Frequency']]
        },
        {
          range: 'Expenses!A1:F1',
          values: [['ID', 'Date', 'Category', 'Description', 'Amount', 'ReceiptUrl']]
        }
      ]
    })
  });

  return spreadsheetId;
};