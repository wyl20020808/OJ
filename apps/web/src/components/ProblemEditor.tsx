import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type RefObject,
} from 'react';
import {
  ApiError,
  type ApiClient,
  type JudgeDataVersionSummary,
  type JudgeDraft,
  type JudgeDraftTestcase,
  type Problem,
  type ProblemDifficulty,
  type ProblemJudgeDefaults,
} from '../services/api.js';
import './problem-editor.css';
import { ProblemStatementRenderer } from './ProblemStatementRenderer.js';
import { TagSelector } from './TagSelector.js';
import { useToast } from './Toast.js';

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
  checker: 'TOKEN_WHITESPACE',
  allowedLanguageProfiles: ['cpp20-gcc-13-v1'],
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
  return name.replace(/\.(?:in|out|ans|txt)$/i, '').toLowerCase();
}
function pairPreview(files: File[]) {
  const outputs = new Map(
    files
      .filter((file) => /\.(?:out|ans|txt)$/i.test(file.name))
      .map((file) => [fileStem(file.name), file.name]),
  );
  return files
    .filter((file) => /\.in$/i.test(file.name))
    .map((file) => ({
      input: file.name,
      output: outputs.get(fileStem(file.name)) ?? null,
    }));
}

export type MarkdownFieldKey =
  | 'background'
  | 'statement'
  | 'inputDescription'
  | 'outputDescription'
  | 'constraints'
  | 'notes';

type ToolbarAction =
  | 'bold'
  | 'italic'
  | 'heading'
  | 'quote'
  | 'inline-code'
  | 'code-block'
  | 'link'
  | 'image'
  | 'bullet-list'
  | 'ordered-list'
  | 'table'
  | 'inline-math'
  | 'block-math';

const toolbarActions: Array<{
  action: ToolbarAction;
  label: string;
  title: string;
  group: 'text' | 'insert' | 'code' | 'block' | 'math';
}> = [
  { action: 'heading', label: 'H', title: '标题', group: 'text' },
  { action: 'bold', label: 'B', title: '粗体 Ctrl+B', group: 'text' },
  { action: 'italic', label: 'I', title: '斜体 Ctrl+I', group: 'text' },
  { action: 'link', label: '🔗', title: '插入链接', group: 'insert' },
  { action: 'image', label: '▧', title: '插入图片', group: 'insert' },
  { action: 'inline-code', label: '`', title: '行内代码', group: 'code' },
  { action: 'code-block', label: '</>', title: '代码块', group: 'code' },
  { action: 'quote', label: '”', title: '引用', group: 'block' },
  { action: 'bullet-list', label: '•', title: '无序列表', group: 'block' },
  { action: 'ordered-list', label: '1.', title: '有序列表', group: 'block' },
  { action: 'table', label: '▦', title: '表格', group: 'block' },
  { action: 'inline-math', label: '∑', title: '行内公式', group: 'math' },
  { action: 'block-math', label: '$$', title: '块级公式', group: 'math' },
];

function markdownReplacement(action: ToolbarAction, selected: string) {
  const text = selected || 'text';
  switch (action) {
    case 'bold':
      return `**${text}**`;
    case 'italic':
      return `*${text}*`;
    case 'heading':
      return `## ${text}`;
    case 'quote':
      return `> ${text}`;
    case 'inline-code':
      return `\`${selected || 'code'}\``;
    case 'code-block':
      return `\`\`\`\n${selected || 'code'}\n\`\`\``;
    case 'link':
      return `[${selected || 'text'}](url)`;
    case 'image':
      return `![${selected || 'alt text'}](url)`;
    case 'bullet-list':
      return (selected || 'item')
        .split('\n')
        .map((line) => `- ${line}`)
        .join('\n');
    case 'ordered-list':
      return (selected || 'item')
        .split('\n')
        .map((line, index) => `${index + 1}. ${line}`)
        .join('\n');
    case 'table':
      return '| Column | Value |\n| --- | --- |\n| text | text |';
    case 'inline-math':
      return `$${selected || 'x'}$`;
    case 'block-math':
      return `$$\n${selected || 'x'}\n$$`;
  }
}

