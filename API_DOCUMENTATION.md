# Escher Financial Manager - API Documentation

This document describes the API endpoints available for integrating with Escher Financial Manager from external applications.

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Data Structures](#data-structures)
4. [API Endpoints](#api-endpoints)
   - [Receipt Analysis](#receipt-analysis)
   - [Authentication Endpoints](#authentication-endpoints)
   - [WhatsApp Webhook](#whatsapp-webhook)
5. [Google Sheets Data Access](#google-sheets-data-access)
6. [Integration Examples](#integration-examples)

---

## Overview

**Base URL (Production):** `https://escher-financial-manager.vercel.app`  
**Base URL (Local):** `http://localhost:3000`

The Escher Financial Manager stores all data in Google Sheets. External applications can:
- **Analyze receipts** using AI via the `/api/process-receipt` endpoint
- **Access expense data** directly from Google Sheets using the user's OAuth token
- **Submit receipts via WhatsApp** using the WAHA webhook

---

## Authentication

### API Key Authentication

For server-to-server communication, use the `X-API-KEY` header:

```
X-API-KEY: <your-api-key>
```

Set the API key in Vercel environment variables as `RECEIPT_API_KEY`.

### OAuth Token Authentication

For accessing Google Sheets data, you'll need a valid Google OAuth access token. You can:
1. Use the user's stored `refreshToken` to get a fresh access token via `/api/auth/refresh`
2. Store the access token securely and use it for Google Sheets API calls

---

## Data Structures

### BudgetCategory (Enum)

```typescript
enum BudgetCategory {
  AssetAquire = 'Asset Aquire',
  Bill = 'Bill',
  DebtPayment = 'Debt Payment',
  Education = 'Education',
  Food = 'Food',
  Grocery = 'Grocery',
  HomeMaintenance = 'Home Maintenance',
  Mortgage = 'Mortgage',
  Shopping = 'Shopping',
  Tax = 'Tax',
  Transportation = 'Transportation',
  Vacation = 'Vacation',  // Useful for travel apps
  Other = 'Other'
}
```

### Expense

```typescript
interface Expense {
  id: string;              // Format: "YYYYMMDD-Category-description" (e.g., "20260117-Vacation-hotel-check")
  date: string;            // ISO date string "YYYY-MM-DD"
  category: BudgetCategory;
  amount: number;          // In local currency (IDR)
  description: string;     // Merchant name or expense description
  receiptUrl?: string;     // Google Drive URL to receipt image
  budgetItemName?: string; // Links to a specific budget plan (e.g., "Bali Trip 2026")
}
```

### BudgetLineItem

```typescript
interface BudgetLineItem {
  category: BudgetCategory;
  name: string;            // Plan name (e.g., "Vacation Bali", "Monthly Groceries")
  amount: number;          // Budget allocation
  frequency: 'Monthly' | 'Yearly';
}
```

### AnalysisResult

```typescript
interface AnalysisResult {
  amount: number;
  merchant: string;
  date: string;        // "YYYY-MM-DD"
  category: string;    // One of BudgetCategory values
}
```

---

## API Endpoints

### Receipt Analysis

#### `POST /api/process-receipt`

Analyze a receipt image using AI (Gemini) and extract expense information.

**Authentication:** Required (`X-API-KEY` header)

**Request:**

```json
{
  "base64Image": "string",  // Base64-encoded image data (without data URI prefix)
  "mimeType": "string"      // e.g., "image/jpeg" or "image/png"
}
```

**Response (Success):**

```json
{
  "success": true,
  "data": {
    "id": "20260117-Food-kfc-restaurant",
    "date": "2026-01-17",
    "category": "Food",
    "merchant": "KFC Restaurant",
    "amount": 85000,
    "base64Image": "...",
    "mimeType": "image/jpeg"
  }
}
```

**Response (Error):**

```json
{
  "success": false,
  "error": "Error message here"
}
```

**Example (cURL):**

```bash
curl -X POST https://escher-financial-manager.vercel.app/api/process-receipt \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your-api-key" \
  -d '{
    "base64Image": "/9j/4AAQSkZJRg...",
    "mimeType": "image/jpeg"
  }'
```

---

### Authentication Endpoints

#### `POST /api/auth/token`

Exchange an OAuth authorization code for access and refresh tokens.

**Request:**

```json
{
  "code": "string",              // OAuth authorization code
  "redirect_uri": "string"       // Optional, defaults to "postmessage"
}
```

**Response:**

```json
{
  "access_token": "ya29...",
  "expires_in": 3599,
  "refresh_token": "1//...",
  "scope": "...",
  "token_type": "Bearer"
}
```

---

#### `POST /api/auth/refresh`

Refresh an expired access token using a refresh token.

**Request:**

```json
{
  "refresh_token": "string"
}
```

**Response:**

```json
{
  "access_token": "ya29...",
  "expires_in": 3599,
  "scope": "...",
  "token_type": "Bearer"
}
```

**Example (cURL):**

```bash
curl -X POST https://escher-financial-manager.vercel.app/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refresh_token": "1//0gxxxxxxxx"
  }'
```

---

#### `GET /api/get-token`

Extract the OAuth token from the Authorization header. Useful for n8n integrations.

**Request Headers:**

```
Authorization: Bearer <access_token>
```

**Response:**

```json
{
  "success": true,
  "access_token": "ya29..."
}
```

---

### WhatsApp Webhook

#### `POST /api/webhook/waha`

Receives WhatsApp messages via WAHA, processes receipt images, and logs them to Google Sheets.

**Query Parameters:**

| Parameter | Description |
|-----------|-------------|
| `c` | Base64-encoded JSON config containing `rt` (refresh token) and `sid` (spreadsheet ID) |

**Config Format:**

```json
{
  "rt": "1//0g...",           // Google refresh token
  "sid": "1abc123..."         // Google Sheets spreadsheet ID
}
```

**Generating Webhook URL:**

```javascript
const config = { rt: refreshToken, sid: spreadsheetId };
const encoded = btoa(JSON.stringify(config));
const webhookUrl = `https://escher-financial-manager.vercel.app/api/webhook/waha?c=${encoded}`;
```

---

## Google Sheets Data Access

The app stores all data in Google Sheets with the following structure:

### Sheet: `Expenses`

| Column | Field | Type | Description |
|--------|-------|------|-------------|
| A | id | string | Unique expense identifier |
| B | date | string | ISO date (YYYY-MM-DD) |
| C | category | string | Budget category |
| D | description | string | Merchant/description |
| E | amount | number | Amount in IDR |
| F | receiptUrl | string | Google Drive URL |
| G | budgetItemName | string | Linked budget plan name |

**Example Row:**
```
| 20260115-Vacation-hotel | 2026-01-15 | Vacation | Hotel Check-in | 500000 | https://drive.google.com/... | Bali Trip |
```

### Sheet: `Budget`

| Column | Field | Type | Description |
|--------|-------|------|-------------|
| A | category | string | Budget category |
| B | name | string | Plan name |
| C | amount | number | Budget amount |
| D | frequency | string | "Monthly" or "Yearly" |

### Reading Data from Google Sheets

Use the Google Sheets API directly with the user's access token:

```javascript
const accessToken = await refreshAccessToken(userRefreshToken);

const response = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Expenses!A:G`,
  {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  }
);

const data = await response.json();
// data.values contains the rows
```

### Filtering Expenses for Travel App

To get only vacation-related expenses for a specific trip:

```javascript
const expenses = data.values.slice(1).filter(row => 
  row[2] === 'Vacation' &&           // category is Vacation
  row[6] === 'Bali Trip 2026'        // budgetItemName matches trip
);
```

---

## Integration Examples

### Example 1: Fetch Vacation Expenses for a Trip

```typescript
async function getVacationExpenses(
  refreshToken: string,
  spreadsheetId: string,
  tripName: string
): Promise<Expense[]> {
  // 1. Get fresh access token
  const tokenRes = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  const { access_token } = await tokenRes.json();

  // 2. Fetch expenses from Google Sheets
  const sheetsRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Expenses!A:G`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  const { values } = await sheetsRes.json();

  // 3. Parse and filter for this trip
  const expenses = values.slice(1)
    .filter(row => row[2] === 'Vacation' && row[6] === tripName)
    .map(row => ({
      id: row[0],
      date: row[1],
      category: row[2],
      description: row[3],
      amount: parseFloat(row[4]),
      receiptUrl: row[5],
      budgetItemName: row[6]
    }));

  return expenses;
}
```

### Example 2: Analyze Receipt from Travel App

```typescript
async function analyzeReceipt(imageBase64: string, mimeType: string) {
  const response = await fetch(
    'https://escher-financial-manager.vercel.app/api/process-receipt',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.ESCHER_API_KEY
      },
      body: JSON.stringify({
        base64Image: imageBase64,
        mimeType: mimeType
      })
    }
  );

  const result = await response.json();
  
  if (result.success) {
    return result.data;
    // { id, date, category, merchant, amount }
  } else {
    throw new Error(result.error);
  }
}
```

### Example 3: Add Expense from Travel App

```typescript
async function addExpenseToSheet(
  accessToken: string,
  spreadsheetId: string,
  expense: Expense
) {
  const row = [
    expense.id,
    expense.date,
    expense.category,
    expense.description,
    expense.amount,
    expense.receiptUrl || '',
    expense.budgetItemName || ''
  ];

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Expenses!A2:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [row] })
    }
  );
}
```

---

## Environment Variables

For the API to work, configure these in Vercel:

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `API_KEY` | Gemini AI API key |
| `RECEIPT_API_KEY` | API key for process-receipt endpoint |
| `WAHA_API_URL` | WAHA server URL |
| `WAHA_API_KEY` | WAHA API key |
| `WAHA_SESSION` | WAHA session name (default: "default") |
| `WAHA_ALLOWED_SENDERS` | Comma-separated WhatsApp IDs allowed to send receipts |

---

## Rate Limits & Best Practices

1. **Cache access tokens** - They're valid for ~1 hour
2. **Batch reads** - Fetch all expenses in one call and filter client-side
3. **Use webhooks** - For real-time updates, set up Google Sheets triggers
4. **Handle token expiry** - Check for 401 errors and refresh the token

---

## Support

For questions or issues, refer to:
- Source code: `api/` directory
- Types: `types.ts`
- Google Sheets integration: `services/googleSheetsService.ts`
