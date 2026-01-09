// Push Notification Service
// Handles Web Push API subscription and notification management

import { VAPID_PUBLIC_KEY } from './vapidKeys';

// Convert VAPID key from base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Check if push notifications are supported
export const isPushSupported = (): boolean => {
    return 'serviceWorker' in navigator && 'PushManager' in window;
};

// Check if notifications are enabled
export const isNotificationPermissionGranted = (): boolean => {
    return Notification.permission === 'granted';
};

// Request notification permission
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
    if (!isPushSupported()) {
        console.log('Push notifications not supported');
        return 'denied';
    }

    const permission = await Notification.requestPermission();
    console.log('Notification permission:', permission);
    return permission;
};

// Subscribe to push notifications
export const subscribeToPush = async (): Promise<PushSubscription | null> => {
    if (!isPushSupported()) {
        console.log('Push not supported');
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.ready;

        // Check if already subscribed
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            // Subscribe with VAPID key
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
            console.log('Push subscription created:', subscription);

            // Save subscription to localStorage for persistence
            saveSubscription(subscription);
        }

        return subscription;
    } catch (error) {
        console.error('Failed to subscribe to push:', error);
        return null;
    }
};

// Get current subscription
export const getSubscription = async (): Promise<PushSubscription | null> => {
    if (!isPushSupported()) return null;

    try {
        const registration = await navigator.serviceWorker.ready;
        return await registration.pushManager.getSubscription();
    } catch {
        return null;
    }
};

// Unsubscribe from push
export const unsubscribeFromPush = async (): Promise<boolean> => {
    const subscription = await getSubscription();
    if (subscription) {
        await subscription.unsubscribe();
        localStorage.removeItem('escher_push_subscription');
        return true;
    }
    return false;
};

// Save subscription to localStorage
const saveSubscription = (subscription: PushSubscription): void => {
    localStorage.setItem('escher_push_subscription', JSON.stringify(subscription.toJSON()));
};

// Get saved subscription from localStorage
export const getSavedSubscription = (): PushSubscriptionJSON | null => {
    const saved = localStorage.getItem('escher_push_subscription');
    if (!saved) return null;
    try {
        return JSON.parse(saved);
    } catch {
        return null;
    }
};

// Send a local notification (for immediate feedback)
export const showLocalNotification = async (title: string, body: string, icon?: string): Promise<void> => {
    if (!isNotificationPermissionGranted()) {
        console.log('Notification permission not granted');
        return;
    }

    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
        body,
        icon: icon || '/icon-512.png',
        badge: '/icon-512.png',
        tag: 'escher-notification',
        renotify: true
    } as NotificationOptions);
};

// Send push notification via API (for when app is in background)
export const sendPushNotification = async (
    title: string,
    body: string,
    subscription?: PushSubscriptionJSON
): Promise<boolean> => {
    const sub = subscription || getSavedSubscription();
    if (!sub) {
        console.log('No subscription available');
        return false;
    }

    try {
        const response = await fetch('/api/send-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subscription: sub,
                title,
                body,
                icon: '/icon-512.png'
            })
        });

        return response.ok;
    } catch (error) {
        console.error('Failed to send push notification:', error);
        return false;
    }
};
