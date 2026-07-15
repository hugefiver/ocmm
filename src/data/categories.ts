/**
 * Built-in category catalog.
 *
 * 10 categories cover concrete work shapes:
 *   frontend       - UI/UX, design, styling, animation
 *   creative       - unconventional / generative problem-solving
 *   hard-reasoning - local name for ultrabrain-style decisions
 *   research       - autonomous multi-step research and delivery
 *   quick          - fully specified mechanical edits
 *   coding        - determined code edits and bug fixes
 *   normal-task   - ordinary bounded tasks with known acceptance criteria
 *   complex       - multi-step ordinary tasks below autonomous deep delivery
 *   deep          - autonomous system development and feature delivery
 *   documenting   - standalone text/documentation that does not change product behavior
 */

import type { Category } from "../shared/types.ts"

export const BUILTIN_CATEGORIES: Category[] = [
  {
    name: "frontend",
    description:
      "UI/UX, layout, styling, interaction states, accessibility, visual QA, and design-system-aware implementation.",
    requirement: {
      variant: "high",
      fallbackChain: [
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "high" },
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "high" },
      ],
    },
  },
  {
    name: "creative",
    description:
      "Unconventional / generative problem-solving. Generate diverse bold options first, embrace ambiguity, balance novelty with coherence.",
    requirement: {
      variant: "high",
      fallbackChain: [
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "high" },
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "high" },
      ],
    },
  },
  {
    name: "hard-reasoning",
    description:
      "Local name for ultrabrain-style work: architecture, algorithms, correctness, and tradeoff decisions where the output is primarily a recommendation with risks and concrete next steps.",
    requirement: {
      variant: "xhigh",
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "xhigh" },
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "high" },
      ],
    },
  },
  {
    name: "research",
    description:
      "Autonomous multi-step research and delivery. Generous exploration budget; full delivery completion bar.",
    requirement: {
      variant: "high",
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "high" },
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "high" },
      ],
    },
  },
  {
    name: "quick",
    description:
      "Fully specified mechanical edits: typo fixes, exact string replacements, one-line config values, import cleanup, small copy edits, or single assertion updates.",
    requirement: {
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.4-mini" },
        { providers: ["anthropic"], model: "claude-haiku-4-5" },
      ],
    },
  },
  {
    name: "coding",
    description:
      "Determined code editing and bug fixing where the target behavior, affected area, and acceptance criteria are known before implementation starts.",
    requirement: {
      fallbackChain: [
        { providers: ["anthropic"], model: "claude-sonnet-4-6" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "high" },
      ],
    },
  },
  {
    name: "normal-task",
    description:
      "Ordinary bounded tasks with known acceptance criteria: small config updates, tool output checks, straightforward file organization, or contained non-feature changes.",
    requirement: {
      fallbackChain: [
        { providers: ["anthropic"], model: "claude-sonnet-4-6" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "high" },
        { providers: ["google", "google-vertex"], model: "gemini-3-flash" },
        { providers: ["minimax"], model: "minimax-m3" },
      ],
    },
  },
  {
    name: "complex",
    description:
      "Multi-step ordinary tasks that need coordination and judgment but not an autonomous development loop: mixed config/docs/code edits, release-prep checks, or cross-file cleanup with a known goal.",
    requirement: {
      variant: "high",
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "high" },
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "high" },
        { providers: ["kimi-for-coding", "moonshot"], model: "k2p5" },
      ],
    },
  },
  {
    name: "deep",
    description:
      "Autonomous system development and feature implementation: explore, plan, implement, verify, and continue the loop until a complete deliverable works.",
    requirement: {
      variant: "max",
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "max" },
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "high" },
        { providers: ["kimi-for-coding", "moonshot"], model: "kimi-k2.6" },
        { providers: ["zhipu"], model: "glm-5.1" },
      ],
    },
  },
  {
    name: "documenting",
    description:
      "Standalone text and documentation work that does not change product behavior: guides, explanations, release notes, prose cleanup, and copy edits.",
    requirement: {
      fallbackChain: [
        { providers: ["kimi-for-coding", "moonshot"], model: "k2p5" },
        { providers: ["google", "google-vertex"], model: "gemini-3-flash" },
        { providers: ["anthropic"], model: "claude-sonnet-4-6" },
      ],
    },
  },
]

export const BUILTIN_CATEGORY_INDEX: ReadonlyMap<string, Category> = new Map(
  BUILTIN_CATEGORIES.map((c) => [c.name, c]),
)
