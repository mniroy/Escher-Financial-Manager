import React, { useState, useEffect } from 'react';
import { Save, MessageSquare, Shield, Globe, Info, Workflow, Copy, Bell, BellOff, ExternalLink, Calendar, Plus, Trash2, Clock } from 'lucide-react';
import { getWahaConfig, saveWahaConfig } from '../services/wahaService';
import { getSavedSubscription, subscribeToPush, isNotificationPermissionGranted, requestNotificationPermission } from '../services/pushNotificationService';
import { WahaConfig, BudgetLineItem, PeriodMode } from '../types';

interface SettingsProps {
  budgetItems?: BudgetLineItem[];
  periodModes?: PeriodMode[];
  onUpdatePeriodModes?: (modes: PeriodMode[]) => void;
}

const Settings: React.FC<SettingsProps> = ({ budgetItems = [], periodModes = [], onUpdatePeriodModes }) => {
  const [config, setConfig] = useState<WahaConfig>(getWahaConfig());
  const [isSaved, setIsSaved] = useState(false);
  const [hasPush, setHasPush] = useState(isNotificationPermissionGranted());

  // New Period Mode Form
  const [newModeStart, setNewModeStart] = useState('');
  const [newModeEnd, setNewModeEnd] = useState('');
  const [newModePlan, setNewModePlan] = useState('');

  const yearlyPlans = budgetItems.filter(item => item.frequency === 'Yearly');

  useEffect(() => {
    if (isSaved) {
      const timer = setTimeout(() => setIsSaved(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isSaved]);

  const handleSaveWaha = () => {
    saveWahaConfig(config);
    setIsSaved(true);
  };

  const handleAddPeriodMode = () => {
    if (!newModeStart || !newModeEnd || !newModePlan) {
      alert("Please fill all fields for the period mode.");
      return;
    }

    const newMode: PeriodMode = {
      id: crypto.randomUUID(),
      startDate: newModeStart,
      endDate: newModeEnd,
      budgetItemName: newModePlan
    };

    const updatedModes = [...periodModes, newMode];
    onUpdatePeriodModes?.(updatedModes);

    // Reset form
    setNewModeStart('');
    setNewModeEnd('');
    setNewModePlan('');
  };

  const handleDeletePeriodMode = (id: string) => {
    const updatedModes = periodModes.filter(m => m.id !== id);
    onUpdatePeriodModes?.(updatedModes);
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
    const user = JSON.parse(localStorage.getItem('escher_user_session') || '{}');

    const configData: any = {
      rt: user.refreshToken,
      sid: user.spreadsheetId,
      eng: config.engine || 'waha',
      ars: config.allowedReceiptSenders,
      ais: config.allowedIncomeSenders
    };

    const encoded = btoa(JSON.stringify(configData));
    return `${baseUrl}?c=${encoded}`;
  };

  const webhookUrl = generateWebhookUrl();

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-8 pb-32">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-black text-gray-900 tracking-tight">System Settings</h1>
        <p className="text-gray-500 font-medium">Configure automated period modes and integrations</p>
      </div>

      {/* Period Modes Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-indigo-100 rounded-xl">
            <Clock className="w-5 h-5 text-indigo-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Period Mode Submissions</h2>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
          <div className="p-6 md:p-8 space-y-6">
            <p className="text-sm text-gray-600">
              Define date ranges during which any submitted transaction will be automatically assigned to a specific annual plan (e.g., Bali Trip).
            </p>

            {/* Existing Modes */}
            <div className="space-y-3">
              {periodModes.map((mode) => (
                <div key={mode.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-indigo-200 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-white rounded-xl shadow-sm">
                      <Calendar className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">{mode.budgetItemName}</h4>
                      <p className="text-xs text-gray-500 font-medium whitespace-nowrap">
                        {mode.startDate} to {mode.endDate}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeletePeriodMode(mode.id)}
                    className="p-2 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
              {periodModes.length === 0 && (
                <div className="text-center py-8 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100">
                  <p className="text-sm text-gray-400 font-medium">No active period modes configured.</p>
                </div>
              )}
            </div>

            <div className="bg-indigo-50/30 rounded-[2rem] p-6 border border-indigo-100 space-y-4">
              <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest px-1">Define New Period</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5 md:col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Target Annual Plan</label>
                  <select
                    value={newModePlan}
                    onChange={(e) => setNewModePlan(e.target.value)}
                    className="w-full rounded-2xl border-white focus:border-indigo-500 focus:ring-indigo-500 bg-white px-4 py-3 text-sm font-bold shadow-sm transition-all"
                  >
                    <option value="">-- Choose Plan --</option>
                    {yearlyPlans.map((plan, idx) => (
                      <option key={idx} value={plan.name}>{plan.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Start Date</label>
                  <input
                    type="date"
                    value={newModeStart}
                    onChange={(e) => setNewModeStart(e.target.value)}
                    className="w-full rounded-2xl border-white focus:border-indigo-500 focus:ring-indigo-500 bg-white px-4 py-3 text-sm font-bold shadow-sm transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">End Date</label>
                  <input
                    type="date"
                    value={newModeEnd}
                    onChange={(e) => setNewModeEnd(e.target.value)}
                    className="w-full rounded-2xl border-white focus:border-indigo-500 focus:ring-indigo-500 bg-white px-4 py-3 text-sm font-bold shadow-sm transition-all"
                  />
                </div>
              </div>
              <button
                onClick={handleAddPeriodMode}
                className="w-full mt-2 bg-indigo-600 text-white rounded-2xl py-4 font-black flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-200"
              >
                <Plus className="w-5 h-5" />
                Add Period Mode
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Integration Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-amber-100 rounded-xl">
            <Workflow className="w-5 h-5 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">WhatsApp Integration</h2>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
          <div className="p-6 md:p-8 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <h4 className="font-bold text-gray-900">WhatsApp Engine Settings</h4>
                <button
                  onClick={handleSaveWaha}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${isSaved
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    }`}
                >
                  <Save className="w-4 h-4" />
                  {isSaved ? 'Saved!' : 'Save Config'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">WhatsApp Engine</label>
                  <select
                    value={config.engine || 'waha'}
                    onChange={(e) => setConfig({ ...config, engine: e.target.value as 'waha' | 'gowa' })}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold shadow-sm transition-all focus:border-amber-500 focus:ring-amber-500"
                  >
                    <option value="waha">WAHA (Default)</option>
                    <option value="gowa">GoWA</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">API URL (Optional if set in .env)</label>
                  <input
                    type="text"
                    value={config.apiUrl || ''}
                    onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                    placeholder={config.engine === 'gowa' ? 'http://localhost:3000' : 'http://waha:3000'}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold shadow-sm transition-all focus:border-amber-500 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  {config.engine === 'gowa' ? 'Device ID (e.g. 1)' : 'Session Name (e.g. default)'}
                </label>
                <input
                  type="text"
                  value={config.session || ''}
                  onChange={(e) => setConfig({ ...config, session: e.target.value })}
                  placeholder="default"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold shadow-sm transition-all focus:border-amber-500 focus:ring-amber-500"
                />
              </div>

              {config.engine === 'gowa' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Username (Optional)</label>
                    <input
                      type="text"
                      value={config.gowaUsername || ''}
                      onChange={(e) => setConfig({ ...config, gowaUsername: e.target.value })}
                      placeholder=""
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold shadow-sm transition-all focus:border-amber-500 focus:ring-amber-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Password (Optional)</label>
                    <input
                      type="password"
                      value={config.gowaPassword || ''}
                      onChange={(e) => setConfig({ ...config, gowaPassword: e.target.value })}
                      placeholder=""
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold shadow-sm transition-all focus:border-amber-500 focus:ring-amber-500"
                    />
                  </div>
                </div>
              )}

              <div className="pt-4 space-y-4 border-t border-gray-50">
                <h5 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest px-1">Sender Filtering (Security)</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Allowed Receipt Senders</label>
                    <input
                      type="text"
                      value={config.allowedReceiptSenders || ''}
                      onChange={(e) => setConfig({ ...config, allowedReceiptSenders: e.target.value })}
                      placeholder="phone@s.whatsapp.net, group@g.us"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold shadow-sm transition-all focus:border-amber-500 focus:ring-amber-500"
                    />
                    <p className="text-[9px] text-gray-400 ml-1">Process photos from these IDs (comma separated)</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Allowed Income Senders</label>
                    <input
                      type="text"
                      value={config.allowedIncomeSenders || ''}
                      onChange={(e) => setConfig({ ...config, allowedIncomeSenders: e.target.value })}
                      placeholder="phone@s.whatsapp.net"
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold shadow-sm transition-all focus:border-amber-500 focus:ring-amber-500"
                    />
                    <p className="text-[9px] text-gray-400 ml-1">Process text income logs from these IDs</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-gray-900">Bridge Webhook URL</h4>
                  <p className="text-xs text-gray-500 font-medium">Use this URL in your {config.engine?.toUpperCase() || 'WAHA'} webhook settings</p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    alert("Bridge URL Copied!");
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-100 font-bold text-sm hover:bg-amber-100 transition-all active:scale-95"
                >
                  <Copy className="w-4 h-4" />
                  Copy URL
                </button>
              </div>
              <div className="bg-amber-50/50 rounded-2xl p-4 border border-amber-50 font-mono text-[10px] text-amber-800 break-all select-all">
                {webhookUrl}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-gray-900">Push Notifications</h4>
                  <p className="text-xs text-gray-500 font-medium">Receive alerts when receipts are processed</p>
                </div>
                <button
                  onClick={handleEnablePush}
                  disabled={hasPush}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-sm transition-all active:scale-95 ${hasPush ? 'bg-emerald-50 text-emerald-700 border-emerald-100 cursor-default' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`}
                >
                  {hasPush ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                  {hasPush ? 'Notifications Enabled' : 'Enable Push'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Settings;
