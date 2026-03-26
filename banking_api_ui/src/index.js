import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './theme/globalTheme.css';
import App from './App';
import { patchFetch } from './services/apiTrafficStore';

// Patch window.fetch before React renders so every /api/* call is captured
patchFetch();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
