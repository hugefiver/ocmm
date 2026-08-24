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
}

export interface DshSession {
  events: readonly DshSessionEvent[];
  header?: DshSessionHeader;
  append(type: "deepwork/mode", payload: { active: boolean }): unknown | Promise<unknown>;
}

export interface DshAgent {
  session: DshSession;
  options?: { provider?: string; model?: string };
  steer?(message: unknown): unknown | Promise<unknown>;
  inject?(message: unknown): unknown | Promise<unknown>;
}

export interface DshSystemPromptContext {
  agent?: DshAgent;
  [key: string]: unknown;
}

export interface DshSystemPromptSection {
  name: string;
  order: number;
  text(context: DshSystemPromptContext): string;
}

export interface DshSystemPromptRegistry {
  section(section: DshSystemPromptSection): unknown;
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
  | { kind: "ask"; reason?: string };

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
}

export type DshEventListener = (...args: any[]) => any;

export interface DshInjectedServices {
  settings?: DshSettingsRegistry;
  skills?: DshSkillRegistry;
  commands?: DshCommandsRegistry;
  tools?: DshToolRuntime;
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
  get?<T = unknown>(name: string): T | undefined;
  inject?(dependencies: string[], installer: (readyCtx: DshContext) => unknown): unknown;
  effect?(callback: () => void | (() => void)): unknown;
  on?(event: "agent/pre-step", listener: (frame: PreStepFrame, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>, options?: unknown): unknown;
  on?(event: string, listener: DshEventListener, options?: unknown): unknown;
  logger?: { warn(message: string, ...args: unknown[]): void };
}
