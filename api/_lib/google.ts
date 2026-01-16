import crypto from 'crypto';
const CLIENT_ID = '691804601172-eg2ajh42fmeep7a67g48rf7ospnun11g.apps.googleusercontent.com';

export async function refreshGoogleToken(refreshToken: string): Promise<string> {
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    if (!CLIENT_SECRET) throw new Error("GOOGLE_CLIENT_SECRET missing on server");

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'refresh_token',
        }).toString(),
    });

    if (!response.ok) {
        throw new Error(`Token Refresh Failed: ${await response.text()}`);
    }

    const data = await response.json();
    return data.access_token;
}

export async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
    const header = {
        alg: 'RS256',
        typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const claimSet = {
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedClaimSet = Buffer.from(JSON.stringify(claimSet)).toString('base64url');
    const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    sign.end();

    const signature = sign.sign(privateKey.replace(/\\n/g, '\n'), 'base64url');
    const jwt = `${encodedHeader}.${encodedClaimSet}.${signature}`;

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Auth Failed: ${errorText}`);
    }

    const data = await response.json();
    return data.access_token;
}

export async function findOrCreateFolder(token: string, folderName: string, parentId?: string): Promise<string> {
    const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentId ? ` and '${parentId}' in parents` : ''}`;
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`;

    const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${token}` }
    });

    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
    }

    // Create
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId ? [parentId] : []
        })
    });

    const createData = await createRes.json();
    return createData.id;
}

export async function uploadToDrive(token: string, folderId: string, base64: string, fileName: string, mimeType: string): Promise<string> {
    const metadata = {
        name: fileName,
        parents: [folderId]
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const body =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        `Content-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
        base64 +
        closeDelimiter;

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: body
    });

    if (!response.ok) {
        throw new Error(`Drive Upload Error: ${await response.text()}`);
    }

    const data = await response.json();
    const fileId = data.id;

    // Set permissions
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    return `https://drive.google.com/file/d/${fileId}/view`;
}

export async function appendToSheet(token: string, spreadsheetId: string, range: string, values: any[]) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [values] })
    });

    if (!response.ok) {
        throw new Error(`Sheet Append Error: ${await response.text()}`);
    }
}
