/**
 * Built-in category catalog.
 *
 * Mirrors omo's 8 categories (visual-engineering, ultrabrain, deep, artistry,
 * quick, unspecified-low, unspecified-high, writing). Models are illustrative
 * defaults — users can override anything in their config.
 *
 * NOTE: Phase 1 does NOT route per-call by category — chat.params cannot change
 * the model. Categories surface here so the future delegate-task tool, agent
 * fallbacks that share a category, and config validation all share one source.
 */

import type { Category } from "../shared/types.ts"

export const BUILTIN_CATEGORIES: Category[] = [
  {
    name: "visual-engineering",
    description:
      "Frontend, UI/UX, design, styling, animation. Bias toward strong visual taste, design systems, and thoughtful typography.",
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
    name: "artistry",
    description:
      "Creative, unconventional problem-solving. Generate diverse bold options first, embrace ambiguity, balance novelty with coherence.",
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
    name: "ultrabrain",
    description:
      "Hard logic / heavy reasoning. Strategic-advisor mindset; one clear recommendation with risk + effort estimate.",
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
    name: "deep",
    description:
      "Goal-oriented autonomous problem-solving on hairy problems requiring deep research. Generous exploration budget; full delivery completion bar.",
    requirement: {
      variant: "medium",
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "medium" },
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["google", "google-vertex"], model: "gemini-3.1-pro", variant: "high" },
      ],
    },
  },
  {
    name: "quick",
    description:
      "Trivial single-file changes, typo fixes, simple modifications. Smaller model — needs EXHAUSTIVELY EXPLICIT prompts (TASK / MUST DO / MUST NOT DO / EXPECTED OUTPUT).",
    requirement: {
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.4-mini" },
        { providers: ["anthropic"], model: "claude-haiku-4-5" },
      ],
    },
  },
  {
    name: "unspecified-low",
    description:
      "Tasks that don't fit other categories, low effort. Selection-gate: verify the task does not fit a more specific category.",
    requirement: {
      fallbackChain: [
        { providers: ["anthropic"], model: "claude-sonnet-4-6" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "medium" },
      ],
    },
  },
  {
    name: "unspecified-high",
    description:
      "Tasks that don't fit other categories, high effort. Selection-gate stricter than -low.",
    requirement: {
      variant: "max",
      fallbackChain: [
        { providers: ["anthropic"], model: "claude-opus-4-7", variant: "max" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "high" },
      ],
    },
  },
  {
    name: "writing",
    description:
      "Documentation, prose, technical writing. Anti-AI-slop posture: no em/en dashes, no AI filler (delve, leverage, utilize, robust, streamline).",
    requirement: {
      fallbackChain: [
        { providers: ["kimi-for-coding", "moonshot"], model: "k2p5" },
        { providers: ["google", "google-vertex"], model: "gemini-3-flash" },
        { providers: ["anthropic"], model: "claude-sonnet-4-6" },
      ],
    },
  },
]

/** Indexed lookup. */
export const BUILTIN_CATEGORY_INDEX: ReadonlyMap<string, Category> = new Map(
  BUILTIN_CATEGORIES.map((c) => [c.name, c]),
)
