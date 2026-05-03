import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './theme/globalTheme.css';
import './styles/dashboard-theme.css';
import './styles/chase-theme.css';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import { patchFetch } from './services/apiTrafficStore';
import ErrorBoundary from './components/ErrorBoundary';

try {
  const __bxTheme = localStorage.getItem('bx-dash-theme');
  if (__bxTheme === 'dark' || __bxTheme === 'light') {
    document.documentElement.dataset.theme = __bxTheme;
  }
} catch (_) {
  /* ignore */
}

// Redirect localhost → canonical host (api.pingdemo.com) so CORS + cookies work correctly
if (
  typeof window !== 'undefined' &&
  window.location.hostname === 'localhost' &&
  process.env.REACT_APP_CLIENT_URL
) {
  const canonical = new URL(process.env.REACT_APP_CLIENT_URL);
  if (canonical.hostname !== 'localhost') {
    window.location.replace(
      canonical.origin + window.location.pathname + window.location.search + window.location.hash
    );
  }
}

// Patch window.fetch before React renders so every /api/* call is captured
patchFetch();

// Server restart notification is automatically initialized via monitorApiHealth() in App.js
// See: bankingRestartNotificationService.js for implementation details

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
