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
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 pb-24">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm">WhatsApp Integration Bridge</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Bridge Integration Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex items-center gap-3">
              <div className="bg-indigo-600 p-2 rounded-lg text-white">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-indigo-900">WhatsApp App Bridge</h2>
                <p className="text-indigo-700 text-[10px] uppercase tracking-wider font-bold">Recommended Independent Mode</p>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Push Status Card */}
              <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 transition-colors ${hasPush ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                <div className="flex gap-3">
                  <div className={`p-2 rounded-lg ${hasPush ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                    {hasPush ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${hasPush ? 'text-emerald-900' : 'text-amber-900'}`}>{hasPush ? 'Push Bridge Ready' : 'Push Notification Needed'}</p>
                    <p className={`text-[10px] ${hasPush ? 'text-emerald-700' : 'text-amber-700'}`}>
                      {hasPush ? 'Backend will send notifications to this browser.' : 'Required for WhatsApp -> App bridge to work.'}
                    </p>
                  </div>
                </div>
                {!hasPush && (
                  <button onClick={handleEnablePush} className="px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg shadow-sm">Enable Now</button>
                )}
              </div>

              {/* Webhook Card */}
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                <div className="flex gap-3 mb-3">
                  <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-amber-900">Your Smart Bridge URL</p>
                    <p className="text-[10px] text-amber-700 leading-relaxed">
                      This URL contains your WhatsApp info and your Push token. Paste this into WAHA.
                    </p>
                  </div>
                </div>
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

              {/* WAHA Config */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">WAHA API URL</label>
                  <input
                    type="text"
                    value={config.apiUrl}
                    onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Session Name</label>
                  <input
                    type="text"
                    value={config.session}
                    onChange={(e) => setConfig({ ...config, session: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Allowed Senders</label>
                  <input
                    type="text"
                    value={config.allowedIds}
                    onChange={(e) => setConfig({ ...config, allowedIds: e.target.value })}
                    placeholder="628123xxx@c.us"
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 flex justify-end">
                <button
                  onClick={handleSave}
                  className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-bold transition-all active:scale-95 ${isSaved ? 'bg-emerald-500 text-white shadow-lg' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md'
                    }`}
                >
                  <Save className="w-5 h-5" />
                  {isSaved ? 'Settings Saved!' : 'Apply Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Guide */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-indigo-600" />
              How it works
            </h3>
            <div className="space-y-4 text-xs text-gray-600 leading-relaxed">
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="font-bold text-gray-900 mb-1">1. Zero-Click Logging</p>
                <p>The bridge now logs receipts to your Sheet *automatically* in the background.</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="font-bold text-gray-900 mb-1">2. Direct Verification</p>
                <p>You'll get a WhatsApp reply once the expense is safely stored in your Drive & Sheets.</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="font-bold text-gray-900 mb-1">3. App Link</p>
                <p>You can still tap the notification at any time to see your dashboard or fix a log.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
