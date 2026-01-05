import { User } from '../types';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''; // You normally need a client ID, but we'll use the token client which works with origins allowed in Cloud Console.
// NOTE: For this to work in a generic environment without a specific Client ID hardcoded, 
// we rely on the user configuring their Google Cloud Project and adding the origin.
// Since we can't assume a Client ID, we will ask the user to input it OR use a simplified implicit flow if they have one.
// For this demo, we'll assume the standard flow where we request a token.

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';

export const initTokenClient = (callback: (response: any) => void) => {
  // @ts-ignore
  if (typeof google === 'undefined') return null;
  
  // @ts-ignore
  return google.accounts.oauth2.initTokenClient({
    client_id: '169224424756-3u706176510862086377755606456012.apps.googleusercontent.com', // Demo Client ID - replace with yours in production if needed
    scope: SCOPES,
    callback: callback,
  });
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