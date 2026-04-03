import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './theme/globalTheme.css';
import './styles/dashboard-theme.css';
import App from './App';
import { patchFetch } from './services/apiTrafficStore';

try {
  const __bxTheme = localStorage.getItem('bx-dash-theme');
  if (__bxTheme === 'dark' || __bxTheme === 'light') {
    document.documentElement.dataset.theme = __bxTheme;
  }
} catch (_) {
  /* ignore */
}

// Patch window.fetch before React renders so every /api/* call is captured
patchFetch();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
