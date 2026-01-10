# N8n Workflow Setup for Receipt Processing

This guide explains how to set up an n8n workflow to process WhatsApp receipts using n8n's native Google Drive and Google Sheets nodes with automatic folder creation.

## Architecture Overview

```
Webhook → Analyze Receipt → Convert to Binary ─┬─→ Find/Create Folders → Upload → Sheets
                                                │
                                                └─→ (Binary stored, referenced later)
```

**Key insight:** Binary data is lost when passing through IF/Merge nodes, but we can reference it directly from the source node using `$node["Convert to Binary"].binary.file`.

---

## Prerequisites

1. **n8n instance** with Google OAuth credentials configured
2. **Vercel app** deployed with `RECEIPT_API_KEY` and `API_KEY` (Gemini) set
3. **Google Drive/Sheets OAuth credentials** in n8n

---

## Step 1: Create Google OAuth Credentials

1. Go to **Settings → Credentials → Add Credential**
2. Add **Google Drive OAuth2 API** credential (name it: `Google Drive account`)
3. Add **Google Sheets OAuth2 API** credential
4. Sign in and grant permissions

---

## Step 2: Create the Workflow Nodes

### Node 1: Webhook (Trigger)

1. Add a **Webhook** node
2. **HTTP Method:** `POST`
3. Copy the webhook URL

---

### Node 2: HTTP Request (Analyze Receipt)

1. Add an **HTTP Request** node, name it `Analyze Receipt`
2. **Method:** `POST`
3. **URL:** `https://escher-financial-manager.vercel.app/api/process-receipt`
4. **Headers:**
   - `Content-Type`: `application/json`
   - `X-API-KEY`: `your-api-key`
5. **Body (JSON):**
   ```json
   {
     "base64Image": "={{ $json.imageData }}",
     "mimeType": "={{ $json.mimeType }}"
   }
   ```

---

### Node 3: Code (Convert to Binary)

> **Important:** Name this node exactly `Convert to Binary` - we reference it later!

1. Add a **Code** node, name it `Convert to Binary`
2. **Mode:** `Run Once for All Items`
3. **Code:**

