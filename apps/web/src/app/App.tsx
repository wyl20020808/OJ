import {
  Component,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ApiError,
  createApiClient,
  type ApiClient,
  type AuthenticatedUser,
  type Problem,
} from '../services/api.js';
import './app.css';

type Route = {
  name: 'home' | 'login' | 'register' | 'problems' | 'problem' | 'not-found';
  id?: string;
};
function route(path = window.location.pathname): Route {
  if (path === '/') return { name: 'home' };
  if (path === '/login') return { name: 'login' };
  if (path === '/register') return { name: 'register' };
  if (path === '/problems' || path === '/problems/')
    return { name: 'problems' };
  if (path.startsWith('/problems/'))
    return { name: 'problem', id: decodeURIComponent(path.slice(10)) };
  return { name: 'not-found' };
}
function navigate(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
function Link({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
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
function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      {label}
      <input {...props} />
    </label>
  );
}
function FormMessage({ error }: { error: string }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
function AuthForm({
  mode,
  api,
  onUser,
}: {
  mode: 'login' | 'register';
  api: ApiClient;
  onUser: (u: AuthenticatedUser) => void;
}) {
  const [v, setV] = useState({
    identity: '',
    username: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (
      v.password.length < 8 ||
      (mode === 'register' && (!v.username || !v.email))
    ) {
      setError(
        'Please complete all fields. Password must be at least 8 characters.',
      );
      return;
    }
    setLoading(true);
    try {
      const u =
        mode === 'login'
          ? await api.login(v.identity, v.password)
          : await api.register(v.username, v.email, v.password);
      onUser(u);
      navigate('/problems');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Unable to reach the service.',
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="auth-panel">
      <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
      <p className="muted">
        {mode === 'login'
          ? 'Sign in to continue to OJPlatform.'
          : 'Join OJPlatform to practice and improve.'}
      </p>
      <form onSubmit={submit} noValidate>
        {mode === 'login' ? (
          <Field
            label="Email or username"
            value={v.identity}
            onChange={(e) => setV({ ...v, identity: e.target.value })}
            required
          />
        ) : (
          <>
            <Field
              label="Username"
              value={v.username}
              onChange={(e) => setV({ ...v, username: e.target.value })}
              required
            />
            <Field
              label="Email"
              type="email"
              value={v.email}
              onChange={(e) => setV({ ...v, email: e.target.value })}
              required
            />
          </>
        )}
        <Field
          label="Password"
          type="password"
          value={v.password}
          onChange={(e) => setV({ ...v, password: e.target.value })}
          minLength={8}
          required
        />
        <FormMessage error={error} />
        <button disabled={loading}>
          {loading ? 'Working…' : mode === 'login' ? 'Sign in' : 'Register'}
        </button>
      </form>
      <p className="switch">
        {mode === 'login' ? (
          <>
            New here? <Link to="/register">Create an account</Link>
          </>
        ) : (
          <>
            Already registered? <Link to="/login">Sign in</Link>
          </>
        )}
      </p>
    </section>
  );
}
function Home() {
  return (
    <section className="hero">
      <p className="eyebrow">ONLINE JUDGE PLATFORM</p>
      <h1>Practice with purpose.</h1>
      <p>
        Explore curated programming problems, learn from constraints, and build
        reliable solutions.
      </p>
      <Link to="/problems">Browse problems →</Link>
    </section>
  );
}
function State({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
function ProblemList({ api }: { api: ApiClient }) {
  const [data, setData] = useState<{
    items: Problem[];
    page: { total: number; offset: number; limit: number };
  } | null>(null);
  const [error, setError] = useState(false);
  const [offset, setOffset] = useState(0);
  const load = () => {
    setError(false);
    setData(null);
    void api
      .problems(offset)
      .then(setData)
      .catch(() => setError(true));
  };
  useEffect(load, [api, offset]);
  if (error)
    return (
      <State
        title="Problems unavailable"
        text="We could not load problems right now."
        action={<button onClick={load}>Retry</button>}
      />
    );
  if (!data)
    return (
      <State title="Loading problems" text="Fetching the latest problem set…" />
    );
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LIBRARY</p>
          <h1>Problems</h1>
        </div>
        <span className="muted">{data.page.total} total</span>
      </div>
      {data.items.length === 0 ? (
        <State
          title="No problems yet"
          text="Published problems will appear here."
        />
      ) : (
        <div className="problem-list">
          {data.items.map((p) => (
            <Link key={p.id} to={`/problems/${p.slug || p.id}`}>
              <article>
                <div>
                  <h2>{p.title}</h2>
                  <p>
                    {p.statement.slice(0, 140)}
                    {p.statement.length > 140 ? '…' : ''}
                  </p>
                </div>
                <span aria-hidden="true">→</span>
              </article>
            </Link>
          ))}
        </div>
      )}
      <div className="pagination">
        <button
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - data.page.limit))}
        >
          Previous
        </button>
        <button
          disabled={offset + data.page.limit >= data.page.total}
          onClick={() => setOffset(offset + data.page.limit)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="content-section">
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}
function ProblemDetail({ api, id }: { api: ApiClient; id: string }) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    void api
      .problem(id)
      .then(setProblem)
      .catch((e) =>
        setError(
          e instanceof ApiError
            ? e
            : new ApiError(
                {
                  code: 'NETWORK_ERROR',
                  message: 'Problem unavailable.',
                  requestId: 'unknown',
                },
                0,
              ),
        ),
      );
  }, [api, id]);
  if (error)
    return error.code === 'NOT_FOUND' ? (
      <State
        title="Problem not found"
        text="This problem does not exist or is unavailable."
      />
    ) : (
      <State title="Problem unavailable" text={error.message} />
    );
  if (!problem)
    return <State title="Loading problem" text="Fetching problem details…" />;
  return (
    <article className="detail">
      <Link to="/problems">← Back to problems</Link>
      <h1>{problem.title}</h1>
      <div className="limits">
        <span>Time {problem.timeLimitMs} ms</span>
        <span>
          Memory {Math.round(problem.memoryLimitBytes / 1024 / 1024)} MB
        </span>
      </div>
      <Section title="Statement">{problem.statement}</Section>
      <Section title="Input">{problem.inputDescription}</Section>
      <Section title="Output">{problem.outputDescription}</Section>
      <Section title="Constraints">{problem.constraints}</Section>
      {problem.examples.length > 0 && (
        <Section title="Examples">
          {problem.examples.map((e, i) => (
            <pre key={i}>{`Input\n${e.input}\n\nOutput\n${e.output}`}</pre>
          ))}
        </Section>
      )}
      {problem.notes && <Section title="Notes">{problem.notes}</Section>}
    </article>
  );
}
export function App() {
  const api = useMemo(
    () =>
      createApiClient(import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3010'),
    [],
  );
  const [current, setCurrent] = useState<Route>(route());
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [readiness, setReadiness] = useState<
    'loading' | 'ready' | 'degraded' | 'error'
  >('loading');
  useEffect(() => {
    const h = () => setCurrent(route());
    window.addEventListener('popstate', h);
    void api
      .readiness()
      .then((r) => setReadiness(r.status === 'ok' ? 'ready' : 'degraded'))
      .catch(() => setReadiness('error'));
    return () => window.removeEventListener('popstate', h);
  }, [api]);
  const page =
    current.name === 'home' ? (
      <Home />
    ) : current.name === 'login' || current.name === 'register' ? (
      <AuthForm mode={current.name} api={api} onUser={setUser} />
    ) : current.name === 'problems' ? (
      <ProblemList api={api} />
    ) : current.name === 'problem' ? (
      <ProblemDetail api={api} id={current.id ?? ''} />
    ) : (
      <NotFound />
    );
  return (
    <div className="app">
      <header className="nav">
        <Link to="/">
          <strong>OJPlatform</strong>
        </Link>
        <nav>
          <Link to="/problems">Problems</Link>
          {user ? (
            <button
              className="link-button"
              onClick={() => {
                void api.logout().finally(() => {
                  setUser(null);
                  navigate('/');
                });
              }}
            >
              Sign out
            </button>
          ) : (
            <>
              <Link to="/login">Sign in</Link>
              <Link to="/register">Register</Link>
            </>
          )}
        </nav>
      </header>
      <div className="readiness" aria-live="polite">
        {readiness === 'loading' && (
          <span role="status">Checking platform readiness…</span>
        )}
        {readiness === 'ready' && <span role="status">Platform is ready.</span>}
        {readiness === 'degraded' && (
          <span role="alert">Platform is not ready.</span>
        )}
        {readiness === 'error' && (
          <span role="alert">Platform health is unavailable.</span>
        )}
      </div>
      <main className="shell">{page}</main>
      <footer>OJPlatform · Practice, learn, improve.</footer>
    </div>
  );
}
export function NotFound() {
  return (
    <State
      title="Page not found"
      text="The requested page does not exist."
      action={<Link to="/">Return home</Link>}
    />
  );
}
