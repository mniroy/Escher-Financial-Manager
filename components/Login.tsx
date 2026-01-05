import React, { useState } from 'react';
import { User } from '../types';
import { initTokenClient, getUserInfo, findEscherSpreadsheet, createEscherSpreadsheet } from '../services/authService';
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

// Hardcoded Client ID as requested
const GOOGLE_CLIENT_ID = '691804601172-eg2ajh42fmeep7a67g48rf7ospnun11g.apps.googleusercontent.com';

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = () => {
    if (!GOOGLE_CLIENT_ID) {
        setError("Configuration Error: GOOGLE_CLIENT_ID is missing.");
        return;
    }

    setIsLoading(true);
    setStatus('Waiting for Google Sign In...');
    setError(null);

    const client = initTokenClient(GOOGLE_CLIENT_ID, async (tokenResponse: any) => {
      if (tokenResponse && tokenResponse.access_token) {
        try {
          setStatus('Verifying Identity...');
          const userInfo = await getUserInfo(tokenResponse.access_token);
          
          setStatus('Syncing with Google Drive...');
          let sheetId = await findEscherSpreadsheet(tokenResponse.access_token);
          
          if (!sheetId) {
            setStatus('Creating new Financial Database...');
            sheetId = await createEscherSpreadsheet(tokenResponse.access_token);
          } else {
             setStatus('Found existing database...');
          }

          const fullUser: User = {
            name: userInfo.name || 'User',
            email: userInfo.email || '',
            picture: userInfo.picture || '',
            accessToken: tokenResponse.access_token,
            spreadsheetId: sheetId
          };

          onLoginSuccess(fullUser);
        } catch (error: any) {
          console.error(error);
          setError(`Login Failed: ${error.message}`);
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
        if (tokenResponse?.error) {
             setError(`Auth Error: ${tokenResponse.error}`);
        }
      }
    });

    if (client) {
        client.requestAccessToken();
    } else {
        setError("Google Identity Services failed to load. Please refresh the page.");
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 max-w-md w-full text-center relative overflow-hidden">
        
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>

        <div className="flex justify-center mb-8 mt-4">
           <div className="bg-indigo-50 p-4 rounded-2xl">
             <svg className="w-16 h-16 text-indigo-600" viewBox="0 0 240 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g transform="translate(0, 8) scale(2)">
                  <path d="M16 2L28.1 9V23L16 30L3.9 23V9L16 2Z" stroke="#4f46e5" strokeWidth="2"/>
                  <path d="M16 2V16M16 16L28.1 9M16 16L3.9 9" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </g>
             </svg>
           </div>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2 tracking-tight">Escher Financial Manager</h1>
        <p className="text-gray-500 mb-10">Your AI Financial Companion</p>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-6 space-y-4 bg-gray-50 rounded-xl border border-gray-100">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="text-sm font-medium text-gray-600 animate-pulse">{status}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 flex gap-2 items-start text-left">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>{error}</div>
                </div>
            )}

            <button
              onClick={handleGoogleLogin}
              className="group w-full flex items-center justify-center gap-3 bg-white border border-gray-200 hover:border-indigo-300 text-gray-700 font-medium py-3.5 px-4 rounded-xl hover:bg-indigo-50/30 transition-all shadow-sm hover:shadow-md"
            >
              <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5 group-hover:scale-110 transition-transform" alt="Google" />
              <span>Continue with Google</span>
            </button>
            
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Private & Secure • Synced to your Drive</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;