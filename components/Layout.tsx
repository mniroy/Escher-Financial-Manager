import React, { useEffect, useState, useRef } from 'react';
import { RefreshCw, Home, BarChart3, ClipboardList, MessageSquare, Plus, LayoutGrid } from 'lucide-react';
import { User as UserType } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'transactions' | 'chat' | 'budget' | 'input';
  setActiveTab: (tab: 'dashboard' | 'transactions' | 'chat' | 'budget' | 'input') => void;
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

  const tabs: Array<'dashboard' | 'transactions' | 'chat' | 'budget'> = ['dashboard', 'transactions', 'budget', 'chat'];

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
    // Store start position for swipe detection
    setSwipeStartX(e.touches[0].clientX);
    setSwipeStartY(e.touches[0].clientY);
    setIsSwiping(false);

    // Pull to refresh logic
    // We only enable pull-to-refresh if we are at the top of the scroll container
    if (onRefresh && !isRefreshing && isScrolledToTop(e.target)) {
      setStartY(e.touches[0].clientY);
    } else {
      setStartY(0); // Reset if not applicable
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
    if (!isSwiping && startY > 0 && !isRefreshing && onRefresh) {
      const diff = currentY - startY;

      if (diff > 0) {
        // Prevent default scrolling when pulling down at the top
        // e.preventDefault(); // Note: This might block scrolling if not careful, usually better to rely on CSS overscroll-behavior

        const newDistance = Math.min(diff * 0.4, 120);
        setPullDistance(newDistance);
      } else {
        // If we scroll up (pushing content down), reset
        setPullDistance(0);
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

    // Trigger refresh if pulled far enough
    if (pullDistance > 60 && startY > 0) {
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
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          {/* Home Icon */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`p-2 -ml-2 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <LayoutGrid className="w-5 h-5" />
          </button>



          {/* Page Title */}
          <h1 className="text-base font-semibold text-gray-900">
            {activeTab === 'dashboard' && 'Home'}
            {activeTab === 'transactions' && 'Transactions'}
            {activeTab === 'input' && 'Add Expense'}
            {activeTab === 'budget' && 'Budget'}
            {activeTab === 'chat' && 'Assistant'}
          </h1>

          {/* Empty spacer for layout balance */}
          <div className="w-9" />
        </div>
      </header >

      <div
        className="fixed top-16 left-0 w-full flex justify-center pointer-events-none z-40 transition-transform duration-200 ease-out"
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
        className="flex-1 flex flex-col w-full max-w-5xl mx-auto overflow-hidden min-h-0 pb-20"
      >
        {children}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-2 z-50">
        <div className="flex items-center justify-between max-w-md mx-auto relative">
          {/* Home / Dashboard */}
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Home className={`w-6 h-6 ${activeTab === 'dashboard' ? 'fill-current' : ''}`} />
          </button>

          {/* Transactions / Chart */}
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'transactions' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <BarChart3 className="w-6 h-6" />
          </button>

          {/* Spacer for FAB */}
          <div className="w-16" />

          {/* FAB - Add Receipt */}
          <button
            onClick={() => setActiveTab('input')}
            className="absolute left-1/2 -translate-x-1/2 -top-6 w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus className="w-7 h-7 text-white" />
          </button>

          {/* Budget / Plan */}
          <button
            onClick={() => setActiveTab('budget')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'budget' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <ClipboardList className="w-6 h-6" />
          </button>

          {/* Chat */}
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex flex-col items-center p-2 rounded-lg transition-colors ${activeTab === 'chat' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <MessageSquare className="w-6 h-6" />
          </button>
        </div>
      </nav>
    </div >
  );
};

export default Layout;