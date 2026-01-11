import React from 'react';
import { Notification } from '../types';
import { markAsRead, markAllAsRead } from '../services/notificationStorageService';
import { Bell, Receipt, AlertTriangle, AlertCircle, Check, Smartphone, MessageCircle, FileEdit } from 'lucide-react';

interface NotificationPageProps {
    notifications: Notification[];
    onNotificationsChange: () => void;
}

const NotificationPage: React.FC<NotificationPageProps> = ({ notifications, onNotificationsChange }) => {

    const handleMarkAsRead = (id: string) => {
        markAsRead(id);
        onNotificationsChange();
    };

    const handleMarkAllAsRead = () => {
        markAllAsRead();
        onNotificationsChange();
    };

    const getIcon = (type: Notification['type']) => {
        switch (type) {
            case 'receipt':
                return <Receipt className="w-5 h-5 text-emerald-500" />;
            case 'budget-warning':
                return <AlertTriangle className="w-5 h-5 text-amber-500" />;
            case 'budget-exceeded':
                return <AlertCircle className="w-5 h-5 text-red-500" />;
            default:
                return <Bell className="w-5 h-5 text-gray-500" />;
        }
    };

    const getSourceIcon = (source: Notification['source']) => {
        switch (source) {
            case 'app':
                return <Smartphone className="w-3 h-3" />;
            case 'whatsapp':
                return <MessageCircle className="w-3 h-3" />;
            case 'manual-edit':
                return <FileEdit className="w-3 h-3" />;
        }
    };

    const getSourceLabel = (source: Notification['source']) => {
        switch (source) {
            case 'app':
                return 'App';
            case 'whatsapp':
                return 'WhatsApp';
            case 'manual-edit':
                return 'Manual Edit';
        }
    };

    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const groupNotificationsByDate = (notifications: Notification[]) => {
        const groups: { [key: string]: Notification[] } = {};
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        notifications.forEach(n => {
            const dateStr = new Date(n.timestamp).toDateString();
            let label = dateStr;
            if (dateStr === today) label = 'Today';
            else if (dateStr === yesterday) label = 'Yesterday';

            if (!groups[label]) groups[label] = [];
            groups[label].push(n);
        });

        return groups;
    };

    const unreadCount = notifications.filter(n => !n.read).length;
    const groupedNotifications = groupNotificationsByDate(notifications);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                        {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
                    </span>
                </div>
                {unreadCount > 0 && (
                    <button
                        onClick={handleMarkAllAsRead}
                        className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                        <Check className="w-4 h-4" />
                        Mark all as read
                    </button>
                )}
            </div>

            {/* Notification List */}
            <div className="flex-1 overflow-y-auto">
                {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
                        <Bell className="w-12 h-12 mb-3 opacity-30" />
                        <p className="font-medium">No notifications yet</p>
                        <p className="text-sm mt-1">You'll see receipt and budget alerts here</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {Object.entries(groupedNotifications).map(([dateLabel, items]) => (
                            <div key={dateLabel}>
                                <div className="px-4 py-2 bg-gray-50 sticky top-0">
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                                        {dateLabel}
                                    </span>
                                </div>
                                {items.map(notification => (
                                    <div
                                        key={notification.id}
                                        onClick={() => !notification.read && handleMarkAsRead(notification.id)}
                                        className={`px-4 py-3 flex gap-3 cursor-pointer hover:bg-gray-50 transition-colors ${!notification.read ? 'bg-indigo-50/50' : ''
                                            }`}
                                    >
                                        {/* Icon */}
                                        <div className="flex-shrink-0 mt-0.5">
                                            {getIcon(notification.type)}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={`text-sm ${!notification.read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                                                    {notification.title}
                                                </p>
                                                {!notification.read && (
                                                    <div className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0 mt-1.5" />
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                                                {notification.message}
                                            </p>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                {notification.type === 'receipt' && (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                                                        {getSourceIcon(notification.source)}
                                                        {getSourceLabel(notification.source)}
                                                    </span>
                                                )}
                                                <span className="text-xs text-gray-400">
                                                    {formatTimestamp(notification.timestamp)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationPage;
