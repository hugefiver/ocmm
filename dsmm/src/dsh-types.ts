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

export interface DshSession {
  events: readonly DshSessionEvent[];
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

export interface DshInjectedServices {
  settings?: DshSettingsRegistry;
  skills?: DshSkillRegistry;
  commands?: DshCommandsRegistry;
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
  inject?(dependencies: string[], installer: (services: DshInjectedServices) => unknown): unknown;
  on?(event: "agent/pre-step", listener: (frame: PreStepFrame, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>): unknown;
  logger?: { warn(message: string, ...args: unknown[]): void };
}
