import React, { useEffect, useState, useRef } from 'react';
import { RefreshCw, Home, BarChart3, ClipboardList, MessageSquare, Plus, LayoutGrid, Wallet, Settings as SettingsIcon, LogOut, ChevronRight } from 'lucide-react';
import { User as UserType } from '../types';
import WahaStatusLight from './WahaStatusLight';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'transactions' | 'chat' | 'budget' | 'input' | 'income' | 'income-input' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'transactions' | 'chat' | 'budget' | 'input' | 'income' | 'income-input' | 'settings') => void;
  onRefresh?: () => Promise<void>;
  user: UserType;
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

  const tabs: Array<'dashboard' | 'transactions' | 'income' | 'budget'> = ['dashboard', 'transactions', 'budget', 'income'];

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

  // Helper to check if the touch target is inside a container that is scrolled
  const isScrolledToTop = (target: EventTarget | null) => {
    let el = target as HTMLElement;

    // Traverse up to find scrollable containers
    while (el && el !== document.body) {
      // Check if this element is scrollable
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight;

      if (isScrollable) {
        if (el.scrollTop > 0) {
          return false; // Found a container that is scrolled down
        }
      }

      el = el.parentElement as HTMLElement;
    }
    return true; // All scrollable containers are at the top
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only enable touch gestures on mobile / small screens
    if (window.innerWidth >= 768) return;

    // Store start position for swipe detection
    setSwipeStartX(e.touches[0].clientX);
    setSwipeStartY(e.touches[0].clientY);
    setIsSwiping(false);

    // Pull to refresh logic
    if (onRefresh && !isRefreshing && isScrolledToTop(e.target)) {
      setStartY(e.touches[0].clientY);
    } else {
      setStartY(0);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (window.innerWidth >= 768) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - swipeStartX;
    const diffY = currentY - swipeStartY;

    // Detect if this is a horizontal swipe (more horizontal than vertical)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 10) {
      setIsSwiping(true);
    }

    // Pull to refresh logic (only if not horizontal swiping)
    if (!isSwiping && startY > 0 && !isRefreshing && onRefresh) {
      const diff = currentY - startY;

      if (diff > 0) {
        const newDistance = Math.min(diff * 0.4, 120);
        setPullDistance(newDistance);
      } else {
        setPullDistance(0);
      }
    }
  };

  const handleTouchEnd = async (e: React.TouchEvent) => {
    if (window.innerWidth >= 768) return;

    const endX = e.changedTouches[0].clientX;
    const diffX = endX - swipeStartX;
    const minSwipeDistance = 50;

    // Handle horizontal swipe for tab navigation
    if (isSwiping && Math.abs(diffX) > minSwipeDistance) {
      const currentIndex = tabs.indexOf(activeTab);

      if (diffX < 0 && currentIndex < tabs.length - 1) {
        setActiveTab(tabs[currentIndex + 1]);
      } else if (diffX > 0 && currentIndex > 0) {
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

    // Trigger refresh if pulled far enough
    if (pullDistance > 60 && startY > 0) {
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

  const NavItem = ({ id, icon: Icon, label }: { id: typeof activeTab, icon: any, label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === id
        ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-sm'
        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 group'
        }`}
    >
      <Icon className={`w-5 h-5 ${activeTab === id ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
      <span>{label}</span>
      {activeTab === id && <ChevronRight className="w-4 h-4 ml-auto text-indigo-400" />}
    </button>
  );

  return (
    <div
      className="h-screen flex flex-col md:flex-row bg-gray-50 text-gray-900 overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* --- DESKTOP SIDEBAR --- */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-gray-200 h-full flex-shrink-0 z-20">
        {/* Sidebar Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
              Escher
            </h1>
            <p className="text-xs text-gray-400 font-medium tracking-wide">Financial Manager</p>
          </div>
          <WahaStatusLight />
        </div>

        {/* User Profile Snippet */}
        <div className="px-6 py-6 pb-2">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border-2 border-white shadow-sm overflow-hidden">
              {user.picture ? (
                <img src={user.picture} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                user.name.charAt(0)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900 truncate">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto py-4 px-4 space-y-1">
          <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Menu</p>
          <NavItem id="dashboard" icon={LayoutGrid} label="Dashboard" />
          <NavItem id="transactions" icon={BarChart3} label="Transactions" />
          <NavItem id="budget" icon={ClipboardList} label="Budget Plans" />
          <NavItem id="income" icon={Wallet} label="Income" />

          <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-6">Actions</p>
          <NavItem id="input" icon={Plus} label="Add Expense" />
          <NavItem id="income-input" icon={Plus} label="Add Income" />
          <NavItem id="chat" icon={MessageSquare} label="AI Assistant" />
          <NavItem id="settings" icon={SettingsIcon} label="Settings" />
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* --- MOBILE HEADER (Hidden on Desktop) --- */}
      <header className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0 z-10">
        <div className="flex items-center justify-between mx-auto">
          <div className="flex-1 flex items-center gap-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`p-2 -ml-2 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <WahaStatusLight />
          </div>

          <h1 className="text-base font-semibold text-gray-900 whitespace-nowrap px-4">
            {activeTab === 'dashboard' && 'Home'}
            {activeTab === 'transactions' && 'Transactions'}
            {activeTab === 'input' && 'Add Expense'}
            {activeTab === 'budget' && 'Budget'}
            {activeTab === 'chat' && 'Assistant'}
            {activeTab === 'income' && 'Income'}
            {activeTab === 'income-input' && 'Add Income'}
            {activeTab === 'settings' && 'Settings'}
          </h1>

          <div className="flex-1 flex justify-end gap-1">
            <button
              onClick={() => setActiveTab('chat')}
              className={`p-2 rounded-lg transition-colors ${activeTab === 'chat' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`p-2 -mr-2 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Pull Refresh Indicator (Mobile Only effectively) */}
        <div
          className="absolute top-4 left-0 w-full flex justify-center pointer-events-none z-40 transition-transform duration-200 ease-out md:hidden"
          style={{
            transform: `translateY(${pullDistance - 50}px)`,
            opacity: pullDistance > 0 ? 1 : 0
          }}
        >
          <div className="bg-white p-2 rounded-full shadow-lg border border-gray-100 text-indigo-600">
            <RefreshCw className={`w-6 h-6 ${isRefreshing ? 'animate-spin' : ''}`} style={{ transform: `rotate(${pullDistance * 2}deg)` }} />
          </div>
        </div>

        {/* Desktop Top Bar (Optional, for context or refresh) */}
        <div className="hidden md:flex items-center justify-between px-8 py-4 bg-white/50 backdrop-blur-sm sticky top-0 z-10 border-b border-gray-200/50">
          <h2 className="text-xl font-bold text-gray-800 capitalize">
            {activeTab === 'input' ? 'Add Expense' : activeTab === 'income-input' ? 'Add Income' : activeTab}
          </h2>
          <div className="flex items-center gap-3">
            {onRefresh && (
              <button
                onClick={async () => {
                  setIsRefreshing(true);
                  await onRefresh();
                  setIsRefreshing(false);
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Syncing...' : 'Sync Data'}
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Area */}
        <main
          ref={contentRef}
          // On mobile: pb-20 for bottom nav. On desktop: pb-0.
          className="flex-1 w-full overflow-hidden min-h-0 pb-20 md:pb-0"
        >
          {children}
        </main>
      </div>

      {/* --- MOBILE BOTTOM NAV (Hidden on Desktop) --- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-2 z-50 safe-area-bottom">
        <div className="flex items-center justify-between max-w-md mx-auto relative">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Home className={`w-6 h-6 ${activeTab === 'dashboard' ? 'fill-current' : ''}`} />
          </button>

          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'transactions' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <BarChart3 className="w-6 h-6" />
          </button>

          {/* Spacer for FAB */}
          <div className="w-16" />

          {/* FAB */}
          <button
            onClick={() => setActiveTab('input')}
            className="absolute left-1/2 -translate-x-1/2 -top-6 w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-colors transform active:scale-95"
          >
            <Plus className="w-7 h-7 text-white" />
          </button>

          <button
            onClick={() => setActiveTab('budget')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'budget' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <ClipboardList className="w-6 h-6" />
          </button>

          <button
            onClick={() => setActiveTab('income')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'income' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Wallet className="w-6 h-6" />
          </button>
        </div>
      </nav>
    </div >
  );
};

export default Layout;