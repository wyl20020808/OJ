import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ErrorBoundary } from './app/App.js';
import { ToastProvider } from './components/Toast.js';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider><App /></ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
