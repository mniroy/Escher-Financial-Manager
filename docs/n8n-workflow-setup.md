# N8n Workflow Setup for Receipt Processing

This guide explains how to set up an n8n workflow to automatically process WhatsApp receipts and log expenses to Google Sheets.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────┐    ┌──────────────┐
│  WhatsApp       │──▶ │  Get OAuth       │──▶ │  HTTP Request           │──▶ │  Response    │
│  Trigger        │    │  Token (Code)    │    │  (Call Vercel API)      │    │              │
└─────────────────┘    └──────────────────┘    └─────────────────────────┘    └──────────────┘
```

**How it works:**
- n8n extracts a fresh OAuth token from its credentials
- The Vercel API receives the token and handles all Google operations
- No complex folder creation nodes needed in n8n!

---

## Prerequisites

1. **n8n instance** (self-hosted or cloud)
2. **Google Cloud Console project** with:
   - Google Drive API enabled
   - Google Sheets API enabled
   - OAuth 2.0 credentials configured
3. **Deployed Vercel app** with:
   - `RECEIPT_API_KEY` environment variable set
   - `API_KEY` (Gemini API key) environment variable set

---

## Step 1: Create Google OAuth Credential in n8n

1. Go to **Settings → Credentials → Add Credential**
2. Search for **Google Drive OAuth2 API**
3. Click **Create New**
4. Follow the OAuth flow:
   - Sign in with your Google account
   - Grant permissions for Google Drive and Google Sheets
5. Name the credential exactly: `Google Drive account`

> **Important:** Remember the credential name - you'll need it in the Code node.

---

## Step 2: Create the Workflow

### Node 1: WhatsApp Trigger (or Webhook)

1. Add a **Webhook** node
2. Set the HTTP Method to `POST`
3. Copy the webhook URL - configure your WhatsApp service to send messages here

The incoming data should include:
- `imageData` - Base64-encoded image
- `mimeType` - Image MIME type (e.g., `image/jpeg`)

---

### Node 2: Get OAuth Token (HTTP Request)

This node calls a helper endpoint on your Vercel app that echoes back the OAuth token.

1. Add an **HTTP Request** node, name it `Get Access Token`
2. Configure:
   - **Method:** `GET`
   - **URL:** `https://your-app.vercel.app/api/get-token`
   - **Authentication:** `Predefined Credential Type`
   - **Credential Type:** `Google Drive OAuth2 API`
   - **Credential:** Select your `Google Drive account`

3. Leave everything else as default

**What happens:**
- n8n adds the OAuth token to the `Authorization: Bearer xxx` header
- Your Vercel endpoint echoes back the token
- The response contains: `{ "success": true, "access_token": "ya29.xxx..." }`

**Output:**
```json
{
  "success": true,
  "access_token": "ya29.a0AfH6SMB..."
}
```

### Node 3: HTTP Request (Call Vercel API)

1. Add an **HTTP Request** node, name it `Process Receipt`
2. Configure:
   - **Method:** `POST`
   - **URL:** `https://your-app.vercel.app/api/process-receipt`

3. **Headers:**
   | Name | Value |
   |------|-------|
   | `Content-Type` | `application/json` |
   | `X-API-KEY` | `your-receipt-api-key` |
   | `Authorization` | `Bearer {{ $json.access_token }}` |

4. **Body → Content Type:** `JSON`
5. **Body → JSON:**
   ```json
   {
     "base64Image": "{{ $json.imageData }}",
     "mimeType": "{{ $json.mimeType }}",
     "spreadsheetId": "your-google-sheet-id"
   }
   ```

6. **Response Format:** `JSON`

---

### Node 4: Handle Response (Optional)

Add an **IF** node to check for success:

1. **Condition:**
   - **Value 1:** `{{ $json.success }}`
   - **Operation:** `Equals`
   - **Value 2:** `true`

2. **True branch:** Send success notification
3. **False branch:** Send error notification or log

---

## What the Vercel API Does

The `/api/process-receipt` endpoint now handles everything:

1. ✅ **Analyzes** the receipt using Gemini AI
2. ✅ **Creates** folder structure in Google Drive (Escher Finance Manager / Year / Month)
3. ✅ **Uploads** the receipt image
4. ✅ **Appends** the expense to Google Sheets

**Response:**
```json
{
  "success": true,
  "expense": {
    "id": "20260110-Food-restaurant-name",
    "date": "2026-01-10",
    "category": "Food",
    "description": "Restaurant Name",
    "amount": 150000,
    "receiptUrl": "https://drive.google.com/file/d/.../view"
  }
}
```

---

## Troubleshooting

### "Invalid Credentials" or 401 Error

1. **Re-authenticate** your Google credential in n8n:
   - Go to Settings → Credentials
   - Find your Google Drive OAuth2 credential
   - Click Edit → Reconnect

2. **Check scopes:** Ensure your credential has access to:
   - Google Drive (for folder creation and file upload)
   - Google Sheets (for appending rows)

### "Could not get Google access token"

- The credential name in the Code node might be wrong
- Try checking your credential's internal name in n8n's database or use the expression: `{{ $credentials }}`

### "Missing Authorization header"

- Make sure the HTTP Request node has the `Authorization` header set
- Verify the expression: `Bearer {{ $json.googleAccessToken }}`

### "Missing fields: spreadsheetId"

- Add `spreadsheetId` to your HTTP Request body
- Get your spreadsheet ID from the Google Sheets URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`

---

## Complete Workflow Summary

| Step | Node Type | Name | Purpose |
|------|-----------|------|---------|
| 1 | Webhook | `WhatsApp Trigger` | Receives receipt image from WhatsApp |
| 2 | Code | `Get Access Token` | Extracts fresh OAuth token from n8n |
| 3 | HTTP Request | `Process Receipt` | Calls Vercel API with token + image |
| 4 | IF | `Check Success` | Handles success/failure (optional) |

---

## Security Notes

- Never commit API keys to version control
- The OAuth token is automatically refreshed by n8n
- The `X-API-KEY` should be a strong, randomly generated string
- Store sensitive values in n8n's credentials system, not in the workflow
