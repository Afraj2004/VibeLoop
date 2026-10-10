import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import LegalPage from './pages/LegalPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import { TERMS, PRIVACY } from './legal/content.js';
import './index.css';

// Minimal path routing; vercel.json rewrites every path to index.html
const ROUTES = {
  '/terms': () => <LegalPage document={TERMS} />,
  '/privacy': () => <LegalPage document={PRIVACY} />,
  '/admin': () => <AdminPage />
};

const path = window.location.pathname.replace(/\/+$/, '') || '/';
const renderPage = ROUTES[path] || (() => <App />);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {renderPage()}
  </React.StrictMode>,
);