```javascript
const items = $input.all();

return Promise.all(items.map(async (item) => {
  const base64Data = item.json.base64Image;
  const mimeType = item.json.mimeType;
  const fileName = item.json.expense.fileName;
  
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

### Node 4: Find Root Folder

1. Add a **Google Drive** node, name it `Find Root Folder`
2. **Credential:** `Google Drive account`
3. **Resource:** `File/Folder`
4. **Operation:** `Search`
5. **Search Method:** `Search File/Folder Name`
6. **Search Query:** `Escher Finance Manager`
7. **Return All:** ON
8. **Add Filter:**
   - **Mime Type:** `application/vnd.google-apps.folder`

---

### Node 5: Check Root Exists (IF)

1. Add an **IF** node, name it `Check Root Exists`
2. **Condition:**
   - **Value 1:** `{{ $json.id }}` (Expression mode)
   - **Operation:** `Is Not Empty`

---

### Node 6: Create Root Folder (False Branch)

1. Add a **Google Drive** node on the **False** output, name it `Create Root Folder`
2. **Credential:** `Google Drive account`
3. **Resource:** `Folder`
4. **Operation:** `Create`
5. **Folder Name:** `Escher Finance Manager`

---

### Node 7: Merge Root Folder

1. Add a **Merge** node, name it `Merge Root Folder`
2. Connect **Input 1** ← True branch from Check Root Exists
3. Connect **Input 2** ← Output from Create Root Folder
4. **Mode:** `Append`

---

### Nodes 8-11: Year Folder (Same Pattern)

Repeat for year folder:

**Node 8: Find Year Folder**
- **Search Query:** `={{ $node["Convert to Binary"].json.expense.folderYear }}`
- **Add Filter → Parent Folder:** `={{ $node["Merge Root Folder"].json.id }}`

**Node 9: Check Year Exists**
- Same as Check Root Exists

**Node 10: Create Year Folder (False)**
- **Folder Name:** `={{ $node["Convert to Binary"].json.expense.folderYear }}`
- **Parent:** `={{ $node["Merge Root Folder"].json.id }}`

**Node 11: Merge Year Folder**
- Same pattern

---

### Nodes 12-15: Month Folder (Same Pattern)

Repeat for month folder:

**Node 12: Find Month Folder**
- **Search Query:** `={{ $node["Convert to Binary"].json.expense.folderMonth }}`
- **Add Filter → Parent Folder:** `={{ $node["Merge Year Folder"].json.id }}`

**Node 13: Check Month Exists**
- Same pattern

**Node 14: Create Month Folder (False)**
- **Folder Name:** `={{ $node["Convert to Binary"].json.expense.folderMonth }}`
- **Parent:** `={{ $node["Merge Year Folder"].json.id }}`

**Node 15: Merge Month Folder**
- Same pattern

---

### Node 16: Upload Receipt File

> **The key to solving binary data loss!**

1. Add a **Google Drive** node, name it `Upload Receipt`
2. **Credential:** `Google Drive account`
3. **Resource:** `File`
4. **Operation:** `Upload`
5. **Input Data Field Name:** `file`

   > **CRITICAL:** Since binary data was lost through IF/Merge nodes, we need to reference it from the source. Check if n8n allows expressions here.

6. **File Name:** `={{ $node["Convert to Binary"].json.expense.fileName }}`
7. **Parent Folder:**
   - **By ID**
   - **Value:** `={{ $node["Merge Month Folder"].json.id }}`
8. **Options → Permissions:**
   - **Type:** `Anyone`
   - **Role:** `Reader`

### Solving the Binary Data Problem

If the Upload node can't find binary data (the common issue), try these solutions:

**Solution A: Use "Binary Property" Option**
1. In Upload Receipt node, go to **Options**
2. Look for "Binary Property" or similar
3. Set it to reference the source node: `$node["Convert to Binary"].binary.file`

**Solution B: Use SET Node to Store Binary**
1. Before the folder chain, add a **Set** node to explicitly pass through the binary
2. Configure it to keep binary data

**Solution C: Parallel Execution**
1. Use an **Execute Workflow** node to run folder creation separately
2. The main flow keeps binary data intact

---

### Node 17: Google Sheets (Append Row)

1. Add a **Google Sheets** node, name it `Log to Sheet`
2. **Credential:** Google Sheets credential
3. **Operation:** `Append Row`
4. **Document:** Select your sheet
5. **Sheet Name:** `Expenses`
6. **Columns:**

| Column | Value |
|--------|-------|
| ID | `={{ $node["Convert to Binary"].json.expense.id }}` |
| Date | `={{ $node["Convert to Binary"].json.expense.date }}` |
| Category | `={{ $node["Convert to Binary"].json.expense.category }}` |
| Description | `={{ $node["Convert to Binary"].json.expense.merchant }}` |
| Amount | `={{ $node["Convert to Binary"].json.expense.amount }}` |
| Receipt URL | `={{ $node["Upload Receipt"].json.webViewLink }}` |

---

## Complete Node Reference

| # | Node Name | Expression to Reference |
|---|-----------|------------------------|
| 3 | `Convert to Binary` | `$node["Convert to Binary"].json.expense.*` |
| 7 | `Merge Root Folder` | `$node["Merge Root Folder"].json.id` |
| 11 | `Merge Year Folder` | `$node["Merge Year Folder"].json.id` |
| 15 | `Merge Month Folder` | `$node["Merge Month Folder"].json.id` |
| 16 | `Upload Receipt` | `$node["Upload Receipt"].json.webViewLink` |

---

## Troubleshooting

### Binary Data Not Found

The most common issue. Try:
1. Reference binary directly: `$node["Convert to Binary"].binary.file`
2. Use n8n's "Keep Binary Data" option if available
3. As a last resort, use the fixed folder approach

### Folder Already Exists Error

The workflow handles this with IF checks. If you still get errors, the Search node might not be finding existing folders correctly.

### 401 Authentication Error

Re-authenticate your Google credentials in n8n Settings → Credentials.
