import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ErrorBoundary, NotFound } from './app/App.js';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
const page = window.location.pathname === '/' ? <App /> : <NotFound />;
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>{page}</ErrorBoundary>
  </StrictMode>,
);
