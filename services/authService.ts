import { User } from '../types';

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';

// Hardcoded Client ID - shared across components
export const GOOGLE_CLIENT_ID = '691804601172-eg2ajh42fmeep7a67g48rf7ospnun11g.apps.googleusercontent.com';

/**
 * Initializes the Code Client (Authorization Code Flow)
 * This allows us to get a Refresh Token for permanent login.
 */
export const initCodeClient = (callback: (response: any) => void) => {
  // @ts-ignore
  if (typeof google === 'undefined') return null;

  try {
    // @ts-ignore
    return google.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      ux_mode: 'popup',
      access_type: 'offline', // Critical for refresh token
      prompt: 'consent select_account', // Ensures refresh token is returned and account can be switched
      callback: callback,
    });
  } catch (e) {
    console.error("Error initializing code client", e);
    return null;
  }
};

/**
 * Exchanges an Authorization Code for Access & Refresh tokens
 */
export const exchangeCodeForTokens = async (code: string) => {
  const response = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to exchange code');
  }
  return await response.json();
};

// Check if the token is expired (with 5 minute buffer)
export const isTokenExpired = (user: User): boolean => {
  if (!user.tokenExpiry) return true; // No expiry stored = assume expired
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer
  return Date.now() >= (user.tokenExpiry - bufferMs);
};

/**
 * Refreshes the access token using the Refresh Token
 */
export const silentRefreshToken = async (user: User): Promise<User | null> => {
  if (!user.refreshToken) {
    console.warn("No refresh token available for permanent login");
    return null;
  }

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: user.refreshToken })
    });

    if (!response.ok) return null;

    const data = await response.json();
    const expiresIn = data.expires_in || 3600;
    const tokenExpiry = Date.now() + (expiresIn * 1000);

    return {
      ...user,
      accessToken: data.access_token,
      tokenExpiry: tokenExpiry
    };
  } catch (e) {
    console.error('Error during silent refresh:', e);
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
          range: 'Expenses!A1:G1',
          values: [['ID', 'Date', 'Category', 'Description', 'Amount', 'ReceiptUrl', 'BudgetItemName']]
        }
      ]
    })
  });

  return spreadsheetId;
};