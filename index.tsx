import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// --- Environment Variable Setup ---
// Vercel and Vite do not expose 'process.env' by default in the browser.
// We map standard frontend environment variables (VITE_, REACT_APP_) to process.env.API_KEY
// so the rest of the application works seamlessly.

if (typeof window !== 'undefined' && typeof process === 'undefined') {
  // Polyfill process for browser environment
  (window as any).process = { env: {} };
}

// Try to retrieve the key from various build tool standards
// Note: Users must name their key 'VITE_API_KEY' in Vercel for it to be exposed to the client.
const env = (import.meta as any).env || {};
const key = env.VITE_API_KEY || env.REACT_APP_API_KEY || env.NEXT_PUBLIC_API_KEY || env.API_KEY;

if (key) {
  process.env.API_KEY = key;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);