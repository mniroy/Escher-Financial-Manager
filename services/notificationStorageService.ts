import { Notification } from '../types';

const NOTIFICATIONS_KEY = 'escher_notifications';
const MAX_NOTIFICATIONS = 50; // Keep only the last 50 notifications

export const getNotifications = (): Notification[] => {
    try {
        const stored = localStorage.getItem(NOTIFICATIONS_KEY);
        if (!stored) return [];
        return JSON.parse(stored);
    } catch {
        return [];
    }
};

export const saveNotification = (notification: Notification): void => {
    const notifications = getNotifications();
    // Add new notification at the beginning
    notifications.unshift(notification);
    // Keep only the last MAX_NOTIFICATIONS
    const trimmed = notifications.slice(0, MAX_NOTIFICATIONS);
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(trimmed));
};

export const markAsRead = (id: string): void => {
    const notifications = getNotifications();
    const updated = notifications.map(n =>
        n.id === id ? { ...n, read: true } : n
    );
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
};

export const markAllAsRead = (): void => {
    const notifications = getNotifications();
    const updated = notifications.map(n => ({ ...n, read: true }));
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(updated));
};

export const clearNotifications = (): void => {
    localStorage.removeItem(NOTIFICATIONS_KEY);
};

export const getUnreadCount = (): number => {
    const notifications = getNotifications();
    return notifications.filter(n => !n.read).length;
};

export const createNotification = (
    type: Notification['type'],
    source: Notification['source'],
    title: string,
    message: string,
    expenseId?: string,
    category?: string
): Notification => {
    return {
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        source,
        title,
        message,
        timestamp: new Date().toISOString(),
        read: false,
        expenseId,
        category,
    };
};
