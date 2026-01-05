import React, { useState } from 'react';
import { User } from '../types';
import { initTokenClient, getUserInfo, findEscherSpreadsheet, createEscherSpreadsheet } from '../services/authService';
import { Loader2, ShieldCheck } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handleGoogleLogin = () => {
    setIsLoading(true);
    setStatus('Waiting for Google Sign In...');

    const client = initTokenClient(async (tokenResponse: any) => {
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
        } catch (error) {
          console.error(error);
          setStatus('Login Failed. Please try again.');
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    });

    if (client) {
        client.requestAccessToken();
    } else {
        alert("Google Identity Services not loaded. Please refresh.");
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
           <svg className="w-24 h-24 text-indigo-600" viewBox="0 0 240 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g transform="translate(0, 8) scale(2)">
                <path d="M16 2L28.1 9V23L16 30L3.9 23V9L16 2Z" stroke="#4f46e5" strokeWidth="2"/>
                <path d="M16 2V16M16 16L28.1 9M16 16L3.9 9" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </g>
           </svg>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Escher</h1>
        <p className="text-gray-500 mb-8">AI-Powered Financial Manager</p>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-4 space-y-4">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-sm font-medium text-gray-600 animate-pulse">{status}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 text-gray-700 font-medium py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
              Sign in with Google
            </button>
            
            <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mt-6">
              <ShieldCheck className="w-4 h-4" />
              <span>Securely synced with your Google Drive</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;