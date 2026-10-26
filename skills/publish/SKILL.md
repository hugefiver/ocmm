---
name: publish
description: "Use only for an explicitly authorized ocmm release; require complete publication proof, preserve published identities, and handle unpublished failures only with explicit repair and tag-replacement authorization."
---

# Publish ocmm

Use this skill only after the user explicitly authorizes an ocmm release action. Loading the skill does not authorize a version change, Git write, workflow trigger, package publish, or GitHub Release mutation.

## Completion contract

Workflow terminal success is not release completion. A release is complete only when `pnpm --silent run check:release-completion` returns exit `0` and its JSON receipt has `outcome: "COMPLETED"`.

The receipt must bind one lane, exact tag/version, peeled tag commit, fixed `release.yml` run and attempt, lane-correct job conclusions, exact non-empty Release assets, complete downloaded SHA-256 verification, and every lane-required non-registry surface. Main releases also require the pinned LSP Release to exist. npmjs and GitHub Packages are not completion checks or proof surfaces; registry publish jobs remain part of CI and their job conclusions remain covered by the workflow contract.

Never describe `FAILED`, `UNRESOLVED`, a nonterminal run, terminal workflow success without post-publication proof, or a partial surface set as complete.

## Ship-only behavior

- Do not start a code review, change code, repair a failed workflow, or open a fix loop while publishing.
- Do not use a workstation to overwrite registry packages or GitHub Release assets.
- Once any package or Release asset has been published, never move, delete, or recreate its tag or overwrite the published artifact.
- A failed run that terminated before publication may be repaired outside the publish phase. Reusing its version and replacing its tag requires explicit user authorization for both the repair and force push, evidence that every publication job was skipped or never started, and confirmation that no package or Release asset exists for that version. Uncertain publication state does not qualify.
- For an authorized unpublished-tag replacement, validate the repaired commit and generated bundle first, preserve unrelated branch history, and constrain the force push with an explicit lease on the observed remote tag identity. Bind completion checks to the replacement commit and its new run; never reuse the failed run's receipt as proof.
- Otherwise use a separately authorized new version/tag, or an explicitly authorized workflow rerun that preserves the same tag identity.
- Continue observing independent surfaces after one surface fails so the final report describes the full partial state.

## Required invocation

For a main tag push, run from the exact released checkout after the tag and matching run exist:

```powershell
pnpm --silent run check:release-completion -- --mode remote --repository hugefiver/ocmm --tag v0.6.6 --deadline-ms 5400000 --poll-ms 15000
```

Use the actual authorized tag for releases after `v0.6.6`. For a manually dispatched run, also pass its numeric `--run-id`; the run must itself be bound to the tag branch and peeled SHA.

No local `GITHUB_TOKEN` is needed to bump, tag, push, or trigger CI. The completion checker does not request npmjs or GitHub Packages, while the release workflow continues its registry publication attempts with workflow-managed authentication.

Do not echo the token. Do not paste registry bodies, Authorization headers, or signed asset URLs into chat or evidence.

## Outcome handling

### COMPLETED

Report the tag, peeled SHA, fixed run ID/attempt/URL, lane, exact asset names, and checksum status from the receipt. Only this outcome permits the phrase “release complete.”

### FAILED

Report every surface status and safe error code. Preserve the tag by default and do not repair inside the publish phase. A terminal, demonstrably unpublished failure may enter the explicitly authorized repair and tag-replacement path above; a partial publication may not.

### UNRESOLVED

Report every required non-registry surface lacking proof, the retained tag/SHA/run-ID/run-attempt identity, and whether the cause is propagation, retryable HTTP/network state, or deadline. A later checker rerun may resume proof without changing the tag.
