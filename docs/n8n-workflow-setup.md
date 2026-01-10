# N8n Workflow Setup for Receipt Processing

This guide explains how to set up an n8n workflow to process WhatsApp receipts using n8n's native Google Drive and Google Sheets nodes.

## Architecture Overview

```
┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐    ┌──────────────┐
│  WhatsApp   │──▶ │  HTTP Request   │──▶ │  Google Drive   │──▶ │  Google      │──▶ │  Response    │
│  Trigger    │    │  (Gemini API)   │    │  (Upload)       │    │  Sheets      │    │              │
└─────────────┘    └─────────────────┘    └─────────────────┘    └──────────────┘    └──────────────┘
```

---

## Prerequisites

1. **n8n instance** with Google OAuth credentials configured
2. **Vercel app** deployed with `RECEIPT_API_KEY` and `API_KEY` (Gemini) set
3. **Google Drive folder** manually created:
   - Create: `Escher Finance Manager / 2026 / January` (and other months as needed)
4. **Google Sheet** with an "Expenses" sheet

---

## Step 1: Create Google OAuth Credentials

1. Go to **Settings → Credentials → Add Credential**
2. Add **Google Drive OAuth2 API** credential
3. Add **Google Sheets OAuth2 API** credential
4. Sign in and grant permissions for each

---

## Step 2: Create the Workflow

### Node 1: Webhook (Trigger)

1. Add a **Webhook** node
2. **HTTP Method:** `POST`
3. Copy the webhook URL for your WhatsApp integration

---

### Node 2: HTTP Request (Analyze Receipt)

Calls the Vercel API to analyze the receipt with Gemini AI.

1. Add an **HTTP Request** node, name it `Analyze Receipt`
2. Configure:
   - **Method:** `POST`
   - **URL:** `https://escher-financial-manager.vercel.app/api/process-receipt`
3. **Send Headers:** ON
4. **Header Parameters:**
   | Name | Value |
   |------|-------|
   | `Content-Type` | `application/json` |
   | `X-API-KEY` | `your-receipt-api-key` |
5. **Send Body:** ON
6. **Body Content Type:** `JSON`
7. **Body:**
   ```json
   {
     "base64Image": "={{ $json.imageData }}",
     "mimeType": "={{ $json.mimeType }}"
   }
   ```

**Response contains:**
```json
{
  "success": true,
  "expense": {
    "id": "20260110-Food-restaurant",
    "date": "2026-01-10",
    "category": "Food",
    "merchant": "Restaurant Name",
    "amount": 150000,
    "fileName": "receipt-20260110-Food-restaurant.jpg",
    "folderYear": "2026",
    "folderMonth": "January"
  },
  "base64Image": "...",
  "mimeType": "image/jpeg"
}
```

---

### Node 3: Code (Convert to Binary)

Converts the base64 image to binary for Google Drive upload.

1. Add a **Code** node, name it `Convert to Binary`
2. **Mode:** `Run Once for All Items`
3. **Code:**

```javascript
const items = $input.all();

return Promise.all(items.map(async (item) => {
  const base64Data = item.json.base64Image;
  const mimeType = item.json.mimeType;
  const fileName = item.json.expense.fileName;
  
  // Clean base64 (remove data URI prefix if present)
  const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
  
  return {
    json: item.json,
    binary: {
      file: await this.helpers.prepareBinaryData(
        Buffer.from(cleanBase64, 'base64'),
        fileName,
        mimeType
      )
    }
  };
}));
```

---

### Node 4: Google Drive (Upload File)

Uploads the receipt image to Google Drive.

1. Add a **Google Drive** node, name it `Upload to Drive`
2. Configure:
   - **Credential:** Select your Google Drive credential
   - **Resource:** `File`
   - **Operation:** `Upload`
3. **Input Data Field Name:** `file`
4. **File Name** (Expression): `={{ $json.expense.fileName }}`
5. **Parent Drive:** `My Drive`
6. **Parent Folder:** 
   - Click the dropdown and navigate to your pre-created folder
   - Select: `Escher Finance Manager / 2026 / January`
   
   > **Note:** For dynamic folders, you'll need to add folder lookup nodes. For simplicity, start with a fixed folder.

7. **Options → Add option → Permissions:**
   - Click **Add Permission**
   - **Type:** `Anyone`
   - **Role:** `Reader`

---

### Node 5: Google Sheets (Append Row)

Adds the expense to your Google Sheet.

1. Add a **Google Sheets** node, name it `Log to Sheet`
2. Configure:
   - **Credential:** Select your Google Sheets credential
   - **Resource:** `Sheet`
   - **Operation:** `Append Row`
3. **Document:** Select your Google Sheet
4. **Sheet Name:** `Expenses`
5. **Mapping → Manual Mapping:**

| Column | Value |
|--------|-------|
| ID | `={{ $node["Analyze Receipt"].json.expense.id }}` |
| Date | `={{ $node["Analyze Receipt"].json.expense.date }}` |
| Category | `={{ $node["Analyze Receipt"].json.expense.category }}` |
| Description | `={{ $node["Analyze Receipt"].json.expense.merchant }}` |
| Amount | `={{ $node["Analyze Receipt"].json.expense.amount }}` |
| Receipt URL | `={{ $node["Upload to Drive"].json.webViewLink }}` |
| Notes | (leave empty) |

---

## Workflow Connections

```
Webhook → Analyze Receipt → Convert to Binary → Upload to Drive → Log to Sheet
```

Make sure each node connects to the next in sequence.

---

## Testing

1. **Activate** the workflow
2. **Send a test request** to your webhook with:
   ```json
   {
     "imageData": "base64-encoded-image-here",
     "mimeType": "image/jpeg"
   }
   ```
3. **Check:**
   - ✅ Receipt analyzed correctly
   - ✅ File uploaded to Google Drive
   - ✅ Row added to Google Sheets

---

## Troubleshooting

### Binary Data Lost

If Google Drive upload fails with "no binary data":
- Make sure the Code node is directly before the Google Drive node
- Check that `this.helpers.prepareBinaryData` is used correctly

### 401 Invalid Credentials

- Re-authenticate your Google credentials in n8n
- Ensure APIs are enabled in Google Cloud Console

### Folder Not Found

- Manually create the folder structure in Google Drive first
- Make sure the folder is in "My Drive", not shared with you

---

## Dynamic Folder Structure (Advanced)

If you want folders created automatically based on date, you'll need additional nodes:

1. **Google Drive Search** - Find or create year folder
2. **IF Node** - Check if exists
3. **Google Drive Create Folder** - Create if not exists
4. **Repeat for month folder**

This is complex due to binary data not passing through IF nodes. The simpler approach is to manually create folders monthly.
