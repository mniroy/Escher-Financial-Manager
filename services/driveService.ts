import { User } from '../types';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

// Month names for folder naming
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// In-memory cache for folder IDs to prevent race conditions
// Key format: "parentId:folderName" or ":folderName" for root
const folderCache: Map<string, string> = new Map();

// In-memory lock for folder creation to prevent duplicate creation attempts
// Key format: "parentId:folderName"
const folderLocks: Map<string, Promise<string>> = new Map();

// Find a folder by name within a parent folder (or root if no parent)
const findFolder = async (
    accessToken: string,
    folderName: string,
    parentId?: string
): Promise<string | null> => {
    let query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) {
        query += ` and '${parentId}' in parents`;
    }

    const response = await fetch(
        `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
        {
            headers: { Authorization: `Bearer ${accessToken}` },
        }
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data.files && data.files.length > 0) {
        return data.files[0].id;
    }
    return null;
};

// Create a folder with optional parent
const createFolder = async (
    accessToken: string,
    folderName: string,
    parentId?: string
): Promise<string> => {
    const metadata: any = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
    };

    if (parentId) {
        metadata.parents = [parentId];
    }

    const response = await fetch(`${DRIVE_API_URL}/files`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
    });

    if (!response.ok) {
        // If folder creation fails, it might be because another request just created it
        // Try to find it again
        const existingId = await findFolder(accessToken, folderName, parentId);
        if (existingId) {
            return existingId;
        }
        throw new Error(`Failed to create folder: ${folderName}`);
    }

    const data = await response.json();
    return data.id;
};

// Find or create a folder with locking to prevent race conditions
const ensureFolder = async (
    accessToken: string,
    folderName: string,
    parentId?: string
): Promise<string> => {
    const cacheKey = `${parentId || ''}:${folderName}`;

    // Check cache first
    const cachedId = folderCache.get(cacheKey);
    if (cachedId) {
        return cachedId;
    }

    // Check if another request is already creating this folder
    const existingLock = folderLocks.get(cacheKey);
    if (existingLock) {
        // Wait for the other request to finish
        return await existingLock;
    }

    // Create a promise that will be used as a lock
    const lockPromise = (async () => {
        try {
            // First, try to find existing folder
            let folderId = await findFolder(accessToken, folderName, parentId);

            if (!folderId) {
                // Create the folder
                folderId = await createFolder(accessToken, folderName, parentId);
            }

            // Cache the result
            folderCache.set(cacheKey, folderId);
            return folderId;
        } finally {
            // Release the lock
            folderLocks.delete(cacheKey);
        }
    })();

    // Set the lock
    folderLocks.set(cacheKey, lockPromise);

    return await lockPromise;
};

// Get the folder ID for the receipt destination (creates folder structure if needed)
// Structure: Escher Finance Manager / 2026 / January /
const getReceiptFolderId = async (
    accessToken: string,
    expenseDate: Date
): Promise<string> => {
    // 1. Find or create root folder "Escher Finance Manager"
    const rootFolderId = await ensureFolder(accessToken, 'Escher Finance Manager');

    // 2. Find or create year folder (e.g., "2026")
    const year = expenseDate.getFullYear().toString();
    const yearFolderId = await ensureFolder(accessToken, year, rootFolderId);

    // 3. Find or create month folder (e.g., "January")
    const month = MONTH_NAMES[expenseDate.getMonth()];
    const monthFolderId = await ensureFolder(accessToken, month, yearFolderId);

    return monthFolderId;
};

// Upload receipt image to Google Drive and return shareable link
export const uploadReceiptToDrive = async (
    user: User,
    base64Data: string,
    mimeType: string,
    fileName: string,
    expenseDate?: string // Optional: YYYY-MM-DD format
): Promise<string> => {
    // Parse the expense date or use current date
    const date = expenseDate ? new Date(expenseDate) : new Date();

    // Get the target folder ID (creates folder structure if needed)
    const folderId = await getReceiptFolderId(user.accessToken, date);

    // Create metadata for the file
    const metadata = {
        name: fileName,
        mimeType: mimeType,
        parents: [folderId], // Upload to the organized folder
    };

    // Convert base64 to binary
    const binaryData = atob(base64Data);
    const bytes = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });

    // Create multipart form data
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    // Upload to Drive
    const uploadResponse = await fetch(DRIVE_UPLOAD_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${user.accessToken}`,
        },
        body: form,
    });

    if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('Drive upload error:', errorText);
        throw new Error('Failed to upload receipt to Google Drive');
    }

    const fileData = await uploadResponse.json();
    const fileId = fileData.id;

    // Make the file viewable by anyone with the link
    await fetch(`${DRIVE_API_URL}/files/${fileId}/permissions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${user.accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            role: 'reader',
            type: 'anyone',
        }),
    });

    // Return the shareable link
    return `https://drive.google.com/file/d/${fileId}/view`;
};
