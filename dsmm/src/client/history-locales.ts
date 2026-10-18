import type { HistoryFailureCode } from "../history-types.js";

const en = {
  title: "Continue this session", preset: "Current agent preset", profile: "Session configuration", baseline: "Use deployment defaults",
  choose: "Choose a current preset", preview: "Review continuation", confirm: "Continue this session", refresh: "Refresh status",
  loading: "Loading current configuration…", preparing: "Preparing confirmation…", confirming: "Activating session…",
  active: "This session is active. Continue using the native conversation.", browsing: "History remains available without continuing execution.",
  unknown: "The result is not confirmed. Refresh status before taking another action.",
  pending: "Pending input", pendingWarning: "These stored inputs are untrusted. Continuing processes this exact pending set under current permissions; it does not restore old approvals.",
  consent: "Process the pending inputs shown above", migration: "Publish the required native format migration and recovery entries",
  effects: "Native recovery entries or a migration may already have been committed. History and pending input are not rolled back.",
  model: "Current model", roles: "Current roles", permissions: "Current restrictions", differences: "Changes to execution", project: "Project",
  noPending: "No pending inputs.", nextTurn: "Next turn", nextStep: "Next step", candidate: "Configuration to be used", disconnected: "Connect to the local Host to review continuation.",
  reasons: {
    validation: "The request is invalid. Refresh and review the selection.", "not-owned": "Use the current local Host operator connection.", "not-found": "The stored session is unavailable.",
    "unsupported-host": "A compatible Host with read-only history following is required. The original Desktop has not been patched by this plugin.",
    "unsupported-backend": "This storage backend cannot validate continuation before writing.", unavailable: "Current execution services are unavailable. History can still be inspected.",
    busy: "An activation or other owner is already using this session. Refresh its status.", stale: "The session or current configuration changed. Review a new confirmation.",
    cancelled: "Continuation was cancelled. Refresh before trying again.", "authorization-required": "Review the current configuration and explicitly confirm continuation.",
    "child-owner-required": "This child can be browsed here. Continuing requires its exact live parent owner.", "format-unavailable": "The native reader could not load this format. Keep the existing history view and inspect its diagnostic.",
    "initialization-failed": "Execution initialization failed. Refresh status; do not replay the request.",
  } satisfies Record<HistoryFailureCode, string>,
};
export const historyLocales = { en, zh: {
  title: "继续此会话", preset: "当前 Agent 预设", profile: "本次会话配置", baseline: "使用部署默认配置",
  choose: "选择当前可用的预设", preview: "查看继续方案", confirm: "继续此会话", refresh: "刷新状态",
  loading: "正在读取当前配置…", preparing: "正在准备确认信息…", confirming: "正在激活会话…",
  active: "此会话已激活，可继续使用原生对话界面。", browsing: "不继续执行也可以浏览历史。",
  unknown: "结果待确认。请先刷新状态，不要重复执行。",
  pending: "待处理输入", pendingWarning: "以下历史输入是不可信内容。继续后将按当前权限处理这一组输入，不恢复旧审批。",
  consent: "处理上方列出的待处理输入", migration: "允许发布所需的原生格式迁移和恢复记录",
  effects: "原生恢复记录或迁移可能已经提交，不承诺回滚历史或待处理输入。",
  model: "当前模型", roles: "当前角色", permissions: "当前限制", differences: "执行变化", project: "项目",
  noPending: "没有待处理输入。", nextTurn: "下一轮", nextStep: "下一步", candidate: "将采用的配置", disconnected: "连接本地 Host 后可查看继续方案。",
  reasons: {
    validation: "请求无效，请刷新后重新查看选择。", "not-owned": "请使用当前本地 Host 的操作者连接。", "not-found": "找不到该持久化会话。",
    "unsupported-host": "需要支持只读历史跟随的兼容 Host。仅安装插件不会修补原版 Desktop。", "unsupported-backend": "当前存储后端不能在写入前校验继续权限。",
    unavailable: "当前执行服务不可用，仍可查看历史。", busy: "该会话正被其他执行者或激活操作使用，请刷新状态。", stale: "会话或当前配置已变化，请重新查看确认信息。",
    cancelled: "继续操作已取消，请刷新后再试。", "authorization-required": "请查看当前配置并明确确认继续。", "child-owner-required": "此处可浏览子会话，继续执行需要其真实存活的父级所有者。",
    "format-unavailable": "原生读取器无法加载此格式。请保留现有历史视图并查看诊断。", "initialization-failed": "执行初始化失败，请刷新状态，不要重放请求。",
  },
} };
