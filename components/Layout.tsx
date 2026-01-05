import React, { useEffect, useState, useRef } from 'react';
import { Settings as SettingsIcon, Download, RefreshCw } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'log' | 'budget' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'log' | 'budget' | 'settings') => void;
  onRefresh?: () => Promise<void>;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, onRefresh }) => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  
  // Pull to refresh state
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  // Touch handlers for pull-to-refresh
  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY === 0 && !isRefreshing && onRefresh) {
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY > 0 && !isRefreshing && window.scrollY === 0 && onRefresh) {
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      
      if (diff > 0) {
        // Add resistance
        const newDistance = Math.min(diff * 0.4, 120); // Cap at 120px
        setPullDistance(newDistance);
      }
    }
  };

  const handleTouchEnd = async () => {
    if (!onRefresh) return;
    
    if (pullDistance > 60) {
      // Trigger refresh
      setIsRefreshing(true);
      setPullDistance(60); // Snap to loading position
      try {
        await onRefresh();
      } finally {
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
          setStartY(0);
        }, 500);
      }
    } else {
      // Cancel
      setPullDistance(0);
      setStartY(0);
    }
  };

  return (
    <div 
      className="min-h-screen flex flex-col bg-gray-50 text-gray-900"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <header className="bg-indigo-600 text-white p-4 shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
          <div className="flex items-center cursor-pointer hover:opacity-90 transition-opacity w-full justify-center" onClick={() => setActiveTab('dashboard')} aria-label="Escher Financial Manager Logo">
            <svg className="max-w-full h-auto" width="240" height="48" viewBox="0 0 240 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g transform="translate(0, 8)">
                <path d="M16 2L28.1 9V23L16 30L3.9 23V9L16 2Z" stroke="#a5b4fc" strokeWidth="2"/>
                <path d="M16 2V16M16 16L28.1 9M16 16L3.9 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </g>
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
      
      {/* Refresh Indicator */}
      <div 
        className="fixed top-24 left-0 w-full flex justify-center pointer-events-none z-40 transition-transform duration-200 ease-out"
        style={{ 
          transform: `translateY(${pullDistance - 50}px)`, 
          opacity: pullDistance > 0 ? 1 : 0 
        }}
      >
        <div className="bg-white p-2 rounded-full shadow-lg border border-gray-100 text-indigo-600">
          <RefreshCw className={`w-6 h-6 ${isRefreshing ? 'animate-spin' : ''}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
        </div>
      </div>

      <main 
        ref={contentRef}
        className="flex-grow p-4 md:p-6 w-full max-w-5xl mx-auto transition-transform duration-200 ease-out"
        style={{ transform: `translateY(${pullDistance}px)` }}
      >
        {children}
      </main>
      
      <footer className="bg-white border-t p-4 text-center text-gray-500 text-xs">
        Data stored locally unless Google Sheets is configured.
      </footer>
    </div>
  );
};

export default Layout;