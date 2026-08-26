import {
  Component,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { fetchHealth } from '../services/platform.js';
import './app.css';

type Status = 'loading' | 'ready' | 'error';

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Web application error', {
      error,
      componentStack: info.componentStack,
    });
  }

  override render() {
    return this.state.hasError ? (
      <main className="shell">
        <h1>Something went wrong</h1>
        <p role="alert">The application could not render this page.</p>
      </main>
    ) : (
      this.props.children
    );
  }
}

export function App() {
  const [status, setStatus] = useState<Status>('loading');
  useEffect(() => {
    void fetchHealth(import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3010')
      .then(() => setStatus('ready'))
      .catch(() => setStatus('error'));
  }, []);

  return (
    <main className="shell">
      <header>
        <h1>OJPlatform</h1>
      </header>
      <section aria-live="polite" aria-label="Platform status">
        {status === 'loading' && <p role="status">Checking platform health…</p>}
        {status === 'ready' && <p role="status">Platform is ready.</p>}
        {status === 'error' && (
          <p role="alert">Platform health is unavailable.</p>
        )}
      </section>
    </main>
  );
}

export function NotFound() {
  return (
    <main className="shell">
      <h1>Page not found</h1>
      <p>The requested page does not exist.</p>
    </main>
  );
}
