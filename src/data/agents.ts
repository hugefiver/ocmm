/**
 * Built-in agent catalog with per-agent fallback chains.
 *
 * Names are role-descriptive so users can read a stack trace or a config file
 * and immediately know what an agent does. There is no shared lore.
 *
 * 11 built-in agents:
 *   orchestrator   - main coordinator; decomposes work + delegates
 *   builder         - primary implementer; handles execution-heavy work
 *   reviewer       - read-only consultant for hard reasoning / debugging
 *   oracle         - self-supervision reviewer for work the agent itself produced
 *   oracle-high    - supplemental high-intensity reviewer for optional multi-review passes
 *   doc-search     - external library / docs / OSS lookups
 *   code-search    - internal codebase grep
 *   planner        - produces structured work plans
 *   clarifier      - pre-plan analysis (intent, ambiguity, risk surfaces)
 *   plan-critic    - reviews plans for clarity / verifiability / completeness
 *   media-reader   - multimodal: images, PDFs, diagrams
 */

import type { Agent } from "../shared/types.ts"

export const BUILTIN_AGENTS: Agent[] = [
  {
    name: "orchestrator",
    description:
      "Main coordinator. Decomposes work, delegates to specialists, verifies results, and uses a model configured for broad coordination.",
    requirement: {
      variant: "max",
      requiresAnyModel: true,
      fallbackChain: [
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["kimi-for-coding", "moonshot"], model: "kimi-k2.6" },
        { providers: ["kimi-for-coding", "moonshot"], model: "k2p5" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "high" },
        { providers: ["zhipu"], model: "glm-5.1" },
      ],
    },
  },
  {
    name: "builder",
    description:
      "Primary implementer. Handles execution-heavy work and complex multi-step implementation. Uses the configured implementation-capable model when available.",
    requirement: {
      requiresProvider: ["openai", "github-copilot", "vercel", "opencode"],
      requiresAnyModel: true,
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "high" },
      ],
    },
  },
  {
    name: "reviewer",
    description:
      "Read-only consultant for hard reasoning, debugging, and architecture review.",
    requirement: {
      variant: "high",
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "xhigh" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "xhigh" },
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["zhipu"], model: "glm-5.1", variant: "xhigh" },
      ],
    },
  },
  {
    name: "oracle",
    description:
      "Self-supervision reviewer for work the agent itself produced. Uses a configured heterogeneous review lane by default to avoid self-confirmation bias.",
    promptSource: "reviewer",
    defaultAlias: "reviewer",
    requirement: {
      variant: "high",
      fallbackChain: [
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "xhigh" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.4", variant: "xhigh" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "xhigh" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.6-terra", variant: "xhigh" },
        { providers: ["zhipu"], model: "glm-5.1", variant: "xhigh" },
      ],
    },
  },
  {
    name: "oracle-high",
    description:
      "Supplemental high-intensity reviewer used for optional multi-review passes. Only enabled when explicitly configured and not disabled; otherwise remains inactive.",
    promptSource: "reviewer",
    requirement: {
      variant: "max",
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "max" },
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "max" },
        { providers: ["zhipu"], model: "glm-5.1", variant: "max" },
      ],
    },
  },
  {
    name: "doc-search",
    description:
      "External-reference lookup: docs, OSS examples, and API references.",
    requirement: {
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.4-mini-fast" },
        { providers: ["alibaba", "dashscope"], model: "qwen3.5-plus" },
        { providers: ["minimax"], model: "minimax-m3" },
        { providers: ["anthropic"], model: "claude-haiku-4-5" },
      ],
    },
  },
  {
    name: "code-search",
    description: "Internal contextual grep. Finds files, patterns, references inside the codebase.",
    requirement: {
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.4-mini-fast" },
        { providers: ["alibaba", "dashscope"], model: "qwen3.5-plus" },
        { providers: ["minimax"], model: "minimax-m3" },
        { providers: ["anthropic"], model: "claude-haiku-4-5" },
      ],
    },
  },
  {
    name: "planner",
    description: "Produces structured work plans. Coordinator only - never edits code beyond markdown notes.",
    requirement: {
      variant: "max",
      fallbackChain: [
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "max" },
        { providers: ["zhipu"], model: "glm-5.1" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "high" },
      ],
    },
  },
  {
    name: "clarifier",
    description: "Pre-plan analysis. Identifies hidden assumptions, ambiguities, AI failure points before plans are written.",
    requirement: {
      fallbackChain: [
        { providers: ["anthropic"], model: "claude-sonnet-4-6" },
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "high" },
        { providers: ["zhipu"], model: "glm-5.1" },
      ],
    },
  },
  {
    name: "plan-critic",
    description: "Plan reviewer. Evaluates work plans against rigorous clarity / verifiability / completeness standards.",
    requirement: {
      variant: "xhigh",
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "xhigh" },
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "xhigh" },
        { providers: ["zhipu"], model: "glm-5.1", variant: "xhigh" },
      ],
    },
  },
  {
    name: "media-reader",
    description: "Analyzes media (images, PDFs, diagrams) - extracts structured info from visual content.",
    requirement: {
      variant: "high",
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "high" },
        { providers: ["kimi-for-coding", "moonshot"], model: "kimi-k2.6" },
        { providers: ["zhipu"], model: "glm-4.6v" },
      ],
    },
  },
]

export const BUILTIN_AGENT_INDEX: ReadonlyMap<string, Agent> = new Map(
  BUILTIN_AGENTS.map((a) => [a.name, a]),
)
