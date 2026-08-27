import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ErrorBoundary } from './app/App.js';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
