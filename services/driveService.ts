import { User } from '../types';

const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

// Upload receipt image to Google Drive and return shareable link
export const uploadReceiptToDrive = async (
    user: User,
    base64Data: string,
    mimeType: string,
    fileName: string
): Promise<string> => {
    // Create metadata for the file
    const metadata = {
        name: fileName,
        mimeType: mimeType,
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
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
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
