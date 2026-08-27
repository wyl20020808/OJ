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
  type Language,
  type Problem,
  type Submission,
} from '../services/api.js';
import './app.css';

type Route = {
  name:
    | 'home'
    | 'login'
    | 'register'
    | 'problems'
    | 'problem'
    | 'submit'
    | 'submissions'
    | 'submission'
    | 'author'
    | 'author-new'
    | 'author-edit'
    | 'not-found';
  id?: string;
};
function route(path = window.location.pathname): Route {
  if (path === '/') return { name: 'home' };
  if (path === '/login') return { name: 'login' };
  if (path === '/register') return { name: 'register' };
  if (path === '/problems' || path === '/problems/')
    return { name: 'problems' };
  if (path === '/author' || path === '/author/') return { name: 'author' };
  if (path === '/author/problems/new') return { name: 'author-new' };
  if (path.startsWith('/author/problems/') && path.endsWith('/edit'))
    return { name: 'author-edit', id: decodeURIComponent(path.slice(17, -5)) };
  if (path.startsWith('/problems/') && path.endsWith('/submit'))
    return { name: 'submit', id: decodeURIComponent(path.slice(10, -6)) };
  if (path.startsWith('/problems/'))
    return { name: 'problem', id: decodeURIComponent(path.slice(10)) };
  if (path === '/submissions' || path === '/submissions/')
    return { name: 'submissions' };
  if (path.startsWith('/submissions/'))
    return { name: 'submission', id: decodeURIComponent(path.slice(13)) };
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
    displayName: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (
      v.password.length < 8 ||
      (mode === 'register' && (!v.username || !v.email || !v.displayName))
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
          : await api.register(v.username, v.email, v.password, v.displayName);
      if (mode === 'login') {
        onUser(u);
        navigate('/problems');
      } else {
        navigate('/login');
      }
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
            <Field
              label="Display name"
              value={v.displayName}
              onChange={(e) => setV({ ...v, displayName: e.target.value })}
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

type Draft = {
  slug: string;
  title: string;
  statement: string;
  inputDescription: string;
  outputDescription: string;
  constraints: string;
  notes: string;
  examples: { input: string; output: string; note?: string }[];
  timeLimitMs: number;
  memoryLimitBytes: number;
  testdataVersion?: string | null;
  visibility: Problem['visibility'];
  status: Problem['status'];
  updatedAt?: string;
};
const emptyDraft: Draft = {
  slug: '',
  title: '',
  statement: '',
  inputDescription: '',
  outputDescription: '',
  constraints: '',
  notes: '',
  examples: [{ input: '', output: '', note: '' }],
  timeLimitMs: 1000,
  memoryLimitBytes: 256 * 1024 * 1024,
  testdataVersion: null,
  visibility: 'private' as const,
  status: 'draft' as const,
};

function AuthorDashboard({ api }: { api: ApiClient }) {
  const [data, setData] = useState<{
    items: Problem[];
    page: { total: number; offset: number; limit: number };
  } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const load = () => {
    setError(null);
    void api
      .problems(0, 100)
      .then(setData)
      .catch((e) =>
        setError(
          e instanceof ApiError
            ? e
            : new ApiError(
                {
                  code: 'NETWORK_ERROR',
                  message: 'Unable to load drafts.',
                  requestId: 'unknown',
                },
                0,
              ),
        ),
      );
  };
  useEffect(load, [api]);
  if (error)
    return (
      <State
        title={
          error.code === 'FORBIDDEN'
            ? 'Authoring forbidden'
            : 'Authoring unavailable'
        }
        text={error.message}
        action={<button onClick={load}>Retry</button>}
      />
    );
  if (!data)
    return (
      <State
        title="Loading authoring workspace"
        text="Fetching your problem drafts..."
      />
    );
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">AUTHORING</p>
          <h1>My problems</h1>
        </div>
        <Link to="/author/problems/new">
          <button type="button">New problem</button>
        </Link>
      </div>
      {data.items.length === 0 ? (
        <State
          title="No drafts yet"
          text="Create your first problem draft to begin authoring."
          action={<Link to="/author/problems/new">Create a draft</Link>}
        />
      ) : (
        <div className="problem-list">
          {data.items.map((p) => (
            <article key={p.id}>
              <div>
                <h2>{p.title}</h2>
                <p>
                  <span className={`status status-${p.status}`}>
                    {p.status}
                  </span>{' '}
                  · {p.visibility}
                </p>
              </div>
              <Link to={`/author/problems/${p.slug || p.id}/edit`}>Edit</Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AuthorForm({ api, id }: { api: ApiClient; id?: string }) {
  const [form, setForm] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    if (!id) return;
    void api
      .problem(id)
      .then((p) =>
        setForm({
          ...p,
          notes: p.notes ?? '',
          examples: p.examples.length ? p.examples : emptyDraft.examples,
        }),
      )
      .catch((e) => setError(e instanceof ApiError ? e : null))
      .finally(() => setLoading(false));
  }, [api, id]);
  const update = (key: keyof typeof emptyDraft, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError(null);
    if (
      !form.slug ||
      !form.title ||
      !form.statement ||
      !form.inputDescription ||
      !form.outputDescription ||
      !form.constraints
    ) {
      setMessage('Complete all required fields before saving.');
      return;
    }
    setSaving(true);
    try {
      const editable = {
        slug: form.slug,
        title: form.title,
        statement: form.statement,
        inputDescription: form.inputDescription,
        outputDescription: form.outputDescription,
        examples: form.examples,
        constraints: form.constraints,
        notes: form.notes,
        timeLimitMs: form.timeLimitMs,
        memoryLimitBytes: form.memoryLimitBytes,
        testdataVersion: form.testdataVersion ?? null,
      };
      const result = id
        ? await api.updateProblem(id, editable)
        : await api.createProblem({
            ...editable,
            visibility: form.visibility,
            status: form.status,
          });
      setMessage('Draft saved.');
      if (!id) navigate(`/author/problems/${result.slug || result.id}/edit`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e
          : new ApiError(
              {
                code: 'NETWORK_ERROR',
                message: 'Unable to save draft.',
                requestId: 'unknown',
              },
              0,
            ),
      );
    } finally {
      setSaving(false);
    }
  };
  const transition = async (status: Problem['status']) => {
    if (!id) return;
    setSaving(true);
    try {
      await api.transitionProblem(id, {
        status,
        ...(status === 'published' && form.visibility === 'public'
          ? { visibility: 'public' as const }
          : {}),
      });
      setForm((f) => ({ ...f, status }));
      setMessage(`Problem ${status}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e : null);
    } finally {
      setSaving(false);
    }
  };
  if (loading)
    return (
      <State title="Loading draft" text="Fetching the current revision..." />
    );
  if (error && !form.title)
    return (
      <State
        title={
          error.code === 'FORBIDDEN'
            ? 'Authoring forbidden'
            : error.code === 'NOT_FOUND'
              ? 'Draft not found'
              : 'Draft unavailable'
        }
        text={error.message}
      />
    );
  return (
    <section className="editor">
      <Link to="/author">← Back to my problems</Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{id ? 'EDIT DRAFT' : 'NEW DRAFT'}</p>
          <h1>{id ? 'Edit problem' : 'Create problem'}</h1>
        </div>
        {id && (
          <span className={`status status-${form.status}`}>{form.status}</span>
        )}
      </div>
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field
            label="Title"
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            required
          />
          <Field
            label="Slug"
            value={form.slug}
            onChange={(e) => update('slug', e.target.value)}
            required
          />
        </div>
        <label>
          Statement
          <textarea
            value={form.statement}
            onChange={(e) => update('statement', e.target.value)}
            rows={6}
            required
          />
        </label>
        <div className="form-grid">
          <label>
            Input description
            <textarea
              value={form.inputDescription}
              onChange={(e) => update('inputDescription', e.target.value)}
              rows={4}
              required
            />
          </label>
          <label>
            Output description
            <textarea
              value={form.outputDescription}
              onChange={(e) => update('outputDescription', e.target.value)}
              rows={4}
              required
            />
          </label>
        </div>
        <label>
          Constraints
          <textarea
            value={form.constraints}
            onChange={(e) => update('constraints', e.target.value)}
            rows={4}
            required
          />
        </label>
        <label>
          Notes
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
          />
        </label>
        <div className="form-grid">
          <Field
            label="Time limit (ms)"
            type="number"
            min={1}
            value={form.timeLimitMs}
            onChange={(e) => update('timeLimitMs', Number(e.target.value))}
            required
          />
          <Field
            label="Memory limit (bytes)"
            type="number"
            min={1}
            value={form.memoryLimitBytes}
            onChange={(e) => update('memoryLimitBytes', Number(e.target.value))}
            required
          />
        </div>
        <fieldset>
          <legend>Example</legend>
          <div className="form-grid">
            <label>
              Input
              <textarea
                value={form.examples[0]?.input ?? ''}
                onChange={(e) =>
                  update('examples', [
                    {
                      ...form.examples[0],
                      input: e.target.value,
                      output: form.examples[0]?.output ?? '',
                    },
                  ])
                }
                rows={3}
              />
            </label>
            <label>
              Output
              <textarea
                value={form.examples[0]?.output ?? ''}
                onChange={(e) =>
                  update('examples', [
                    {
                      ...form.examples[0],
                      output: e.target.value,
                      input: form.examples[0]?.input ?? '',
                    },
                  ])
                }
                rows={3}
              />
            </label>
          </div>
        </fieldset>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={form.visibility === 'public'}
            onChange={(e) =>
              update('visibility', e.target.checked ? 'public' : 'private')
            }
          />{' '}
          Public visibility
        </label>
        {(message || error) && (
          <FormMessage error={message || error?.message || ''} />
        )}
        <div className="actions">
          <button disabled={saving}>
            {saving ? 'Saving...' : 'Save draft'}
          </button>
          {id && form.status === 'draft' && (
            <button
              type="button"
              onClick={() => void transition('published')}
              disabled={saving}
            >
              Publish
            </button>
          )}
          {id && form.status === 'published' && (
            <button
              type="button"
              onClick={() => void transition('archived')}
              disabled={saving}
            >
              Archive
            </button>
          )}
        </div>
      </form>
      {id && (
        <aside className="history">
          <h2>Revision history</h2>
          <p className="muted">
            Current revision is tracked by the server. Published revisions
            remain immutable.
          </p>
          <p>
            Last updated{' '}
            {new Date(form.updatedAt ?? Date.now()).toLocaleString()}
          </p>
        </aside>
      )}
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
      <div className="submit-cta">
        <Link to={`/problems/${encodeURIComponent(id)}/submit`}>
          <button type="button">Submit solution</button>
        </Link>
      </div>
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

function SubmissionForm({
  api,
  problemId,
  user,
}: {
  api: ApiClient;
  problemId: string;
  user: AuthenticatedUser | null;
}) {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [languageId, setLanguageId] = useState('');
  const [source, setSource] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [state, setState] = useState<
    'loading' | 'ready' | 'saving' | 'success' | 'error'
  >('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user) {
      setState('ready');
      return;
    }
    void Promise.all([api.languages(), api.problem(problemId)])
      .then(([ls, p]) => {
        setLanguages(ls);
        setLanguageId(ls[0]?.id ?? '');
        setProblem(p);
        setState('ready');
      })
      .catch((e) => {
        setError(
          e instanceof ApiError ? e.message : 'Unable to load submission form.',
        );
        setState('error');
      });
  }, [api, problemId, user]);
  if (!user)
    return (
      <State
        title="Sign in required"
        text="Sign in before submitting a solution."
        action={<Link to="/login">Sign in</Link>}
      />
    );
  if (state === 'loading')
    return (
      <State
        title="Loading submission form"
        text="Preparing the language catalog..."
      />
    );
  if (state === 'error')
    return <State title="Submission unavailable" text={error} />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!languageId) {
      setError('Choose a language.');
      return;
    }
    if (!source.trim()) {
      setError('Source code is required.');
      return;
    }
    const selected = languages.find((l) => l.id === languageId);
    if (
      selected &&
      new TextEncoder().encode(source).byteLength > selected.maxSourceBytes
    ) {
      setError(`Source exceeds the ${selected.maxSourceBytes}-byte limit.`);
      return;
    }
    setState('saving');
    try {
      const result = await api.createSubmission({
        problemId,
        problemRevisionId:
          (problem as (Problem & { revisionId?: string }) | null)?.revisionId ??
          problemId,
        testdataVersionRef: problem?.testdataVersion ?? null,
        languageId,
        source,
      });
      setState('success');
      setError(
        `Submission ${result.id} was recorded for intake and is ${result.status}.`,
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to submit source.');
      setState('ready');
    }
  };
  if (state === 'success')
    return (
      <State
        title="Submission received"
        text={error}
        action={<Link to="/submissions">View submission history</Link>}
      />
    );
  return (
    <section className="editor">
      <Link to={`/problems/${encodeURIComponent(problemId)}`}>
        ← Back to problem
      </Link>
      <p className="eyebrow">SUBMISSION INTAKE</p>
      <h1>Submit solution</h1>
      <form onSubmit={submit} noValidate>
        <label>
          Language
          <select
            value={languageId}
            onChange={(e) => setLanguageId(e.target.value)}
            required
          >
            <option value="">Choose a language</option>
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.extension})
              </option>
            ))}
          </select>
        </label>
        <label>
          Source code
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={18}
            spellCheck={false}
            required
          />
        </label>
        <p className="muted">
          Source is stored as text for intake only. No execution result is
          available at this stage.
        </p>
        {error && <FormMessage error={error} />}
        <button disabled={state === 'saving'}>
          {state === 'saving' ? 'Submitting...' : 'Submit source'}
        </button>
      </form>
    </section>
  );
}

function SubmissionHistory({
  api,
  user,
}: {
  api: ApiClient;
  user: AuthenticatedUser | null;
}) {
  const [items, setItems] = useState<Submission[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const load = () => {
    setItems(null);
    setError('');
    void api
      .submissions(cursor)
      .then((d) => {
        setItems(d.items);
        setNext(d.nextCursor);
      })
      .catch((e) =>
        setError(
          e instanceof ApiError ? e.message : 'Unable to load submissions.',
        ),
      );
  };
  useEffect(load, [api, cursor]);
  if (!user)
    return (
      <State
        title="Sign in required"
        text="Sign in to view your submission history."
        action={<Link to="/login">Sign in</Link>}
      />
    );
  if (error)
    return (
      <State
        title="Submission history unavailable"
        text={error}
        action={<button onClick={load}>Retry</button>}
      />
    );
  if (!items)
    return (
      <State
        title="Loading submissions"
        text="Fetching your intake history..."
      />
    );
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SUBMISSIONS</p>
          <h1>My submissions</h1>
        </div>
      </div>
      {items.length === 0 ? (
        <State
          title="No submissions yet"
          text="Your submitted sources will appear here."
        />
      ) : (
        <div className="problem-list">
          {items.map((s) => (
            <article key={s.id}>
              <div>
                <h2>
                  <Link to={`/submissions/${s.id}`}>{s.id}</Link>
                </h2>
                <p>
                  {s.languageId} · {s.status} ·{' '}
                  {new Date(s.createdAt).toLocaleString()}
                </p>
              </div>
              <Link to={`/submissions/${s.id}`}>Details</Link>
            </article>
          ))}
        </div>
      )}
      <div className="pagination">
        <button disabled={!cursor} onClick={() => setCursor(undefined)}>
          First page
        </button>
        <button disabled={!next} onClick={() => setCursor(next ?? undefined)}>
          Next page
        </button>
      </div>
    </section>
  );
}

function SubmissionDetail({
  api,
  id,
  user,
}: {
  api: ApiClient;
  id: string;
  user: AuthenticatedUser | null;
}) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    if (!user) return;
    void api
      .submission(id)
      .then(setSubmission)
      .catch((e) => setError(e instanceof ApiError ? e : null));
  }, [api, id, user]);
  if (!user)
    return (
      <State
        title="Sign in required"
        text="Sign in to view this submission."
        action={<Link to="/login">Sign in</Link>}
      />
    );
  if (error)
    return (
      <State
        title={
          error.code === 'NOT_FOUND'
            ? 'Submission not found'
            : error.code === 'FORBIDDEN'
              ? 'Submission forbidden'
              : 'Submission unavailable'
        }
        text={error.message}
      />
    );
  if (!submission)
    return (
      <State
        title="Loading submission"
        text="Fetching submission metadata..."
      />
    );
  return (
    <article className="detail">
      <Link to="/submissions">← Back to submissions</Link>
      <p className="eyebrow">SUBMISSION</p>
      <h1>{submission.id}</h1>
      <div className="limits">
        <span>Status {submission.status}</span>
        <span>Language {submission.languageId}</span>
        <span>Intake {new Date(submission.createdAt).toLocaleString()}</span>
      </div>
      <Section title="Problem">
        {submission.problemId} · revision {submission.problemRevisionId}
      </Section>
      <Section title="Source">
        <pre className="source">{submission.source}</pre>
      </Section>
      <p className="muted">
        This page reports intake metadata only. Execution and verdicts are not
        available.
      </p>
    </article>
  );
}
export function App() {
  const api = useMemo(
    () => createApiClient(import.meta.env.VITE_API_URL ?? ''),
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
      .me()
      .then(setUser)
      .catch(() => setUser(null));
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
    ) : current.name === 'submit' ? (
      <SubmissionForm api={api} problemId={current.id ?? ''} user={user} />
    ) : current.name === 'submissions' ? (
      <SubmissionHistory api={api} user={user} />
    ) : current.name === 'submission' ? (
      user && current.id ? (
        <SubmissionDetail api={api} id={current.id} user={user} />
      ) : (
        <State
          title="Sign in required"
          text="Sign in to view this submission."
          action={<Link to="/login">Sign in</Link>}
        />
      )
    ) : current.name === 'author' ? (
      user ? (
        <AuthorDashboard api={api} />
      ) : (
        <State
          title="Sign in required"
          text="Sign in to manage your problem drafts."
          action={<Link to="/login">Sign in</Link>}
        />
      )
    ) : current.name === 'author-new' ? (
      user ? (
        <AuthorForm api={api} />
      ) : (
        <State
          title="Sign in required"
          text="Sign in to create a problem draft."
          action={<Link to="/login">Sign in</Link>}
        />
      )
    ) : current.name === 'author-edit' ? (
      user && current.id ? (
        <AuthorForm api={api} id={current.id} />
      ) : (
        <State
          title="Sign in required"
          text="Sign in to edit problem drafts."
          action={<Link to="/login">Sign in</Link>}
        />
      )
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
            <>
              <Link to="/author">Authoring</Link>
              <Link to="/submissions">Submissions</Link>
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
            </>
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
