import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  ApiError,
  type ApiClient,
  type Example,
  type JudgeDataVersionSummary,
  type JudgeDraft,
  type JudgeDraftTestcase,
  type Problem,
  type ProblemJudgeDefaults,
} from '../services/api.js';
import './problem-editor.css';

type Tab = 'statement' | 'data' | 'settings';
type Props = {
  api: ApiClient;
  problemId: string;
  canEdit?: boolean;
  canManage?: boolean;
  canPublish?: boolean;
};

const fallbackDefaults: ProblemJudgeDefaults = {
  timeLimitMs: 1000,
  memoryLimitBytes: 256 * 1024 * 1024,
  outputLimitBytes: 64 * 1024 * 1024,
  checker: 'EXACT_BYTES',
  allowedLanguageProfiles: ['cpp17', 'python3'],
};
const emptyValidation = { state: 'UNKNOWN' as const, errors: [], warnings: [] };

function bytes(n: number) {
  return n >= 1024 * 1024
    ? `${Math.round(n / 1024 / 1024)} MB`
    : `${Math.round(n / 1024)} KB`;
}
function errorText(e: unknown) {
  return e instanceof ApiError ? e.message : '服务暂不可用，请稍后重试。';
}

function fileStem(name: string) {
  return name.replace(/\.(?:in|out)$/i, '').toLowerCase();
}
function pairPreview(files: File[]) {
  const outputs = new Map(
    files
      .filter((file) => /\.out$/i.test(file.name))
      .map((file) => [fileStem(file.name), file.name]),
  );
  return files
    .filter((file) => /\.in$/i.test(file.name))
    .map((file) => ({
      input: file.name,
      output: outputs.get(fileStem(file.name)) ?? null,
    }));
}

