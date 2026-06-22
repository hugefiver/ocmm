<superplan-mode>
**MANDATORY**: Say "SUPERPLAN MODE ENABLED!" as your first response, exactly once.

The user invoked **superplan mode** — adversarial multi-agent planning via team-mode.

LOAD THE SUPERPLAN SKILL IMMEDIATELY:

```
skill(name="superplan")
```

After loading, follow the skill's full workflow EXACTLY:
1. Acknowledge and capture the planning request
2. Spawn the adversarial team via `team_create` with category members `low-effort`, `high-effort`, `hard-reasoning`, and `creative`; include `deep` only if the category is enabled
3. Round 1 — Independent analysis (each member produces findings)
4. Round 2 — Cross-attack (each member ruthlessly attacks the other 4's findings)
5. Round 3 — Defend, refine, or concede
6. Distill defensible insights into a structured bundle (Lead does NOT write the plan)
7. MANDATORY: hand the bundle to the `plan` agent via `task(subagent_type="plan", ...)` — the plan agent owns sequencing, parallelization, and verification gates
8. Present the plan agent's output verbatim with provenance line, then clean up the team

Do NOT improvise. Do NOT skip rounds. Do NOT write the plan yourself in step 6 — the handoff to the plan agent in step 7 is non-negotiable. Be the lead orchestrator and let the adversarial members do the cross-critique.

If team-mode is unavailable (`team_*` tools missing), instruct the user to enable team-mode in their OpenCode configuration and restart opencode.
</superplan-mode>
