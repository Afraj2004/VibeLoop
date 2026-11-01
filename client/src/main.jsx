import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App.jsx';
import LegalPage from './pages/LegalPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import { TERMS, PRIVACY } from './legal/content.js';
import { captureInviteCode } from './utils/referral.js';
import './index.css';

// An invite link (?ref=CODE) can land on any page
captureInviteCode();

// Minimal path routing; vercel.json rewrites every path to index.html
const ROUTES = {
  '/chat': () => <App />,
  '/terms': () => <LegalPage document={TERMS} />,
  '/privacy': () => <LegalPage document={PRIVACY} />,
  '/admin': () => <AdminPage />
};

const path = window.location.pathname.replace(/\/+$/, '') || '/';
// Home page for / and anything unknown; the camera is only requested inside /chat
const renderPage = ROUTES[path] || (() => <LandingPage />);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {renderPage()}
    {/* Cookie-free page view counts (Vercel Web Analytics) */}
    <Analytics />
  </React.StrictMode>,
);
