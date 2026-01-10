import React, { useEffect, useState, useRef } from 'react';
import { Settings as SettingsIcon, Download, RefreshCw, LogOut, MessageSquare, Receipt } from 'lucide-react';
import { User } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'transactions' | 'chat' | 'budget';
  setActiveTab: (tab: 'dashboard' | 'transactions' | 'chat' | 'budget') => void;
  onRefresh?: () => Promise<void>;
  user: User;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab, onRefresh, user, onLogout }) => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  // Pull to refresh state
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Swipe navigation state
  const [swipeStartX, setSwipeStartX] = useState(0);
  const [swipeStartY, setSwipeStartY] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const tabs: Array<'dashboard' | 'transactions' | 'chat' | 'budget'> = ['dashboard', 'transactions', 'chat', 'budget'];

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

  const handleTouchStart = (e: React.TouchEvent) => {
    // Store start position for swipe detection
    setSwipeStartX(e.touches[0].clientX);
    setSwipeStartY(e.touches[0].clientY);
    setIsSwiping(false);

    // Pull to refresh logic
    if (window.scrollY === 0 && !isRefreshing && onRefresh) {
      setStartY(e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - swipeStartX;
    const diffY = currentY - swipeStartY;

    // Detect if this is a horizontal swipe (more horizontal than vertical)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
      setIsSwiping(true);
    }

    // Pull to refresh logic (only if not horizontal swiping)
    if (!isSwiping && startY > 0 && !isRefreshing && window.scrollY === 0 && onRefresh) {
      const diff = currentY - startY;

      if (diff > 0) {
        const newDistance = Math.min(diff * 0.4, 120);
        setPullDistance(newDistance);
      }
    }
  };

  const handleTouchEnd = async (e: React.TouchEvent) => {
    const endX = e.changedTouches[0].clientX;
    const diffX = endX - swipeStartX;
    const minSwipeDistance = 50;

    // Handle horizontal swipe for tab navigation
    if (isSwiping && Math.abs(diffX) > minSwipeDistance) {
      const currentIndex = tabs.indexOf(activeTab);

      if (diffX < 0 && currentIndex < tabs.length - 1) {
        // Swipe left -> next tab
        setActiveTab(tabs[currentIndex + 1]);
      } else if (diffX > 0 && currentIndex > 0) {
        // Swipe right -> previous tab
        setActiveTab(tabs[currentIndex - 1]);
      }
    }

    // Reset swipe state
    setSwipeStartX(0);
    setSwipeStartY(0);
    setIsSwiping(false);

    // Pull to refresh logic
    if (!onRefresh) {
      setPullDistance(0);
      setStartY(0);
      return;
    }
    if (pullDistance > 60) {
      setIsRefreshing(true);
      setPullDistance(60);
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
      setPullDistance(0);
      setStartY(0);
    }
  };

  return (
    <div
      className="h-screen flex flex-col bg-gray-50 text-gray-900 overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <header className="bg-indigo-600 text-white p-4 shadow-md sticky top-0 z-50 flex-shrink-0">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setActiveTab('dashboard')} aria-label="Logo">
              <svg className="h-8 w-auto" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 2L28.1 9V23L16 30L3.9 23V9L16 2Z" stroke="#a5b4fc" strokeWidth="2" />
                <path d="M16 2V16M16 16L28.1 9M16 16L3.9 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="ml-2 font-bold text-xl tracking-tight hidden md:inline">Escher Financial Manager</span>
              <span className="ml-2 font-bold text-xl tracking-tight md:hidden">Escher</span>
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-3">
              <div className="hidden md:block text-right">
                <p className="text-xs font-medium text-indigo-100">{user.name}</p>
              </div>
              <img src={user.picture} alt="Profile" className="w-8 h-8 rounded-full border-2 border-indigo-400" />
              <button onClick={onLogout} title="Logout" className="text-indigo-200 hover:text-white">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>

          <nav className="flex flex-wrap justify-center items-center gap-2 w-full">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-800 shadow-sm ring-1 ring-indigo-400/30' : 'hover:bg-indigo-500'
                }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'transactions' ? 'bg-indigo-800 shadow-sm ring-1 ring-indigo-400/30' : 'hover:bg-indigo-500'
                }`}
            >
              <Receipt className="w-4 h-4" />
              Transactions
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === 'chat' ? 'bg-indigo-800 shadow-sm ring-1 ring-indigo-400/30' : 'hover:bg-indigo-500'
                }`}
            >
              <MessageSquare className="w-4 h-4" />
              Chat
            </button>
            <button
              onClick={() => setActiveTab('budget')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'budget' ? 'bg-indigo-800 shadow-sm ring-1 ring-indigo-400/30' : 'hover:bg-indigo-500'
                }`}
            >
              Plan
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
        className="flex-1 flex flex-col w-full max-w-5xl mx-auto overflow-hidden min-h-0"
      >
        {children}
      </main>

      <footer className="bg-white border-t p-2 text-center text-gray-500 text-xs flex-shrink-0">
        Synced with Google Drive • Escher Financial Manager
      </footer>
    </div>
  );
};

export default Layout;