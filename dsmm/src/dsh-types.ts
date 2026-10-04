export interface SettingsScope<T> {
  get(): T;
  watch?(callback: (next: T, prev: T) => void | Promise<void>): () => void;
}

export interface DshSettingsRegistry {
  register<T>(namespace: string, schema: unknown, options: { base: Partial<T>; applies?: "live" | "restart" }): SettingsScope<T>;
}

export interface DshSessionEvent {
  type: string;
  data?: unknown;
}

export interface DshSessionHeader {
  cwd?: string;
  agentPreset?: string;
  origin?: string;
}

export interface DshSession {
  events?: readonly DshSessionEvent[];
  snapshotEvents?(): readonly DshSessionEvent[];
  header?: DshSessionHeader;
  requestHeader?(): DshEpochHeader | undefined;
  append(type: "deepwork/mode", payload: { active: boolean }): unknown | Promise<unknown>;
}

export interface DshAgent {
  session: DshSession;
  options?: { provider?: string; model?: string };
  steer?(message: unknown): unknown | Promise<unknown>;
  inject?(message: unknown): unknown | Promise<unknown>;
}

export interface DshLlmCallConfig {
  provider: string;
  model: string;
  reasoningEffort?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: unknown;
  [key: string]: unknown;
}

export interface DshLlmFailure {
  readonly message: string;
  readonly code: string;
  readonly status?: number;
  readonly providerRetryAfterMs?: number;
  readonly requestId?: unknown;
}

export interface DshEpochHeader {
  config: DshLlmCallConfig;
  [key: string]: unknown;
}

