import type { VercelRequest, VercelResponse } from '@vercel/node';

// Web Push notification sender
// Uses VAPID keys for authentication

interface NotificationPayload {
    subscription: {
        endpoint: string;
        keys: {
            p256dh: string;
            auth: string;
        };
    };
    title: string;
    body: string;
    icon?: string;
    url?: string;
    tag?: string;
}

// VAPID keys
const VAPID_PUBLIC_KEY = 'BOUiCelRDI6tqCK4bPZkJgUz_rxM0svy2A9kXztJq50HHwvs4UkQKlcf8rpBhQ1WKaN6EVysOWaOv_BkQFK1BtU';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check for VAPID private key
    if (!VAPID_PRIVATE_KEY) {
        console.error('VAPID_PRIVATE_KEY not configured');
        return res.status(500).json({ error: 'Push notifications not configured' });
    }

    try {
        const payload: NotificationPayload = req.body;

        // Validate payload
        if (!payload.subscription || !payload.subscription.endpoint) {
            return res.status(400).json({ error: 'Invalid subscription' });
        }

        if (!payload.title || !payload.body) {
            return res.status(400).json({ error: 'Title and body are required' });
        }

        // Dynamically import web-push (it's a Node.js module)
        const webpush = await import('web-push');

        // Configure VAPID
        webpush.setVapidDetails(
            'mailto:escher@financial-manager.app',
            VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY
        );

        // Create notification payload
        const notificationPayload = JSON.stringify({
            title: payload.title,
            body: payload.body,
            icon: payload.icon || '/icon-512.png',
            url: payload.url || '/',
            tag: payload.tag || 'escher-notification'
        });

        // Send push notification
        await webpush.sendNotification(
            payload.subscription,
            notificationPayload
        );

        return res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('Push notification error:', error);

        // Handle expired subscription
        if (error.statusCode === 410 || error.statusCode === 404) {
            return res.status(410).json({ error: 'Subscription expired or invalid' });
        }

        return res.status(500).json({
            error: 'Failed to send notification',
            details: error.message
        });
    }
}
