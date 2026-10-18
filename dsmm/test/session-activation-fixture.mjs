import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { AgentRegistry } from '@deepseek-ai/dsh-agent';
import { AgentLoop } from '@deepseek-ai/dsh-agent-loop';
import { LlmRuntime, createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl';
import { SessionController } from '@deepseek-ai/dsh-api-session-controller';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';

const require = createRequire(import.meta.url);
const sdk = createRequire(require.resolve('@deepseek-ai/dsh-api-session-controller/package.json'));
const { SessionQueryEngine } = await import(pathToFileURL(sdk.resolve('@deepseek-ai/dsh-session-query')).href);

export async function hostController(ctx, activateOnFollow = false) {
  await ctx.plugin(TypertRegistry).await();
  ctx.provide('fileUploads', { registerAgentResolver() { return () => {}; } });
  ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'fixture', model: 'current-model' }) });
  if (!ctx.get('remoteAccess')) ctx.provide('remoteAccess', { allows: () => true });
  ctx.provide('workspaceRegistry', { archivedSessionIds: [] });
  return new SessionController(ctx, { activateOnFollow });
}

export async function fixture(required = true) {
  const root = await mkdtemp(join(tmpdir(), 'dsmm-activation-sdk-'));
  const ctx = new Context();
  try {
    await Promise.all([ctx.plugin(AgentRegistry), ctx.plugin(SessionStore), ctx.plugin(SessionProjectionRegistry), ctx.plugin(LlmRuntime), ctx.plugin(SystemPrompt, {}), ctx.plugin(ToolRuntime, { mode: 'native' })].map(fiber => fiber.await()));
    await ctx.plugin(Jsonl, { root, compression: 'none' }).await();
    await ctx.plugin(SessionQueryEngine).await();
    const loop = ctx.plugin(AgentLoop, { agents: [], activationAdmissionRequired: required });
    await loop.await();
    const id = SessionId('synthetic-history');
    const handle = await ctx.agents.create({ sessionId: SessionId('synthetic-seed'), meta: { cwd: root, agentPreset: 'retired-0.2-preset' } });
    handle.agent.session.append('session/title', { title: 'Historical title', messageSeqs: [], source: { kind: 'user' } });
    handle.agent.inject(createUserMessage({ content: [{ type: 'text', text: 'pending historical input' }], source: { kind: 'user' } }));
    await ctx.sessionPersistence.flush();
    const persisted = await inspect(ctx, handle.agent.id);
    await handle.dispose();
    const cold = await ctx.sessionPersistence.create({ ...persisted.header, id });
    await cold.append(persisted.events);
    await cold.close();
    return { ctx, root, id, persisted, loop, close: async () => { try { await ctx.fiber.dispose(); } finally { await rm(root, { recursive: true }); } } };
  } catch (error) { try { await ctx.fiber.dispose(); } finally { await rm(root, { recursive: true }); } throw error; }
}

export async function inspect(ctx, id) {
  const handle = await ctx.sessionPersistence.open(id, 'read');
  try { return { header: handle.header, ...(await handle.read(0)) }; }
  finally { await handle.close(); }
}