export function MarkdownToolbar({
  textareaRef,
  value,
  onChange,
  disabled,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const apply = (action: ToolbarAction) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const replacement = markdownReplacement(action, selected);
    const next = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    onChange(next);
    const restoreSelection = () => {
      textarea.focus();
      const selectionStart = start;
      textarea.setSelectionRange(
        selectionStart,
        selectionStart + replacement.length,
      );
    };
    if (typeof requestAnimationFrame === 'function')
      requestAnimationFrame(restoreSelection);
    else setTimeout(restoreSelection, 0);
  };
  return (
    <div className="markdown-toolbar" aria-label="Markdown formatting toolbar">
      {(['text', 'insert', 'code', 'block', 'math'] as const).map((group) => (
        <div
          className="markdown-tool-group"
          role="group"
          aria-label={group}
          key={group}
        >
          {toolbarActions
            .filter((item) => item.group === group)
            .map(({ action, label, title }) => (
              <button
                key={action}
                type="button"
                className="markdown-tool"
                data-action={action}
                aria-label={
                  {
                    bold: 'Bold',
                    italic: 'Italic',
                    heading: 'Heading',
                    quote: 'Quote',
                    'inline-code': 'Inline Code',
                    'code-block': 'Code Block',
                    link: 'Link',
                    image: 'Image URL',
                    'bullet-list': 'Bullet List',
                    'ordered-list': 'Ordered List',
                    table: 'Table',
                    'inline-math': 'Inline Math',
                    'block-math': 'Block Math',
                  }[action]
                }
                title={title}
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => apply(action)}
              >
                {label}
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}

export function MarkdownFieldSection({
  fieldKey,
  label,
  value,
  rows,
  disabled,
  onChange,
  previewLabel,
}: {
  fieldKey: MarkdownFieldKey;
  label: string;
  value: string;
  rows: number;
  disabled: boolean;
  onChange: (value: string) => void;
  previewLabel?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const content = {
    title: '',
    background: fieldKey === 'background' ? value : '',
    statement: fieldKey === 'statement' ? value : '',
    inputDescription: fieldKey === 'inputDescription' ? value : '',
    outputDescription: fieldKey === 'outputDescription' ? value : '',
    constraints: fieldKey === 'constraints' ? value : '',
    notes: fieldKey === 'notes' ? value : '',
  };
  return (
    <section className="markdown-field-section" data-field={fieldKey}>
      <h3>{label}</h3>
      <div className="markdown-field-split">
        <div className="markdown-editor-pane">
          <MarkdownToolbar
            textareaRef={textareaRef}
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
          <textarea
            ref={textareaRef}
            rows={rows}
            value={value}
            aria-label={label}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            placeholder={`开始编写${label}……`}
            onKeyDown={(event) => {
              if (!(event.ctrlKey || event.metaKey)) return;
              const action =
                event.key.toLowerCase() === 'b'
                  ? 'bold'
                  : event.key.toLowerCase() === 'i'
                    ? 'italic'
                    : null;
              if (!action) return;
              event.preventDefault();
              const button =
                event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
                  `[data-action="${action}"]`,
                );
              button?.click();
            }}
          />
        </div>
        <aside
          className="markdown-preview-pane"
          aria-label={previewLabel ?? `${label}实时预览`}
        >
          <ProblemStatementRenderer content={content} showTitle={false} />
        </aside>
      </div>
    </section>
  );
}

export function ProblemEditor({
  api,
  problemId,
  canEdit = true,
  canManage = true,
  canPublish = true,
}: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('statement');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [draft, setDraft] = useState<JudgeDraft | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
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
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [statement, setStatement] = useState({
    title: '',
    background: '',
    statement: '',
    inputDescription: '',
    outputDescription: '',
    constraints: '',
    notes: '',
    samples: [] as Array<{ ordinal: number; input: string; output: string }>,
    difficulty: null as ProblemDifficulty | null,
    tagIds: [] as number[],
    visibility: 'private' as Problem['visibility'],
  });

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
          background: p.background ?? '',
          statement: p.statement,
          inputDescription: p.inputDescription,
          outputDescription: p.outputDescription,
          constraints: p.constraints,
          notes: p.notes ?? '',
          samples:
            p.samples ??
            (p.examples ?? []).map((sample, index) => ({
              ordinal: index + 1,
              input: sample.input,
              output: sample.output,
            })),
          difficulty: p.difficulty ?? null,
          tagIds: p.tagDetails?.map((tag) => tag.id) ?? [],
          visibility: p.visibility,
        });
        setHasDraft(Boolean(d && Array.isArray(d.testcases) && d.defaults));
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
  const refreshJudgeDraft = async () => {
    const next = await api.judgeDraft(problemId).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    });
    setHasDraft(
      Boolean(next && Array.isArray(next.testcases) && next.defaults),
    );
    setDraft(
      next && Array.isArray(next.testcases) && next.defaults
        ? next
        : {
            problemId,
            defaults: fallbackDefaults,
            testcases: [],
            validation: emptyValidation,
            updatedAt: new Date().toISOString(),
          },
    );
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

  const updateStatement = (key: keyof typeof statement, value: unknown) => {
    setDirty(true);
    setStatement((s) => ({ ...s, [key]: value }));
  };
  const updateSample = (
    index: number,
    key: 'input' | 'output',
    value: string,
  ) => {
    setDirty(true);
    setStatement((s) => ({
      ...s,
      samples: s.samples.map((sample, item) =>
        item === index ? { ...sample, [key]: value } : sample,
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
      toast({
        kind: 'success',
        title: '保存成功',
        description: '题面内容已更新',
      });
    } catch (e) {
      toast({ kind: 'error', title: '保存失败', description: errorText(e) });
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
      setDraft(next);
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
      setHasDraft(false);
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const createDraftFromLatest = async () => {
    if (!canManage || !versions[0]) return;
    setSaving(true);
    try {
      const next = await api.createJudgeDraftFromLatest(problemId);
      setDraft(next);
      setHasDraft(true);
      setNotice(
        `已从 v${versions[0].versionNumber} 创建可编辑草稿，已发布版本保持不可变。`,
      );
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
      await api.uploadJudgeData(problemId, file, zip);
      await refreshJudgeDraft();
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
  const remove = async (
    t: JudgeDraftTestcase,
    displayOrdinal = t.ordinal + 1,
  ) => {
    if (!window.confirm(`确定删除测试点 #${displayOrdinal} 吗？`)) return;
    try {
      await api.deleteJudgeTestcase(problemId, t.testcaseId);
      await refreshJudgeDraft();
      setNotice('测试点已删除。');
    } catch (e) {
      setNotice(errorText(e));
    }
  };
  const deleteProblem = async () => {
    if (!problem || !canEdit || deleting) return;
    const label = `${problem.publicId || problem.slug} - ${problem.title}`;
    if (
      !window.confirm(
        `Confirm delete ${label}? History remains; new submissions will be rejected.`,
      )
    )
      return;
    const reason = window
      .prompt('Short deletion reason', 'problem author request')
      ?.trim();
    if (!reason) return;
    setDeleting(true);
    try {
      await api.deleteProblem(problemId, reason, problem.updatedAt);
      window.location.assign('/problems');
    } catch (e) {
      setNotice(errorText(e));
      setDeleting(false);
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
    <section className="problem-editor authoring-workspace">
      <nav className="editor-tabs" aria-label="题目编辑分区">
        <h1 className="sr-only">编辑题目：{statement.title || '未命名题目'}</h1>
        <span className="sr-only">DRAFT</span>
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
            <div
              className="authoring-view-switch"
              role="group"
              aria-label="编辑视图"
            >
              <button type="button" className="active">
                编辑
              </button>
              <button type="button" className="secondary">
                预览
              </button>
            </div>
          </div>
          <div className="statement-form-fields">
            <label>
              题目标题
              <input
                value={statement.title}
                onChange={(e) => updateStatement('title', e.target.value)}
                disabled={!canEdit}
                required
              />
            </label>
            <div className="statement-grid">
              <label>
                难度
                <select
                  value={statement.difficulty ?? ''}
                  onChange={(e) =>
                    updateStatement(
                      'difficulty',
                      e.target.value as ProblemDifficulty,
                    )
                  }
                  disabled={!canEdit}
                >
                  <option value="">未设置</option>
                  <option value="入门">入门</option>
                  <option value="简单">简单</option>
                  <option value="中等">中等</option>
                  <option value="困难">困难</option>
                  <option value="专家">专家</option>
                </select>
              </label>
              <TagSelector
                api={api}
                value={statement.tagIds}
                onChange={(ids) => updateStatement('tagIds', ids)}
                disabled={!canEdit}
              />
              <label>
                可见性
                <select
                  value={statement.visibility}
                  onChange={(e) =>
                    updateStatement(
                      'visibility',
                      e.target.value as Problem['visibility'],
                    )
                  }
                  disabled={!canEdit}
                >
                  <option value="private">仅自己可见</option>
                  <option value="public">公开</option>
                </select>
              </label>
            </div>
            <div className="markdown-fields" aria-label="题面 Markdown 字段">
              <MarkdownFieldSection
                fieldKey="background"
                label="题目背景"
                value={statement.background}
                rows={6}
                disabled={!canEdit}
                onChange={(value) => updateStatement('background', value)}
                previewLabel="题面实时预览"
              />
              <MarkdownFieldSection
                fieldKey="statement"
                label="题目描述"
                value={statement.statement}
                rows={8}
                disabled={!canEdit}
                onChange={(value) => updateStatement('statement', value)}
              />
              <MarkdownFieldSection
                fieldKey="inputDescription"
                label="输入格式"
                value={statement.inputDescription}
                rows={5}
                disabled={!canEdit}
                onChange={(value) => updateStatement('inputDescription', value)}
              />
              <MarkdownFieldSection
                fieldKey="outputDescription"
                label="输出格式"
                value={statement.outputDescription}
                rows={5}
                disabled={!canEdit}
                onChange={(value) =>
                  updateStatement('outputDescription', value)
                }
              />
            </div>
            <fieldset>
              <legend>样例</legend>
              {statement.samples.length === 0 ? (
                <p className="field-help">暂无样例。</p>
              ) : (
                statement.samples.map((sample, index) => (
                  <div className="sample-editor" key={sample.ordinal}>
                    <div className="sample-heading">
                      <strong>样例 #{index + 1}</strong>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          setDirty(true);
                          setStatement((current) => ({
                            ...current,
                            samples: current.samples
                              .filter((_, item) => item !== index)
                              .map((item, ordinal) => ({
                                ...item,
                                ordinal: ordinal + 1,
                              })),
                          }));
                        }}
                        disabled={!canEdit}
                      >
                        删除
                      </button>
                    </div>
                    <div className="statement-grid">
                      <label>
                        输入样例 {index + 1}
                        <textarea
                          rows={3}
                          value={sample.input}
                          onChange={(e) =>
                            updateSample(index, 'input', e.target.value)
                          }
                          disabled={!canEdit}
                        />
                      </label>
                      <label>
                        输出样例 {index + 1}
                        <textarea
                          rows={3}
                          value={sample.output}
                          onChange={(e) =>
                            updateSample(index, 'output', e.target.value)
                          }
                          disabled={!canEdit}
                        />
                      </label>
                    </div>
                  </div>
                ))
              )}
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setDirty(true);
                  setStatement((current) => ({
                    ...current,
                    samples: [
                      ...current.samples,
                      {
                        ordinal: current.samples.length + 1,
                        input: '',
                        output: '',
                      },
                    ],
                  }));
                }}
                disabled={!canEdit}
              >
                添加样例
              </button>
            </fieldset>
            <div className="markdown-fields">
              <MarkdownFieldSection
                fieldKey="constraints"
                label="数据范围"
                value={statement.constraints}
                rows={4}
                disabled={!canEdit}
                onChange={(value) => updateStatement('constraints', value)}
              />
              <MarkdownFieldSection
                fieldKey="notes"
                label="说明与提示"
                value={statement.notes}
                rows={4}
                disabled={!canEdit}
                onChange={(value) => updateStatement('notes', value)}
              />
            </div>
            <div className="authoring-action-bar">
              <a
                className="editor-back-link"
                href={`/problems/${encodeURIComponent(problem.slug || problem.id)}`}
              >
                ← 返回题目
              </a>
              <button disabled={!canEdit || saving}>
                {saving ? '保存中…' : '保存题面'}
              </button>
            </div>
          </div>
        </form>
      )}
      {canEdit && (
        <section className="editor-panel danger-zone" aria-label="Danger zone">
          <div className="panel-heading">
            <div>
              <h2>Danger zone</h2>
              <p>
                Deleted problems leave historical submissions and evaluations
                intact.
              </p>
            </div>
            <button
              type="button"
              className="danger-button"
              onClick={() => void deleteProblem()}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete problem'}
            </button>
          </div>
        </section>
      )}
      {tab === 'data' && (
        <div className="editor-panel data-panel">
          <div className="panel-heading">
            <div>
              <h2>Judge Data</h2>
              <p>
                <strong>当前草稿评测数据</strong>
                （DRAFT）与最新已发布版本分离。当前 {
                  draft.testcases.length
                }{' '}
                个测试点，{overrides} 个测试点含覆盖值。
                {versions[0]
                  ? ` 最新已发布 v${versions[0].versionNumber}。`
                  : ' 暂无已发布版本。'}
              </p>
            </div>
            <div className="panel-actions">
              {!hasDraft && versions[0] && (
                <button
                  type="button"
                  onClick={createDraftFromLatest}
                  disabled={!canManage || saving}
                >
                  编辑最新版本
                </button>
              )}
              <button
                type="button"
                onClick={validate}
                disabled={!canManage || saving || !hasDraft}
              >
                校验草稿
              </button>
              <button
                type="button"
                onClick={() => setPublishPending(true)}
                disabled={
                  !canPublish ||
                  saving ||
                  !hasDraft ||
                  draft.validation.state !== 'VALID'
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
              accept=".zip,.in,.out,.ans,.txt"
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
                      {pair.input} / {pair.output ?? '缺少结果文件'}
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
                <p>
                  上传 .in 与 .out、.ans 或 .txt 文件，或 ZIP
                  后，测试点会出现在这里。
                </p>
              </div>
            ) : (
              draft.testcases
                .slice()
                .sort((a, b) => a.ordinal - b.ordinal)
                .map((t, index) => (
                  <TestcaseRow
                    key={t.testcaseId}
                    testcase={t}
                    displayOrdinal={index + 1}
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
            {['cpp20-gcc-13-v1'].map((profile) => (
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
  displayOrdinal,
  defaults,
  canManage,
  onChange,
  onRemove,
}: {
  testcase: JudgeDraftTestcase;
  displayOrdinal: number;
  defaults: ProblemJudgeDefaults;
  canManage: boolean;
  onChange: (id: string, patch: Partial<JudgeDraftTestcase>) => void;
  onRemove: (t: JudgeDraftTestcase, displayOrdinal: number) => void;
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
    <article className="testcase-card testcase-row">
      <header className="testcase-card-header">
        <h3>
          Test Case #{displayOrdinal}
          {t.label ? ` · ${t.label}` : ''}
        </h3>
        <button
          type="button"
          className="danger-button"
          onClick={() => onRemove(t, displayOrdinal)}
          disabled={!canManage}
        >
          删除
        </button>
      </header>
      <div className="testcase-content-grid">
        <label className="testcase-content-field">
          Input
          <textarea
            readOnly
            value={t.input.fileName}
            aria-label={`Test Case #${displayOrdinal} Input`}
            rows={5}
          />
        </label>
        <label className="testcase-content-field">
          Expected Output
          <textarea
            readOnly
            value={t.expectedOutput.fileName}
            aria-label={`Test Case #${displayOrdinal} Expected Output`}
            rows={5}
          />
        </label>
      </div>
      <div className="case-metadata">
        <span className="case-file-pair">
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
