/**
 * Built-in category catalog.
 *
 * 8 categories cover the practical work-content spectrum:
 *   frontend       - UI/UX, design, styling, animation
 *   creative       - unconventional / generative problem-solving
 *   hard-reasoning - heavy-logic, architecture, deep tradeoffs
 *   research       - autonomous multi-step research and delivery
 *   quick          - trivial single-file changes
 *   low-effort     - moderate-effort general-purpose work
 *   high-effort    - high-effort general-purpose work
 *   writing        - documentation, prose, technical writing
 */

import type { Category } from "../shared/types.ts"

export const BUILTIN_CATEGORIES: Category[] = [
  {
    name: "frontend",
    description:
      "UI/UX, design, styling, animation. Bias toward strong visual taste, design systems, and thoughtful typography.",
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
      "Heavy logic, architecture, deep tradeoffs. Strategic-advisor mindset; one clear recommendation with risk + effort estimate.",
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
      "Trivial single-file changes, typo fixes, simple modifications. Smaller model - needs EXHAUSTIVELY EXPLICIT prompts (TASK / MUST DO / MUST NOT DO / EXPECTED OUTPUT).",
    requirement: {
      fallbackChain: [
        { providers: ["openai", "github-copilot"], model: "gpt-5.4-mini" },
        { providers: ["anthropic"], model: "claude-haiku-4-5" },
      ],
    },
  },
  {
    name: "low-effort",
    description:
      "Moderate-effort general-purpose work. Selection-gate: verify the task does not fit a more specific category.",
    requirement: {
      fallbackChain: [
        { providers: ["anthropic"], model: "claude-sonnet-4-6" },
        { providers: ["openai", "github-copilot"], model: "gpt-5.5", variant: "medium" },
      ],
    },
  },
  {
    name: "high-effort",
    description:
      "High-effort general-purpose work. Selection-gate stricter than low-effort.",
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
      "Documentation, prose, technical writing. Anti-AI-slop posture: no em/en dashes, no AI filler.",
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
