import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, ExternalLink } from 'lucide-react';
import { GoogleSheetsConfig } from '../types';

interface SettingsProps {
  onSave: (config: GoogleSheetsConfig | null) => void;
  currentConfig: GoogleSheetsConfig | null;
}

const Settings: React.FC<SettingsProps> = ({ onSave, currentConfig }) => {
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    if (currentConfig) {
      setSpreadsheetId(currentConfig.spreadsheetId);
      setAccessToken(currentConfig.accessToken);
    }
  }, [currentConfig]);

  const handleSave = () => {
    if (!spreadsheetId.trim() && !accessToken.trim()) {
      onSave(null); // Clear settings
      return;
    }
    
    if (!spreadsheetId.trim() || !accessToken.trim()) {
      alert("Please provide both Spreadsheet ID and Access Token to enable sync.");
      return;
    }
    
    onSave({ spreadsheetId, accessToken });
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Settings</h2>
      
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <ExternalLink className="w-4 h-4" />
          Google Sheets Integration
        </h3>
        <p className="text-sm text-blue-800 mb-2">
          Connect your Google Sheet to sync Budget and Expenses. 
        </p>
        <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1 ml-1">
          <li>Create a new Google Sheet.</li>
          <li>Create two tabs named exactly: <strong>Budget</strong> and <strong>Expenses</strong>.</li>
          <li>
            In <strong>Budget</strong>, add headers: <code>Category, Item, Amount, Frequency</code>
          </li>
          <li>
            In <strong>Expenses</strong>, add headers: <code>ID, Date, Category, Description, Amount, ReceiptUrl</code>
          </li>
          <li>
             <a href="https://developers.google.com/oauthplayground/" target="_blank" rel="noreferrer" className="underline font-bold">
               Get a temporary Access Token here
             </a>. Select the <code>https://www.googleapis.com/auth/spreadsheets</code> scope.
          </li>
        </ol>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Spreadsheet ID</label>
          <input
            type="text"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBkJ..."
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3"
          />
          <p className="text-xs text-gray-500 mt-1">Found in your Google Sheet URL.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Google Access Token</label>
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="ya29.a0..."
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3"
          />
          <p className="text-xs text-gray-500 mt-1">
            Required to read/write to your sheet. Note: Tokens expire after 1 hour unless generated via a service account or specific OAuth flow.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="w-full mt-4 bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 flex items-center justify-center gap-2"
        >
          <Save className="w-5 h-5" />
          Save Configuration
        </button>
        
        {currentConfig && (
           <div className="flex items-center gap-2 text-sm text-emerald-600 justify-center mt-2">
             <AlertCircle className="w-4 h-4" />
             Currently connected to Google Sheets
           </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
