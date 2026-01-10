# N8n Workflow Setup for Receipt Processing

This guide explains how to set up an n8n workflow to automatically process WhatsApp receipts and log expenses to Google Sheets.

## Architecture Overview

```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  WhatsApp       │──▶ │  HTTP Request        │──▶ │  Google Drive   │──▶ │  Google Sheets   │
│  Trigger        │    │  (Analyze Receipt)   │    │  (Upload Image) │    │  (Append Row)    │
└─────────────────┘    └──────────────────────┘    └─────────────────┘    └──────────────────┘
```

**Why this approach?**
- The Vercel API (`/api/process-receipt`) only handles Gemini AI analysis
- n8n's native Google Drive and Google Sheets nodes handle OAuth authentication properly
- No need to manually manage access tokens - n8n refreshes them automatically

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

## Step 1: Create Google OAuth Credentials in n8n

1. Go to **Settings → Credentials → Add Credential**
2. Search for **Google Drive OAuth2 API**
3. Click **Create New**
4. Follow the OAuth flow:
   - Sign in with your Google account
   - Grant permissions for Google Drive
5. Name the credential (e.g., "Escher Google Drive")

6. Repeat for **Google Sheets OAuth2 API**:
   - Add another credential for Google Sheets
   - Name it (e.g., "Escher Google Sheets")

> **Tip:** You can use the same Google account for both credentials.

---

## Step 2: Create the Workflow

### Node 1: WhatsApp Trigger (or Webhook)

If using WhatsApp Business API or a service like Twilio:

1. Add a **Webhook** node
2. Set the HTTP Method to `POST`
3. Copy the webhook URL - you'll configure your WhatsApp service to send messages here

The incoming data should include:
- `imageData` - Base64-encoded image
- `mimeType` - Image MIME type (e.g., `image/jpeg`)

---

### Node 2: HTTP Request (Analyze Receipt)

1. Add an **HTTP Request** node
2. Configure:
   - **Method:** `POST`
   - **URL:** `https://your-app.vercel.app/api/process-receipt`
   - **Authentication:** None (we use X-API-KEY header)

3. **Headers:**
   | Name | Value |
   |------|-------|
   | `Content-Type` | `application/json` |
   | `X-API-KEY` | `your-receipt-api-key` |

4. **Body (JSON):**
   ```json
   {
     "base64Image": "{{ $json.imageData }}",
     "mimeType": "{{ $json.mimeType }}"
   }
   ```

5. **Response Format:** JSON

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "20260110-Food-restaurant-name",
    "date": "2026-01-10",
    "category": "Food",
    "merchant": "Restaurant Name",
    "amount": 150000,
    "base64Image": "...",
    "mimeType": "image/jpeg"
  }
}
```

---

### Node 3: Google Drive (Upload Image)

This is the most complex part. We need to:
1. Convert base64 to binary
2. Create folder structure (Escher Finance Manager / Year / Month)
3. Upload the file

#### Node 3a: Code Node (Convert Base64 to Binary)

1. Add a **Code** node after the HTTP Request node
2. Set **Mode** to `Run Once for All Items`
3. Paste this code:

```javascript
// Get the response data from HTTP Request
const responseData = $input.first().json;
const base64Data = responseData.data.base64Image;
const mimeType = responseData.data.mimeType;
const expenseId = responseData.data.id;
const expenseDate = responseData.data.date;

// Remove data URI prefix if present
const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

// Parse date for folder structure
const dateParts = expenseDate.split('-');
const year = dateParts[0];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December'];
const month = monthNames[parseInt(dateParts[1], 10) - 1];

// Return both JSON data and binary data
return [{
  json: {
    ...responseData,
    folderYear: year,
    folderMonth: month,
    fileName: `receipt-${expenseId}.jpg`
  },
  binary: {
    file: await this.helpers.prepareBinaryData(
      Buffer.from(cleanBase64, 'base64'),
      `receipt-${expenseId}.jpg`,
      mimeType
    )
  }
}];
```

---

#### Node 3b: Google Drive - Find Root Folder

1. Add a **Google Drive** node
2. Configure:
   - **Credential:** Select your Google Drive OAuth2 credential
   - **Resource:** `File`
   - **Operation:** `Search`
3. **Search Settings:**
   - **Query String:** `name = 'Escher Finance Manager' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
4. **Options:**
   - **What To Return:** `All`

---

#### Node 3c: IF Node (Check if Root Folder Exists)

1. Add an **IF** node
2. Configure **Conditions:**
   - **Value 1:** `{{ $json.length }}`
   - **Operation:** `Greater Than`
   - **Value 2:** `0`

**True branch:** Root folder exists, proceed with the folder ID
**False branch:** Create the root folder first

---

#### Node 3d: Google Drive - Create Root Folder (False Branch)

1. Add a **Google Drive** node on the **False** output
2. Configure:
   - **Credential:** Select your Google Drive OAuth2 credential
   - **Resource:** `Folder`
   - **Operation:** `Create`
3. **Folder Settings:**
   - **Folder Name:** `Escher Finance Manager`

---

#### Node 3e: Merge Node

1. Add a **Merge** node to combine both branches
2. Set **Mode** to `Combine`
3. Set **Combine By:** `Merging By Index`

This ensures we have the root folder ID regardless of which path we took.

---

#### Node 3f: Google Drive - Find or Create Year Folder

Repeat the same pattern for the Year folder:

1. **Google Drive Search:**
   - **Query:** `name = '{{ $json.folderYear }}' and mimeType = 'application/vnd.google-apps.folder' and '{{ ROOT_FOLDER_ID }}' in parents and trashed = false`

2. **IF Node:** Check if exists

3. **Google Drive Create Folder (if not exists):**
   - **Folder Name:** `{{ $json.folderYear }}`
   - **Parent:** Use the root folder ID from previous step

---

#### Node 3g: Google Drive - Find or Create Month Folder

Repeat the same pattern for the Month folder:

1. **Google Drive Search:**
   - **Query:** `name = '{{ $json.folderMonth }}' and mimeType = 'application/vnd.google-apps.folder' and '{{ YEAR_FOLDER_ID }}' in parents and trashed = false`

2. **IF Node:** Check if exists

3. **Google Drive Create Folder (if not exists):**
   - **Folder Name:** `{{ $json.folderMonth }}`
   - **Parent:** Use the year folder ID from previous step

---

#### Node 3h: Google Drive - Upload Receipt File

1. Add a **Google Drive** node
2. Configure:
   - **Credential:** Select your Google Drive OAuth2 credential
   - **Resource:** `File`
   - **Operation:** `Upload`
3. **File Settings:**
   - **Input Binary Field:** `file`
   - **File Name:** `{{ $node["Code"].json.fileName }}`
   - **Parent Folder:** Use **Expression** → select the Month folder ID from previous node
4. **Options:**
   - **Share Permissions:** 
     - **Permission Type:** `Anyone With Link`
     - **Role:** `Reader`

---

#### Simplified Alternative: Single Upload to Fixed Folder

If you don't need the Year/Month folder structure, you can skip nodes 3b-3g and just:

1. Manually create the folder structure in Google Drive:
   - `Escher Finance Manager / 2026 / January` (and other months)

2. Use a single **Google Drive Upload** node:
   - **Resource:** `File`
   - **Operation:** `Upload`
   - **Input Binary Field:** `file`
   - **File Name:** `{{ $json.fileName }}`
   - **Parent Folder:** Manually select the target folder from dropdown

---

### Node 4: Google Sheets (Append Row)

1. Add a **Google Sheets** node
2. Configure:
   - **Credential:** Select your Google Sheets OAuth2 credential
   - **Resource:** Sheet Within Document
   - **Operation:** Append Row

3. **Document:**
   - Select your Google Sheet (or use Sheet ID)

4. **Sheet Name:** `Expenses`

5. **Columns:**
   | Column | Value |
   |--------|-------|
   | A (ID) | `{{ $node["HTTP Request"].json.data.id }}` |
   | B (Date) | `{{ $node["HTTP Request"].json.data.date }}` |
   | C (Category) | `{{ $node["HTTP Request"].json.data.category }}` |
   | D (Description) | `{{ $node["HTTP Request"].json.data.merchant }}` |
   | E (Amount) | `{{ $node["HTTP Request"].json.data.amount }}` |
   | F (Receipt URL) | `{{ $node["Google Drive"].json.webViewLink }}` |
   | G (Notes) | (leave empty) |

---

## Step 3: Handle Base64 to Binary Conversion

The HTTP Request node returns base64 image data. To upload to Google Drive, you need to convert it to binary.

### Option A: Use a Code Node

Add a **Code** node between HTTP Request and Google Drive:

```javascript
// Convert base64 to binary for Google Drive upload
const base64Data = $input.first().json.data.base64Image;
const mimeType = $input.first().json.data.mimeType;

// Remove data URI prefix if present
const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

// Return binary data
return [{
  json: $input.first().json,
  binary: {
    data: {
      data: cleanBase64,
      mimeType: mimeType,
      fileName: `receipt-${$input.first().json.data.id}.jpg`
    }
  }
}];
```

Then in the Google Drive node:
- Set **Input Binary Field** to `data`

---

## Step 4: Test the Workflow

1. **Activate** the workflow
2. **Send a test image** to your webhook
3. **Check:**
   - ✅ Gemini analysis returns correct data
   - ✅ Image uploads to Google Drive
   - ✅ Row appends to Google Sheets

---

## Troubleshooting

### "Invalid Credentials" Error on Google Drive/Sheets
- Re-authenticate your Google credentials in n8n
- Ensure Google Drive API and Sheets API are enabled in Google Cloud Console

### "Request body is empty"
- Check that the webhook is sending `base64Image` and `mimeType` fields
- Verify Content-Type is `application/json`

### "Invalid API key"
- Ensure `X-API-KEY` header matches `RECEIPT_API_KEY` in Vercel environment variables

---

## Complete Workflow JSON

You can import this workflow template into n8n:

```json
{
  "name": "Escher Receipt Processor",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "process-receipt",
        "responseMode": "responseNode"
      },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://your-app.vercel.app/api/process-receipt",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "Content-Type", "value": "application/json" },
            { "name": "X-API-KEY", "value": "your-api-key-here" }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "base64Image", "value": "={{ $json.imageData }}" },
            { "name": "mimeType", "value": "={{ $json.mimeType }}" }
          ]
        }
      },
      "name": "Analyze Receipt",
      "type": "n8n-nodes-base.httpRequest",
      "position": [450, 300]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{ "node": "Analyze Receipt", "type": "main", "index": 0 }]]
    }
  }
}
```

> **Note:** This is a minimal template. Add Google Drive and Google Sheets nodes as described above.

---

## Security Notes

- Never commit API keys to version control
- Use n8n's credential system for OAuth tokens
- The `X-API-KEY` should be a strong, randomly generated string
