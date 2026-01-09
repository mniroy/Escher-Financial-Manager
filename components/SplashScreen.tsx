import React from 'react';

interface SplashScreenProps {
    onComplete?: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
    React.useEffect(() => {
        // Auto-complete after animation (optional callback)
        if (onComplete) {
            const timer = setTimeout(onComplete, 2000);
            return () => clearTimeout(timer);
        }
    }, [onComplete]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800">
            {/* Animated background circles */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/10 rounded-full animate-pulse" style={{ animationDuration: '3s' }} />
                <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-white/5 rounded-full animate-pulse" style={{ animationDuration: '4s' }} />
                <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-white/5 rounded-full animate-pulse" style={{ animationDuration: '2.5s' }} />
            </div>

            {/* Main content */}
            <div className="relative flex flex-col items-center space-y-8">
                {/* Logo container with animation */}
                <div className="relative animate-bounce" style={{ animationDuration: '2s' }}>
                    {/* Glow effect */}
                    <div className="absolute inset-0 bg-white/30 rounded-3xl blur-xl animate-pulse" />

                    {/* Logo box */}
                    <div className="relative bg-white/20 backdrop-blur-sm p-6 rounded-3xl border border-white/30 shadow-2xl">
                        {/* Escher cube icon */}
                        <svg className="w-20 h-20 text-white drop-shadow-lg" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16 2L28.1 9V23L16 30L3.9 23V9L16 2Z" stroke="currentColor" strokeWidth="2" fill="none" />
                            <path d="M16 2V16M16 16L28.1 9M16 16L3.9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M16 16V30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2" opacity="0.5" />
                        </svg>
                    </div>
                </div>

                {/* App name with fade-in animation */}
                <div className="text-center space-y-2 animate-fade-in">
                    <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-lg">
                        Escher
                    </h1>
                    <p className="text-white/80 text-sm font-medium tracking-wide">
                        Financial Manager
                    </p>
                </div>

                {/* Loading indicator */}
                <div className="flex items-center space-x-2 mt-8">
                    <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.6s' }} />
                        <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.6s' }} />
                        <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.6s' }} />
                    </div>
                </div>

                {/* Tagline */}
                <p className="text-white/60 text-xs font-medium absolute bottom-8 left-1/2 transform -translate-x-1/2">
                    Smart Budget Tracking • Powered by AI
                </p>
            </div>

            {/* Custom animation styles */}
            <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.8s ease-out forwards;
          animation-delay: 0.3s;
          opacity: 0;
        }
      `}</style>
        </div>
    );
};

export default SplashScreen;
