export const zhCN = {
  nav: {
    home: '首页',
    problems: '题库',
    submissions: '评测列表',
    authoring: '出题工作台',
    profile: '个人主页',
    settings: '账户与安全',
    login: '登录',
    register: '注册',
    logout: '退出登录',
    open: '打开导航',
    close: '关闭导航',
  },
  platform: {
    checking: '正在检查平台服务状态…',
    ready: '平台服务正常',
    notReady: '平台服务尚未完全就绪',
    unavailable: '平台服务状态暂不可用',
    notReadyDetail: '部分依赖服务暂不可用，题库和提交相关功能可能无法使用。',
  },
  common: {
    retry: '重试',
    unavailable: '暂不可用',
    loading: '加载中…',
    back: '返回',
    next: '下一页',
    previous: '上一页',
  },
} as const;

export function formatDate(value: string, withTime = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return date.toLocaleString(
    'zh-CN',
    withTime ? undefined : { dateStyle: 'medium' },
  );
}

export function translateJudgeLabel(label: string) {
  const labels: Record<string, string> = {
    Pending: '等待接收',
    Queued: '排队中',
    Leased: '已分配',
    'Worker lease claimed': '评测工作进程已接单',
    'Worker accepted the job': '评测工作进程已接收',
    'Qualification fixture running': '资格测试执行中',
    'Retryable protocol failure': '协议失败，可重试',
    'Retrying infrastructure step': '基础设施步骤重试中',
    'Terminal protocol failure': '协议失败，已终止',
    'Qualification job cancelled': '资格测试已取消',
    'Synthetic completion': '模拟流程完成',
    'Judge worker degraded': '评测服务降级',
    'Judge worker unavailable': '评测服务不可用',
    'Unknown protocol state': '未知协议状态',
  };
  return labels[label] ?? label;
}

export function translateJudgeNote(note: string) {
  if (note.includes('not executed'))
    return '仅执行资格流程，未运行用户提交代码。';
  if (note.includes('no submitted code'))
    return '本次流程已取消，未运行用户提交代码。';
  if (note.includes('not a Judge result'))
    return '这是基础设施状态，不是评测结果。';
  if (note.includes('not a source verdict'))
    return '这是协议状态，不是源代码判题结论。';
  if (note.includes('Intake stopped')) return '题目接收在执行前停止。';
  if (note.includes('protocol intake')) return '等待平台接收提交。';
  if (note.includes('not recognized')) return '客户端无法识别该状态。';
  return note;
}

export function translateProblemStatus(status: string) {
  return (
    (
      { draft: '草稿', published: '已发布', archived: '已归档' } as Record<
        string,
        string
      >
    )[status] ?? status
  );
}

export function translateVisibility(visibility: string) {
  return visibility === 'public'
    ? '公开'
    : visibility === 'private'
      ? '私有'
      : visibility;
}
