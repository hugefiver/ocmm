# Phase 2 + 3 — Hypothesis Formation & Parallel Investigation

One hypothesis is a hunch. Three hypotheses is a decision. Investigation is how you turn the decision into runtime evidence.

---

## Phase 2 — Hypothesis Formation (Minimum Three)

### Why three, not one

A single hypothesis creates confirmation bias: you'll read runtime state looking for evidence that confirms it and unconsciously discount contradictions. Three hypotheses force you to design queries that *distinguish* between them, which is the only way runtime evidence becomes decisive.

### Generate across orthogonal axes

If your three hypotheses are all variations of "the handler has a bug", you don't actually have three hypotheses. Span the space:

| Axis | Example framing |
|---|---|
| **User-code logic** | "The handler early-returns because condition X is unexpectedly true" |
| **Library/SDK behavior** | "The third-party client swallows the error and returns a stub" |
| **Environment/config** | "The env var is read at module-load time before it gets populated, so it's empty" |
| **Async/timing** | "The promise rejects (or goroutine panics) after the response is already sent" |
| **Silent side-effect** | "An earlier turn mutated shared state that the current turn inherits" |
| **Observability gap** | "The error is raised but suppressed before logging; it only exists as an unawaited rejection / ignored signal" |
| **Binary-level** (when applicable) | "The function we think is running is actually jumped over by a patched thunk / a different version loaded" |
| **Build-vs-runtime** | "The code we're reading is not the code that's running — stale build, wrong symlink, cached wheel, or dist/ ahead of src/" |

### Keep the active hypothesis set in conversation or disposable investigation state

1. **Claim** — one sentence.
2. **Distinguishing evidence** — the exact value or state that confirms or refutes it, AND where to read it (file:line, log source, breakpoint location, memory address).
3. **If true, the fix is** — two words. Forces you to think through fix cost before committing to the hunt.

### Collapse rule

If two hypotheses have identical distinguishing evidence, they aren't actually different — collapse them and find a real alternative. If you can't come up with a third distinct hypothesis, you don't understand the system well enough yet. Go read a little more code before investigating.

---

## Phase 3 — Parallel Investigation

Branch depending on what's available.

### Path A: Team mode ENABLED

When the `team_*` tools are present, create a **debug-squad** team and split investigation across members working on different evidence sources. This is the right default whenever you have ≥3 hypotheses and any of them would take >10 minutes to investigate single-threaded.

**Team spec** - write to `~/.opencode/teams/debug-squad/config.json`:

```json
{
  "name": "debug-squad",
  "lead": { "kind": "subagent_type", "subagent_type": "sisyphus" },
  "members": [
    {
      "kind": "subagent_type",
      "subagent_type": "explore",
      "prompt": "You are the Runtime State Inspector. Your job: attach to the live process, hit breakpoints, read program state (variables, heap, goroutines, stack, registers depending on runtime), and report observed values verbatim. Never guess — if you don't see the value, say so. Report back via team_send_message with file:line / address references and captured values. Never edit source code. Never run git commands. If you need an instrumentation statement added (breakpoint(), debugger;, dbg!, etc.), ask the Lead first."
    },
    {
      "kind": "subagent_type",
      "subagent_type": "explore",
      "prompt": "You are the Log Archaeologist. Your job: grep server logs, stderr streams, SDK-internal debug output (DEBUG env, RUST_LOG, GODEBUG, PYTHONASYNCIODEBUG), and correlate timestamps. Produce a timeline of events with latencies. Flag anything that looks like a silent catch, a swallowed rejection, a panic recovered-and-ignored, a success response that contains failure signals (HTTP 200 with empty body, stopReason=error, exit 0 with error-in-stdout). Never edit source code."
    },
    {
      "kind": "subagent_type",
      "subagent_type": "explore",
      "prompt": "You are the Reproduction Engineer. Build the smallest reliable repro using the available runtime tools. Report exact input, expected output, and observed output. Save temporary repro artifacts in the task-owned temporary directory and return their exact ownership and cleanup identities to the Lead. Browser reproductions require Playwright CLI, not curl simulation."
    },
    {
      "kind": "subagent_type",
      "subagent_type": "explore",
      "prompt": "You are the Trace Correlator. Your job: take findings from the other members and cross-link them. Build a causal chain from symptom to suspected cause. Identify missing evidence. Propose the next single most-decisive runtime query. Never edit source code; only reason across already-captured evidence. If two complete evidence rounds fail, tell the Lead that the task now qualifies for the bounded hard-reasoning escalation."
    }
  ]
}
```

**Assignment rule**: one hypothesis → one `team_task_create`. Give each hypothesis to the member whose evidence source is most likely to confirm or refute it. Broadcast the full hypothesis list once via `team_send_message(to="*")` so members know what the others are testing.

**Lead responsibilities**:
- Maintain the task-owned temporary resource checklist and active investigation state.
- Approve any source-code edits (including `debugger;` / `breakpoint()` / `dbg!` statements).
- Synthesize member reports into updated hypothesis statuses.
- Decide when to disband: `team_shutdown_request` → `team_approve_shutdown` → `team_delete`.

**Team does not include Reviewer or Oracle profiles** — they are reserved for implementation acceptance and code-quality verification. Phase 4 may use one `hard-reasoning` agent only after the strict difficulty threshold is met; see `04-hard-reasoning-escalation.md`.

### Path B: Team mode DISABLED

Fan out async explore/deep subagents instead. Same rule: one hypothesis per subagent.

```
task(description="Inspect runtime state for hypothesis 1", subagent_type="explore",
     prompt="[CONTEXT: bug summary + which hypothesis you own + what state to look at]
     Runtime state investigation for hypothesis 1: ...")
task(description="Inspect logs for hypothesis 2", subagent_type="explore",
     prompt="Log/timing investigation for hypothesis 2: ...")
task(description="Minimize reproduction for hypothesis 3", subagent_type="explore",
     prompt="Reproduction minimizer for hypothesis 3: ...")
```

Dispatch all three through the current callable task schema. Pass `background: true` only when that schema exposes `background` and the parent has independent work; otherwise omit it and keep result-gated work foreground. Do not poll or invent task IDs; wait for completion notifications, then synthesize.

---

## Evidence capture discipline (both paths)

For relevant runtime state, capture evidence in conversation or task-owned temporary storage, not a repository journal:

```markdown
### <ISO timestamp> — <what you looked at>
- Source: <file:line | log source | curl command | breakpoint address>
- Value: `<verbatim>`
- Interpretation: <one line — why this matters>
- Refutes/Confirms: H<n>
```

**Verbatim values only. No paraphrasing.**

- `messages.length=0` is evidence.
- "messages seemed empty" is not evidence — it's a memory of an observation, and memory of observations is where debug sessions go to die.

If you find yourself about to paraphrase, stop, go back, and copy the raw value.

---

## Round completion

A "round" is complete when every hypothesis has confirming or refuting evidence, or available evidence sources are exhausted without a decisive result. An inconclusive round increments the current failed-round count in disposable investigation state. Don't retain a round history in product artifacts. See `04-hard-reasoning-escalation.md` for the two-consecutive-failure threshold.
