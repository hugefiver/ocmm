/**
 * Built-in agent catalog with per-agent fallback chains.
 *
 * These are NEW agents this plugin can register through the OpenCode `config`
 * hook. Each agent gets a preferred model + a fallback list. We intentionally
 * mirror omo's role names (sisyphus, oracle, librarian, ...) so prompts and
 * conventions stay portable, but the models / variants are our defaults.
 *
 * Names follow opencode agent naming (lowercase, kebab-case).
 */

import type { Agent } from "../shared/types.ts"

export const BUILTIN_AGENTS: Agent[] = [
  {
    name: "sisyphus",
    description:
      "Powerful orchestrator. Decomposes work, delegates to specialists, verifies results. Defaults to a flagship reasoning model.",
    requirement: {
      variant: "max",
      requiresAnyModel: true,
      fallbackChain: [
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["kimi-for-coding", "moonshot"], model: "kimi-k2.6" },
        { providers: ["kimi-for-coding", "moonshot"], model: "k2p5" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "medium" },
        { providers: ["zhipu"], model: "glm-5.1" },
      ],
    },
  },
  {
    name: "hephaestus",
    description:
      "Autonomous worker. Executes complex implementation independently. Pinned to GPT-class providers when available.",
    requirement: {
      requiresProvider: ["openai", "github-copilot", "vercel", "opencode"],
      requiresAnyModel: true,
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "medium" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "high" },
      ],
    },
  },
  {
    name: "oracle",
    description:
      "Read-only consultation. Hard-problem reasoning, debugging, architecture review. Expensive, high-quality.",
    requirement: {
      variant: "high",
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "high" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "high" },
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["zhipu"], model: "glm-5.1" },
      ],
    },
  },
  {
    name: "librarian",
    description:
      "External-reference lookup: docs, OSS examples, API references. Fast, broad, cheap.",
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
    name: "explore",
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
    name: "prometheus",
    description: "Planner. Produces structured work plans; coordinator only — never edits code (other than markdown notes).",
    requirement: {
      variant: "max",
      fallbackChain: [
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "high" },
        { providers: ["zhipu"], model: "glm-5.1" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "high" },
      ],
    },
  },
  {
    name: "metis",
    description: "Pre-planning consultant. Identifies hidden assumptions, ambiguities, AI failure points before plans are written.",
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
    name: "momus",
    description: "Plan critic. Evaluates work plans against rigorous clarity / verifiability / completeness standards.",
    requirement: {
      variant: "xhigh",
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "xhigh" },
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "high" },
        { providers: ["zhipu"], model: "glm-5.1" },
      ],
    },
  },
  {
    name: "multimodal-looker",
    description: "Analyzes media (images, PDFs, diagrams) — extracts structured info from visual content.",
    requirement: {
      variant: "medium",
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "medium" },
        { providers: ["kimi-for-coding", "moonshot"], model: "kimi-k2.6" },
        { providers: ["zhipu"], model: "glm-4.6v" },
      ],
    },
  },
  {
    name: "atlas",
    description: "Master orchestrator for long-running boulder / background workflows.",
    requirement: {
      fallbackChain: [
        { providers: ["anthropic"], model: "claude-sonnet-4-6" },
        { providers: ["kimi-for-coding", "moonshot"], model: "kimi-k2.6" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "medium" },
        { providers: ["minimax"], model: "minimax-m3" },
      ],
    },
  },
  {
    name: "sisyphus-junior",
    description: "Focused single-task executor. Takes a category + skill list + clear goal.",
    requirement: {
      fallbackChain: [
        { providers: ["anthropic"], model: "claude-sonnet-4-6" },
        { providers: ["kimi-for-coding", "moonshot"], model: "kimi-k2.6" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "medium" },
        { providers: ["minimax"], model: "minimax-m3" },
      ],
    },
  },
]

export const BUILTIN_AGENT_INDEX: ReadonlyMap<string, Agent> = new Map(
  BUILTIN_AGENTS.map((a) => [a.name, a]),
)
