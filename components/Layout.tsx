import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Download } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'log' | 'budget' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'log' | 'budget' | 'settings') => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    
    // Show the install prompt
    installPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await installPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      <header className="bg-indigo-600 text-white p-4 shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
          <div className="flex items-center cursor-pointer hover:opacity-90 transition-opacity w-full justify-center" onClick={() => setActiveTab('dashboard')} aria-label="Escher Financial Manager Logo">
            <svg className="max-w-full h-auto" width="240" height="48" viewBox="0 0 240 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Geometric Hexagon/Cube Icon - Centered Vertically */}
              <g transform="translate(0, 8)">
                <path d="M16 2L28.1 9V23L16 30L3.9 23V9L16 2Z" stroke="#a5b4fc" strokeWidth="2"/>
                <path d="M16 2V16M16 16L28.1 9M16 16L3.9 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </g>
              
              {/* Typographic Logo */}
              <text x="38" y="24" fill="white" fontFamily="sans-serif" fontWeight="800" fontSize="22" letterSpacing="1">ESCHER</text>
              <text x="38" y="40" fill="#c7d2fe" fontFamily="sans-serif" fontWeight="500" fontSize="12" letterSpacing="1.5">FINANCIAL MANAGER</text>
            </svg>
          </div>
          <nav className="flex flex-wrap justify-center items-center gap-2 w-full">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'dashboard' ? 'bg-indigo-800 shadow-sm ring-1 ring-indigo-400/30' : 'hover:bg-indigo-500'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('log')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'log' ? 'bg-indigo-800 shadow-sm ring-1 ring-indigo-400/30' : 'hover:bg-indigo-500'
              }`}
            >
              Input Expense
            </button>
            <button
              onClick={() => setActiveTab('budget')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'budget' ? 'bg-indigo-800 shadow-sm ring-1 ring-indigo-400/30' : 'hover:bg-indigo-500'
              }`}
            >
              Plan
            </button>
             <button
              onClick={() => setActiveTab('settings')}
              className={`p-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'settings' ? 'bg-indigo-800 shadow-sm ring-1 ring-indigo-400/30' : 'hover:bg-indigo-500'
              }`}
              title="Settings"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
            
            {/* Install App Button - Only visible when install is available */}
            {installPrompt && (
              <button
                onClick={handleInstallClick}
                className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors bg-teal-500 hover:bg-teal-600 flex items-center gap-1 shadow-sm"
              >
                <Download className="w-4 h-4" />
                Install App
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-grow p-4 md:p-6 w-full max-w-5xl mx-auto">
        {children}
      </main>
      <footer className="bg-white border-t p-4 text-center text-gray-500 text-xs">
        Data stored locally unless Google Sheets is configured.
      </footer>
    </div>
  );
};

export default Layout;