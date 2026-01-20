import React, { useState, useEffect } from 'react';
import { Save, MessageSquare, Shield, Globe, Info, Workflow, Copy, Bell, BellOff, ExternalLink } from 'lucide-react';
import { getWahaConfig, saveWahaConfig } from '../services/wahaService';
import { getSavedSubscription, subscribeToPush, isNotificationPermissionGranted, requestNotificationPermission } from '../services/pushNotificationService';
import { WahaConfig } from '../types';

const Settings: React.FC = () => {
  const [config, setConfig] = useState<WahaConfig>(getWahaConfig());
  const [isSaved, setIsSaved] = useState(false);
  const [hasPush, setHasPush] = useState(isNotificationPermissionGranted());

  useEffect(() => {
    if (isSaved) {
      const timer = setTimeout(() => setIsSaved(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSaved]);

  const handleSave = () => {
    saveWahaConfig(config);
    setIsSaved(true);
  };

  const handleEnablePush = async () => {
    const permission = await requestNotificationPermission();
    if (permission === 'granted') {
      await subscribeToPush();
      setHasPush(true);
    }
  };

  const generateWebhookUrl = () => {
    const baseUrl = `${window.location.origin}/api/webhook/waha`;
    const subscription = getSavedSubscription();
    const user = JSON.parse(localStorage.getItem('escher_user_session') || '{}');

    const configData: any = {
      w: config.apiUrl,
      s: config.session,
      a: config.allowedIds,
      rt: user.refreshToken, // Pass refresh token for background logging
      sid: user.spreadsheetId, // Pass sheet ID
      ps: subscription
    };

    const encoded = btoa(JSON.stringify(configData));
    return `${baseUrl}?c=${encoded}`;
  };

  const webhookUrl = generateWebhookUrl();

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6 pb-24">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">Webhook Settings</h1>
        <p className="text-gray-500 text-sm">Copy this URL to your WAHA Webhooks</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 space-y-6">
          {/* Webhook Card */}
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <div className="flex gap-2">
              <div className="flex-1 min-w-0 overflow-hidden font-mono text-[10px] bg-white/60 p-2.5 rounded-lg border border-amber-200 text-amber-900 break-all select-all">
                {webhookUrl}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  alert("Bridge URL Copied!");
                }}
                className="p-2.5 bg-white border border-amber-200 rounded-lg hover:bg-amber-100 transition-all active:scale-95 shadow-sm"
              >
                <Copy className="w-5 h-5 text-amber-700" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