export interface DshReasoningEffortInfo {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface DshModelReasoningInfo {
  efforts: readonly DshReasoningEffortInfo[];
  defaultEffort?: string;
  [key: string]: unknown;
}

export interface DshResolvedModelInfo {
  provider: string;
  id: string;
  name: string;
  reasoning?: DshModelReasoningInfo;
  [key: string]: unknown;
}

export interface DshLlmRuntime {
  resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<DshResolvedModelInfo>;
}

export interface AgentRequestFrame {
  agent: DshAgent;
  turn: number;
  step: number;
  signal: AbortSignal;
}

export interface AgentRequestErrorFrame {
  agent: DshAgent;
  turn: number;
  step: number;
  provider: string;
  failure: DshLlmFailure;
  retryPolicy: unknown;
  signal: AbortSignal;
}

export type DshRequestErrorAction = { kind: "retry" } | undefined;

export interface AgentTurnStoppingFrame {
  agent: DshAgent;
  turn: number;
  signal: AbortSignal;
}

export interface DshStepBoundaryEventData {
  turn: number;
  step: number;
}

export interface DshRequestHeaderEventData {
  header: DshEpochHeader;
  reason: "initial" | "resume" | "change" | "series";
}

export interface DshTodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface DshTodoWriteEventData {
  todos: DshTodoItem[];
}

export interface DshGoalSnapshot {
  id: string;
  revision: number;
  objective: string;
  phase: "active" | "paused" | "blocked" | "complete";
  blockedReason?: { code: string; message: string };
  maxGoalRounds: number;
}

export type DshGoalChangeEventData =
  | {
      kind: "goal/change";
      version: 1;
      operation: "create" | "edit" | "pause" | "resume" | "complete" | "block";
      goal: DshGoalSnapshot;
      roundsStarted: number;
      createdAt: number;
      updatedAt: number;
    }
  | {
      kind: "goal/change";
      version: 1;
      operation: "clear";
      cleared: { id: string; revision: number };
      clearedAt: number;
    };

export interface DshSystemPromptContext {
  agent?: DshAgent;
  [key: string]: unknown;
}

export interface DshSystemPromptSection {
  name: string;
  order: number;
  interpolate?: boolean;
  text(context: DshSystemPromptContext): string;
}

export interface DshSystemPromptRegistry {
  section(section: DshSystemPromptSection): unknown;
}

export interface DshPromptAssembly {
  sections: Array<{ name: string; text: string; interpolate?: boolean }>;
  contexts: unknown[];
  tools: unknown[];
  variables: Record<string, string | undefined>;
}

export interface DshCommandInvocation {
  agent: DshAgent;
  rawInput: string;
  attachments?: readonly unknown[];
  signal?: AbortSignal;
}

export interface DshCommandResult {
  kind: "success" | "error";
  text?: string;
}

export interface DshCommandsRegistry {
  register(command: {
    name: string;
    description: string;
    input?: { hint: string; images?: boolean };
    handler(invocation: DshCommandInvocation): DshCommandResult | Promise<DshCommandResult>;
  }): unknown;
}

export interface DshSkillRegistration {
  name: string;
  description: string;
  content: string;
  source?: "bundled" | "runtime" | string;
  provider?: string;
  resourceBase?: { kind: "directory"; path: string } | { kind: "opaque"; description: string };
  invocation?: { modelInvocable: boolean; userInvocable: boolean };
}

export interface DshSkillRegistry {
  register(skill: DshSkillRegistration): unknown;
}

export interface DshContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface DshToolExecution {
  callId?: unknown;
  rootCallId?: unknown;
  name: string;
  arguments: unknown;
  agent?: DshAgent;
  parent?: unknown;
  signal?: AbortSignal;
}

export type DshPreToolDecision =
  | { kind: "allow" }
  | { kind: "deny"; reason: string }
  | { kind: "ask"; reason?: string }
  | { kind: "cancel" };

export type DshPostToolDecision =
  | { kind: "accept"; content?: DshContentBlock[]; value?: never; additionalContexts?: unknown[] }
  | { kind: "accept"; value: unknown; content?: never; additionalContexts?: unknown[] }
  | { kind: "block"; feedback: DshContentBlock[]; additionalContexts?: unknown[] };

export interface DshToolExecutionResult {
  isError: boolean;
  content: DshContentBlock[];
  value?: unknown;
  error?: unknown;
  additionalContexts?: unknown[];
}

export interface DshToolRuntime {
  guard?(guard: (execution: Readonly<DshToolExecution>) => string | undefined): () => void;
  get?(name: string): unknown;
}

export type DshEventListener = (...args: any[]) => any;

export interface DshInjectedServices {
  settings?: DshSettingsRegistry;
  skills?: DshSkillRegistry;
  commands?: DshCommandsRegistry;
  tools?: DshToolRuntime;
  llm?: DshLlmRuntime;
  [key: string]: unknown;
}

export interface PreStepFrame {
  agent: DshAgent;
  signal: AbortSignal;
}

export interface PreStepDecision {
  kind: string;
  messages?: readonly unknown[];
  [key: string]: unknown;
}

export interface DshContext {
  settings?: DshSettingsRegistry;
  systemPrompt?: DshSystemPromptRegistry;
  skills?: DshSkillRegistry;
  commands?: DshCommandsRegistry;
  tools?: DshToolRuntime;
  llm?: DshLlmRuntime;
  get?<T = unknown>(name: string): T | undefined;
  plugin?(plugin: unknown, config?: unknown): PromiseLike<unknown>;
  inject?(dependencies: string[], installer: (readyCtx: DshContext) => unknown): unknown;
  effect?(callback: () => void | (() => void)): unknown;
  on?(event: "agent/request", listener: (frame: AgentRequestFrame, next: () => Promise<DshLlmCallConfig>) => Promise<DshLlmCallConfig>, options?: boolean | { prepend?: boolean; global?: boolean }): unknown;
  on?(event: "agent/request-error", listener: (frame: AgentRequestErrorFrame, next: () => Promise<DshRequestErrorAction>) => Promise<DshRequestErrorAction>, options?: boolean | { prepend?: boolean; global?: boolean }): unknown;
  on?(event: "agent/turn-stopping", listener: (frame: AgentTurnStoppingFrame) => void | Promise<void>, options?: boolean | { prepend?: boolean; global?: boolean }): unknown;
  on?(event: "agent/pre-step", listener: (frame: PreStepFrame, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>, options?: unknown): unknown;
  on?(event: string, listener: DshEventListener, options?: unknown): unknown;
  logger?: { warn(message: string, ...args: unknown[]): void };
}