function StatementPreview({
  statement,
}: {
  statement: {
    title: string;
    statement: string;
    inputDescription: string;
    outputDescription: string;
    constraints: string;
    notes: string;
    examples: Example[];
  };
}) {
  const sections = [
    ['题目描述', statement.statement],
    ['输入格式', statement.inputDescription],
    ['输出格式', statement.outputDescription],
    ['数据范围', statement.constraints],
    ['说明与提示', statement.notes],
  ] as const;
  return (
    <div className="statement-preview">
      <h2>{statement.title || '未命名题目'}</h2>
      {sections
        .filter(([, value]) => value.trim())
        .map(([title, value]) => (
          <section key={title}>
            <h3>{title}</h3>
            <p>{value}</p>
          </section>
        ))}
      {statement.examples.length > 0 && (
        <section>
          <h3>样例</h3>
          {statement.examples.map((example, index) => (
            <div className="preview-example" key={index}>
              <strong>样例 {index + 1}</strong>
              <pre>{example.input}</pre>
              <pre>{example.output}</pre>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export function ProblemEditor({
  api,
  problemId,
  canEdit = true,
  canManage = true,
  canPublish = true,
}: Props) {
  const [tab, setTab] = useState<Tab>('statement');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [draft, setDraft] = useState<JudgeDraft | null>(null);
  const [versions, setVersions] = useState<JudgeDataVersionSummary[]>([]);
  const [versionError, setVersionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadErrorCode, setLoadErrorCode] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [publishPending, setPublishPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [statement, setStatement] = useState({
    title: '',
    statement: '',
    inputDescription: '',
    outputDescription: '',
    constraints: '',
    notes: '',
    examples: [] as Example[],
  });
  const [statementMode, setStatementMode] = useState<'edit' | 'preview'>(
    'edit',
  );

  const load = () => {
    setLoading(true);
    setLoadError('');
    setLoadErrorCode('');
    setVersionError('');
    const draftRequest = api.judgeDraft(problemId).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    });
    const versionsRequest = api
      .judgeVersions(problemId)
      .catch((error: unknown) => {
        setVersionError(`版本历史暂不可用：${errorText(error)}`);
        return [];
      });
    void Promise.all([api.problem(problemId), draftRequest, versionsRequest])
      .then(([p, d, vs]) => {
        setProblem(p);
        setStatement({
          title: p.title,
          statement: p.statement,
          inputDescription: p.inputDescription,
          outputDescription: p.outputDescription,
          constraints: p.constraints,
          notes: p.notes ?? '',
          examples: p.examples ?? [],
        });
        const normalized =
          d && Array.isArray(d.testcases) && d.defaults
            ? d
            : {
                problemId,
                defaults: fallbackDefaults,
                testcases: [],
                validation: emptyValidation,
                updatedAt: new Date().toISOString(),
              };
        setDraft(normalized);
        setVersions(Array.isArray(vs) ? vs : []);
      })
      .catch((e) => {
        setLoadErrorCode(
          e instanceof ApiError && e.status === 403 ? 'FORBIDDEN' : 'ERROR',
        );
        setLoadError(errorText(e));
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [api, problemId]);
  useEffect(() => {
    if (!dirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [dirty]);

  const updateStatement = (key: keyof typeof statement, value: string) => {
    setDirty(true);
    setStatement((s) => ({ ...s, [key]: value }));
  };
  const updateExample = (index: number, key: keyof Example, value: string) => {
    setDirty(true);
    setStatement((s) => ({
      ...s,
      examples: s.examples.map((example, item) =>
        item === index ? { ...example, [key]: value } : example,
      ),
    }));
  };
  const updateDefaults = (key: keyof ProblemJudgeDefaults, value: unknown) => {
    setDirty(true);
    setDraft((d) => d && { ...d, defaults: { ...d.defaults, [key]: value } });
  };
  const updateCase = (id: string, patch: Partial<JudgeDraftTestcase>) => {
    setDirty(true);
    setDraft(
      (d) =>
        d && {
          ...d,
          testcases: d.testcases.map((t) =>
            t.testcaseId === id
              ? {
                  ...t,
                  ...patch,
                  effectiveTimeLimitMs:
                    patch.timeLimitMsOverride !== undefined
                      ? (patch.timeLimitMsOverride ?? d.defaults.timeLimitMs)
                      : t.effectiveTimeLimitMs,
                  effectiveMemoryLimitBytes:
                    patch.memoryLimitBytesOverride !== undefined
                      ? (patch.memoryLimitBytesOverride ??
                        d.defaults.memoryLimitBytes)
                      : t.effectiveMemoryLimitBytes,
                  effectiveOutputLimitBytes:
                    patch.outputLimitBytesOverride !== undefined
                      ? (patch.outputLimitBytesOverride ??
                        d.defaults.outputLimitBytes)
                      : t.effectiveOutputLimitBytes,
                }
              : t,
          ),
        },
    );
    if (canManage)
      void api
        .updateJudgeTestcase(problemId, id, patch as Record<string, unknown>)
        .catch((e) => setNotice(`保存测试点失败：${errorText(e)}`));
  };

  const saveStatement = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEdit || !problem) return;
    setSaving(true);
    setNotice('');
    try {
      const p = await api.updateProblem(problemId, statement);
      setProblem(p);
      setDirty(false);
      setNotice('题面草稿已保存。');
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const saveConfig = async () => {
    if (!draft || !canManage) return;
    setSaving(true);
    setNotice('');
    try {
      const next = await api.saveJudgeConfig(problemId, draft.defaults);
      setDraft((d) =>
        d
          ? {
              ...d,
              ...next,
              testcases: d.testcases.map((t) => ({
                ...t,
                effectiveTimeLimitMs:
                  t.timeLimitMsOverride ?? next.defaults.timeLimitMs,
                effectiveMemoryLimitBytes:
                  t.memoryLimitBytesOverride ?? next.defaults.memoryLimitBytes,
                effectiveOutputLimitBytes:
                  t.outputLimitBytesOverride ?? next.defaults.outputLimitBytes,
              })),
            }
          : d,
      );
      setDirty(false);
      setNotice('评测设置已保存。');
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const validate = async () => {
    if (!draft || !canManage) return;
    setSaving(true);
    try {
      const validation = await api.validateJudgeData(problemId);
      setDraft((d) => d && { ...d, validation });
      setNotice(
        validation.state === 'VALID'
          ? '校验通过，可以发布。'
          : '校验未通过，请修复错误。',
      );
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const publish = async () => {
    if (!canPublish || !draft) return;
    setPublishPending(false);
    setSaving(true);
    try {
      const version = await api.publishJudgeData(problemId);
      setVersions((v) => [
        version,
        ...v.filter((item) => item.versionId !== version.versionId),
      ]);
      setNotice(
        `数据版本 v${version.versionNumber} 已发布，旧版本保持不可变。`,
      );
      setDraft((d) => d && { ...d, validation: emptyValidation });
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const upload = async (file: File | File[], zip: boolean) => {
    setUploading(true);
    setNotice('');
    try {
      const next = await api.uploadJudgeData(problemId, file, zip);
      setDraft(next);
      setDirty(false);
      setSelectedFiles([]);
      setNotice(zip ? 'ZIP 已解析，草稿已刷新。' : '测试点已导入草稿。');
    } catch (e) {
      setNotice(`上传失败：${errorText(e)}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const remove = async (t: JudgeDraftTestcase) => {
    if (!window.confirm(`确定删除测试点 #${t.ordinal} 吗？`)) return;
    try {
      await api.deleteJudgeTestcase(problemId, t.testcaseId);
      setDraft(
        (d) =>
          d && {
            ...d,
            testcases: d.testcases.filter((x) => x.testcaseId !== t.testcaseId),
          },
      );
      setNotice('测试点已删除。');
    } catch (e) {
      setNotice(errorText(e));
    }
  };

  const overrides = useMemo(
    () =>
      draft?.testcases.filter(
        (t) =>
          t.timeLimitMsOverride !== null ||
          t.memoryLimitBytesOverride !== null ||
          t.outputLimitBytesOverride !== null,
      ).length ?? 0,
    [draft],
  );
  if (loading)
    return (
      <section className="problem-editor-state">
        <h1>正在加载题目编辑器</h1>
        <p>正在获取题面与评测数据…</p>
      </section>
    );
  if (loadError)
    return (
      <section className="problem-editor-state">
        <h1>
          {loadErrorCode === 'FORBIDDEN' ? '无权访问评测数据' : '题目暂不可用'}
        </h1>
        <p role="alert">{loadError}</p>
        <button onClick={load}>重试</button>
      </section>
    );
  if (!problem || !draft)
    return (
      <section className="problem-editor-state">
        <h1>草稿不存在</h1>
        <p>该题目没有可编辑的草稿。</p>
      </section>
    );
  const onUploadChange = (event: ChangeEvent<HTMLInputElement>) =>
    setSelectedFiles(Array.from(event.target.files ?? []));
  const uploadSelection = () => {
    const first = selectedFiles[0];
    if (first)
      void upload(
        selectedFiles.length === 1 ? first : selectedFiles,
        selectedFiles.length === 1 && first.name.toLowerCase().endsWith('.zip'),
      );
  };
  return (
    <section className="problem-editor">
      <header className="problem-editor-header">
        <div>
          <p className="eyebrow">
            出题工作台 / Problem {problem.slug || problem.id}
          </p>
          <h1>编辑题目：{statement.title || '未命名题目'}</h1>
          <p className="editor-meta">
            <span className="draft-badge">DRAFT</span> 最后更新{' '}
            {new Date(draft.updatedAt).toLocaleString('zh-CN')}
          </p>
        </div>
        <button
          className="secondary"
          onClick={load}
          disabled={saving || uploading}
        >
          刷新
        </button>
      </header>
      <nav className="editor-tabs" aria-label="题目编辑分区">
        {(
          [
            ['statement', '题面'],
            ['data', '评测数据'],
            ['settings', '评测设置'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {notice && (
        <p className="editor-notice" role="status">
          {notice}
        </p>
      )}
      {tab === 'statement' && (
        <form className="editor-panel statement-panel" onSubmit={saveStatement}>
          <div className="panel-heading">
            <div>
              <h2>题面内容</h2>
              <p>支持 Markdown 文本；保存前离开页面会提示未保存更改。</p>
            </div>
            <div className="panel-actions">
              <button
                type="button"
                className={statementMode === 'edit' ? '' : 'secondary'}
                onClick={() => setStatementMode('edit')}
              >
                编辑
              </button>
              <button
                type="button"
                className={statementMode === 'preview' ? '' : 'secondary'}
                onClick={() => setStatementMode('preview')}
              >
                预览
              </button>
              <button disabled={!canEdit || saving}>
                {saving ? '保存中…' : '保存题面'}
              </button>
            </div>
          </div>
          {statementMode === 'preview' ? (
            <StatementPreview statement={statement} />
          ) : (
            <>
              <label>
                题目标题
                <input
                  value={statement.title}
                  onChange={(e) => updateStatement('title', e.target.value)}
                  disabled={!canEdit}
                  required
                />
              </label>
              <label>
                题目描述
                <textarea
                  rows={8}
                  value={statement.statement}
                  onChange={(e) => updateStatement('statement', e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <div className="statement-grid">
                <label>
                  输入格式
                  <textarea
                    rows={5}
                    value={statement.inputDescription}
                    onChange={(e) =>
                      updateStatement('inputDescription', e.target.value)
                    }
                    disabled={!canEdit}
                  />
                </label>
                <label>
                  输出格式
                  <textarea
                    rows={5}
                    value={statement.outputDescription}
                    onChange={(e) =>
                      updateStatement('outputDescription', e.target.value)
                    }
                    disabled={!canEdit}
                  />
                </label>
              </div>
              <label>
                数据范围
                <textarea
                  rows={4}
                  value={statement.constraints}
                  onChange={(e) =>
                    updateStatement('constraints', e.target.value)
                  }
                  disabled={!canEdit}
                />
              </label>
              <label>
                说明与提示
                <textarea
                  rows={4}
                  value={statement.notes}
                  onChange={(e) => updateStatement('notes', e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <fieldset>
                <legend>样例</legend>
                {statement.examples.length === 0 ? (
                  <p className="field-help">暂无样例。</p>
                ) : (
                  statement.examples.map((example, index) => (
                    <div className="statement-grid" key={index}>
                      <label>
                        输入样例 {index + 1}
                        <textarea
                          rows={3}
                          value={example.input}
                          onChange={(e) =>
                            updateExample(index, 'input', e.target.value)
                          }
                          disabled={!canEdit}
                        />
                      </label>
                      <label>
                        输出样例 {index + 1}
                        <textarea
                          rows={3}
                          value={example.output}
                          onChange={(e) =>
                            updateExample(index, 'output', e.target.value)
                          }
                          disabled={!canEdit}
                        />
                      </label>
                    </div>
                  ))
                )}
              </fieldset>
            </>
          )}{' '}
        </form>
      )}
      {tab === 'data' && (
        <div className="editor-panel data-panel">
          <div className="panel-heading">
            <div>
              <h2>Judge Data</h2>
              <p>
                <strong>DRAFT</strong> 与最新已发布版本分离。当前{' '}
                {draft.testcases.length} 个测试点，{overrides}{' '}
                个测试点含覆盖值。
                {versions[0]
                  ? ` 最新已发布 v${versions[0].versionNumber}。`
                  : ' 暂无已发布版本。'}
              </p>
            </div>
            <div className="panel-actions">
              <button
                type="button"
                onClick={validate}
                disabled={!canManage || saving}
              >
                校验草稿
              </button>
              <button
                type="button"
                onClick={() => setPublishPending(true)}
                disabled={
                  !canPublish || saving || draft.validation.state !== 'VALID'
                }
              >
                发布新数据版本
              </button>
            </div>
          </div>
          <div className="upload-row">
            <label htmlFor="judge-data-upload">上传测试数据</label>
            <input
              id="judge-data-upload"
              ref={fileRef}
              type="file"
              accept=".zip,.in,.out"
              multiple
              onChange={onUploadChange}
              disabled={!canManage || uploading}
            />
            <button
              type="button"
              onClick={uploadSelection}
              disabled={!canManage || uploading || selectedFiles.length === 0}
            >
              {uploading ? '上传与解析中…' : '上传选中的数据'}
            </button>
            <span>
              {uploading ? '上传与解析中…' : '支持单对文件或 ZIP 批量上传'}
            </span>
          </div>
          {selectedFiles.length > 0 && (
            <div className="upload-preview" aria-live="polite">
              <strong>上传预览：{selectedFiles.length} 个文件</strong>
              {selectedFiles.length === 1 &&
              /\.zip$/i.test(selectedFiles[0]!.name) ? (
                <p>
                  {selectedFiles[0]!.name} 将由 Product Backend
                  解析并返回配对结果。
                </p>
              ) : (
                <ul>
                  {pairPreview(selectedFiles).map((pair) => (
                    <li key={pair.input}>
                      {pair.input} / {pair.output ?? '缺少 .out'}
                    </li>
                  ))}
                  {selectedFiles.filter((file) => /\.in$/i.test(file.name))
                    .length === 0 &&
                    selectedFiles.map((file) => (
                      <li key={file.name}>{file.name}</li>
                    ))}
                </ul>
              )}
            </div>
          )}
          {versionError && (
            <p className="editor-error" role="alert">
              {versionError}
            </p>
          )}
          {draft.validation.state !== 'UNKNOWN' && (
            <div
              className={`validation ${draft.validation.state.toLowerCase()}`}
            >
              <strong>
                {draft.validation.state === 'VALID' ? '校验通过' : '校验未通过'}
              </strong>
              {draft.validation.errors.map((x) => (
                <span key={x}>错误：{x}</span>
              ))}
              {draft.validation.warnings.map((x) => (
                <span key={x}>警告：{x}</span>
              ))}
            </div>
          )}
          <div className="testcase-list">
            {draft.testcases.length === 0 ? (
              <div className="empty-data">
                <h3>暂无测试点</h3>
                <p>上传 .in/.out 文件或 ZIP 后，测试点会出现在这里。</p>
              </div>
            ) : (
              draft.testcases.map((t) => (
                <TestcaseRow
                  key={t.testcaseId}
                  testcase={t}
                  defaults={draft.defaults}
                  canManage={canManage}
                  onChange={updateCase}
                  onRemove={remove}
                />
              ))
            )}
          </div>
          <VersionHistory versions={versions} />
        </div>
      )}
      {tab === 'settings' && (
        <div className="editor-panel settings-panel">
          <div className="panel-heading">
            <div>
              <h2>评测设置</h2>
              <p>修改默认值会影响所有继承默认值的测试点，单点覆盖保持不变。</p>
            </div>
            <button onClick={saveConfig} disabled={!canManage || saving}>
              {saving ? '保存中…' : '保存设置'}
            </button>
          </div>
          <div className="limits-grid">
            <LimitInput
              label="默认时间（毫秒）"
              value={draft.defaults.timeLimitMs}
              onChange={(v) => updateDefaults('timeLimitMs', v)}
              disabled={!canManage}
            />
            <LimitInput
              label="默认内存（MB）"
              value={Math.round(draft.defaults.memoryLimitBytes / 1024 / 1024)}
              onChange={(v) =>
                updateDefaults('memoryLimitBytes', v * 1024 * 1024)
              }
              disabled={!canManage}
            />
            <LimitInput
              label="默认输出（MB）"
              value={Math.round(draft.defaults.outputLimitBytes / 1024 / 1024)}
              onChange={(v) =>
                updateDefaults('outputLimitBytes', v * 1024 * 1024)
              }
              disabled={!canManage}
            />
          </div>
          <label>
            Checker
            <select
              value={draft.defaults.checker}
              onChange={(e) => updateDefaults('checker', e.target.value)}
              disabled={!canManage}
            >
              <option value="EXACT_BYTES">Exact bytes</option>
              <option value="TOKEN_WHITESPACE">Token whitespace</option>
            </select>
          </label>
          <fieldset>
            <legend>允许的语言配置</legend>
            {['cpp17', 'python3', 'java21', 'rust2021'].map((profile) => (
              <label className="checkbox" key={profile}>
                <input
                  type="checkbox"
                  checked={draft.defaults.allowedLanguageProfiles.includes(
                    profile,
                  )}
                  onChange={(e) =>
                    updateDefaults(
                      'allowedLanguageProfiles',
                      e.target.checked
                        ? [...draft.defaults.allowedLanguageProfiles, profile]
                        : draft.defaults.allowedLanguageProfiles.filter(
                            (x) => x !== profile,
                          ),
                    )
                  }
                  disabled={!canManage}
                />
                {profile}
              </label>
            ))}
          </fieldset>
        </div>
      )}
      {publishPending && (
        <div className="modal-backdrop">
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-title"
          >
            <h2 id="publish-title">发布评测数据？</h2>
            <p>
              这会创建不可变的已发布版本。后续修改将形成新的草稿，旧提交不会自动切换数据。
            </p>
            <dl>
              <div>
                <dt>测试点</dt>
                <dd>{draft.testcases.length}</dd>
              </div>
              <div>
                <dt>Checker</dt>
                <dd>{draft.defaults.checker}</dd>
              </div>
              <div>
                <dt>默认限制</dt>
                <dd>
                  {draft.defaults.timeLimitMs} ms /{' '}
                  {bytes(draft.defaults.memoryLimitBytes)} /{' '}
                  {bytes(draft.defaults.outputLimitBytes)}
                </dd>
              </div>
              <div>
                <dt>单点覆盖</dt>
                <dd>{overrides}</dd>
              </div>
            </dl>
            <div className="modal-actions">
              <button
                className="secondary"
                onClick={() => setPublishPending(false)}
              >
                取消
              </button>
              <button onClick={() => void publish()}>确认发布</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function LimitInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
      />
    </label>
  );
}
function TestcaseRow({
  testcase: t,
  defaults,
  canManage,
  onChange,
  onRemove,
}: {
  testcase: JudgeDraftTestcase;
  defaults: ProblemJudgeDefaults;
  canManage: boolean;
  onChange: (id: string, patch: Partial<JudgeDraftTestcase>) => void;
  onRemove: (t: JudgeDraftTestcase) => void;
}) {
  const override = (
    key:
      | 'timeLimitMsOverride'
      | 'memoryLimitBytesOverride'
      | 'outputLimitBytesOverride',
    fallback: number,
    unit: string,
    factor = 1,
  ) => {
    const current = t[key];
    const enabled = current !== null;
    const shown = enabled
      ? Math.round((current ?? fallback) / factor)
      : Math.round(fallback / factor);
    return (
      <div className="case-limit">
        <label>
          <input
            type="checkbox"
            checked={enabled}
            disabled={!canManage}
            onChange={(e) =>
              onChange(t.testcaseId, {
                [key]: e.target.checked ? fallback : null,
              })
            }
          />
          Override {unit}
        </label>
        {enabled ? (
          <input
            type="number"
            min={1}
            value={shown}
            disabled={!canManage}
            onChange={(e) =>
              onChange(t.testcaseId, { [key]: Number(e.target.value) * factor })
            }
          />
        ) : (
          <span className="inherited">
            Default {shown} {unit}
          </span>
        )}
      </div>
    );
  };
  const effectiveTime = t.timeLimitMsOverride ?? defaults.timeLimitMs;
  const effectiveMemory =
    t.memoryLimitBytesOverride ?? defaults.memoryLimitBytes;
  const effectiveOutput =
    t.outputLimitBytesOverride ?? defaults.outputLimitBytes;
  return (
    <article className="testcase-row">
      <div className="case-main">
        <strong>
          #{t.ordinal}
          {t.label ? ` · ${t.label}` : ''}
        </strong>
        <span>
          {t.input.fileName} / {t.expectedOutput.fileName}
        </span>
        <small>
          {bytes(t.input.sizeBytes)} + {bytes(t.expectedOutput.sizeBytes)}
        </small>
      </div>
      <div className="case-limits">
        {override('timeLimitMsOverride', effectiveTime, 'ms')}
        {override(
          'memoryLimitBytesOverride',
          effectiveMemory,
          'MB',
          1024 * 1024,
        )}
        {override(
          'outputLimitBytesOverride',
          effectiveOutput,
          'MB',
          1024 * 1024,
        )}
      </div>
      <button
        type="button"
        className="danger-button"
        onClick={() => onRemove(t)}
        disabled={!canManage}
      >
        删除
      </button>
    </article>
  );
}
function VersionHistory({ versions }: { versions: JudgeDataVersionSummary[] }) {
  return (
    <section className="version-history">
      <h3>版本历史</h3>
      {versions.length === 0 ? (
        <p className="field-help">暂无已发布版本。</p>
      ) : (
        <ul>
          {versions.map((v) => (
            <li key={v.versionId}>
              <strong>v{v.versionNumber}</strong>
              <span>
                {v.testcaseCount} 个测试点 · {v.checker}
              </span>
              <time>{new Date(v.publishedAt).toLocaleString('zh-CN')}</time>
              <small>发布者：{v.publishedBy}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
