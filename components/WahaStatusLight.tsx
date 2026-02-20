import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, AlertCircle, CheckCircle2 } from 'lucide-react';

const WahaStatusLight: React.FC = () => {
    const [status, setStatus] = useState<'WORKING' | 'SCAN_QR_CODE' | 'STOPPED' | 'error' | 'offline' | 'unconfigured' | 'loading'>('loading');
    const [message, setMessage] = useState('');

    const checkStatus = async () => {
        try {
            const configObj = JSON.parse(localStorage.getItem('escher_waha_config') || '{}');
            const encodedConfig = btoa(JSON.stringify(configObj));
            const res = await fetch(`/api/webhook/waha-status?c=${encodedConfig}`);
            const data = await res.json();
            setStatus(data.status);
            setMessage(data.message);
        } catch (e) {
            setStatus('offline');
            setMessage('Failed to connect to status API');
        }
    };

    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 30000); // Check every 30 seconds
        return () => clearInterval(interval);
    }, []);

    const getStatusInfo = () => {
        switch (status) {
            case 'WORKING':
                return {
                    color: 'text-emerald-500',
                    bg: 'bg-emerald-500/10',
                    icon: <CheckCircle2 className="w-3 h-3" />,
                    label: 'WAHA Online'
                };
            case 'SCAN_QR_CODE':
                return {
                    color: 'text-amber-500',
                    bg: 'bg-amber-500/10',
                    icon: <AlertCircle className="w-3 h-3" />,
                    label: 'QR Code Needed'
                };
            case 'NO_WEBHOOK':
                return {
                    color: 'text-amber-500',
                    bg: 'bg-amber-500/10',
                    icon: <Wifi className="w-3 h-3" />,
                    label: 'Webhook Missing'
                };
            case 'loading':
                return {
                    color: 'text-gray-400',
                    bg: 'bg-gray-400/10',
                    icon: <div className="w-2 h-2 rounded-full border-b border-gray-400 animate-spin" />,
                    label: 'Checking...'
                };
            case 'unconfigured':
                return {
                    color: 'text-gray-400',
                    bg: 'bg-gray-400/10',
                    icon: <AlertCircle className="w-3 h-3" />,
                    label: 'Unconfigured'
                };
            default:
                return {
                    color: 'text-red-500',
                    bg: 'bg-red-500/10',
                    icon: <WifiOff className="w-3 h-3" />,
                    label: 'WAHA Offline'
                };
        }
    };

    const info = getStatusInfo();

    return (
        <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${info.bg} ${info.color} transition-all duration-500 cursor-pointer hover:scale-105 active:scale-95`}
            title={`${message || info.label} (Click to refresh)`}
            onClick={(e) => {
                e.stopPropagation();
                setStatus('loading');
                checkStatus();
            }}
        >
            <div className={`w-2 h-2 rounded-full ${info.color.replace('text', 'bg')} animate-pulse`} />
            <span className="text-[10px] font-bold uppercase tracking-tight hidden sm:inline">
                {info.label}
            </span>
        </div>
    );
};

export default WahaStatusLight;
