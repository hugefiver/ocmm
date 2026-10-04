---
name: brainstorming
description: Use before creative or materially ambiguous work to clarify outcomes, constraints, risks, and an implementation direction.
---

# Brainstorming

Discover only enough to resolve decisions that materially change the approved outcome.

- A clear imperative authorizes implementation of its stated scope; no separate design reapproval is needed for an equivalent choice.
- Inspect current behavior, interfaces and safety boundaries. Use a bounded direct path for clear work, a spike when feasibility is unknown, and an architectural decision when material trade-offs remain.
- Record consequential assumptions, why evidence supports them and the cost if wrong. Ask the smallest useful question only for a user-owned decision or meaningful scope/rework risk.
- Escalate choices changing public APIs/protocols, permissions, data/security guarantees, acceptance or irreversible effects; do not infer authorization for unrelated work.
- For complex behavior implementation, use planner → plan-critic → implementation even when the goal is clear. Skip only a limited simple low-risk change or an explicit permitted user request.
- Communicate a design at the granularity needed for coordination; neither a fixed design artifact nor a repeated approval loop is automatic.
