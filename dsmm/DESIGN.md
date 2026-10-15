# DSMM native client design system

## 0. Native contract

This is an extension of the existing DSH Settings interface, not a new application or a redesign. The selected reference is the native DSH 0.2.0-rc.2 system; no unrelated brand, font, styling framework or animation dependency is needed. Historical design research is unavailable and is not reconstructed here.

Read-only extraction used the installed DSH package's `dsh-client-ui-theme`, `dsh-client-ui-primitives`, `dsh-client-ui-settings-general`, `dsh-client-ui-settings-models` and `dsh-client-ui-settings-plugins`. Relevant authored sources are `ui-theme/src/styles/{base,design-platform,focus}.css`, `ui-primitives/src/{Button,Input}.module.css`, and the Settings/Models section CSS embedded in their published client bundles. The values below describe the shipped default theme; installed theme overrides remain authoritative. No vendor code, theme or user configuration is changed.

DSMM-owned settings extend public native slots and preserve native authentication, navigation, model selection and service ownership. Browser verification does not prove installed Electron behavior or publication.

## 1. Atmosphere & Identity

### Native Plugins (parity stage D)

DSMM contributes to the official shared `plugins.item`, `plugins.bundle.config`
and `plugins.row.config` ledgers. The standalone DSMM card opens a sessionless
core page. Bundle and row pages use the exact public owner `view` and optional
`form`; a package key, row ID, runtime entry ID and form namespace are separate
identities. A profile editor is enabled only after the server's captured entry
and native descriptor revision match the supplied form. Unmatched/absent forms
are explained as unavailable, never replaced with a guessed namespace.

The page has two independently saved layers: **DSMM Global config** (one trusted
home's central base, shared by its DSH profiles) and **Current DSH profile
overrides** (only the selected native entry). Deepwork master is global-only;
profile controls cannot lift this ceiling. Named **Deepwork Profiles** remains
an independent JSONC runtime-resource editor with its existing model catalog and
explicit Use profile model action. No control changes the ordinary native model.

Each layer uses sparse explicit values: unset means defaults globally, inheritance
in the profile. Explicit same-default pins are visible. Native composition/base
pins are identified separately; clearing a user override never promises to clear
an upper host layer. Structured boolean/enum/number/string controls cover ordinary
features, including roles and skills. Bounded, schema-described advanced groups
cover nested routes and retry arrays without arbitrary paths,
unknown modules or executable schema callbacks. No merged/default-filled object
is ever saved. A read-only field state inspector separates desired/source,
startup capture, next-root constraints and an exact current-session admission;
sessionless is unknown, not active.

LSP controls are hidden in DSMM's settings UI for this version. The implementation,
interfaces and original configuration remain, but automatic MCP mounting stays off
even with `lsp.enabled:true`. A save or independent restart doesn't enable it.
DSH's own LSP and independently configured MCP are unaffected; the retained manual
patch isn't a supported DSMM activation entry. See [LSP boundary](docs/lsp.md).

Read-only desired/startup/admission projections redact executable configuration,
private directories and continuation prompt text on the Host, before transport.
LSP environment names are anonymous counted entries; source/capture metadata is
aggregated at `lsp.env` (mixed is explicit), never credential-bearing key paths.
Only the authenticated editor's sparse input/provenance retains editable raw
values. The inspector takes a stable sorted union of the safe layers and their
source/capture paths: missing fields are absent, not defaults. A known native
session keeps its ID/epoch/scope visible even when its projection is unavailable;
successful named Apply/Baseline returns the already-committed safe admission.

The two save bars are local to their sections. Refresh preserves dirty edits and
does not silently rebase revision conflicts; discard/reload is a separate explicit
action. A conflict or disconnected/unavailable scope keeps the draft. Identity
change/disposal fences retained actions. Save announces only the accepted layer;
it never restarts, cancels, reconciles, applies a named profile or mounts LSP.
Restart-required text explains an independent native restart and its session
cancellation semantics. Host bundle enabled/loaded is unknown unless observed;
Deepwork desired/startup/admitted are not host installation status.

The existing native typography, colors, spacing, radii, focus, motion and
borders-only tokens below are authoritative. One column avoids a cramped native
panel at 375px; wrapping source rows keep long EN/ZH labels readable at 768px;
the 760px cap preserves the native reading measure at 1280px. No new font/brand,
shadow, animation, dependencies or React audit packages are introduced.

Stage-D interaction matrix: controls have native default/hover/pressed and visible
focus states, local busy/disabled explanations, labeled invalid fields, retained
error drafts and polite save announcements. Disclosures use native keyboard
behavior; focus stays on save or moves to an invalid advanced group after a
user-triggered validation refusal. Reduced motion preserves all information.
Actual native Plugins browser evidence (375/768/1280, light/dark, keyboard,
refusals and saves) is required; Web does not prove installed official Electron.

A quiet, practical part of DSH Settings: system typography, compact controls, a readable configuration editor, clear selection and explicit save outcomes. Its signature is continuity with the host. The section is displayed as **Deepwork Profiles** / **Deepwork 配置档**, without replacing navigation, opening another application shell or relabeling native agent presets as configuration profiles. Native role display names use `DW …`; technical section, RPC, package and role IDs retain their DSMM identity. The naming/resource contract introduced in 0.1.3 changes no layout, theme, animation, component or dependency contract below.

## 2. Color

Use these host CSS variables in components. The light/dark values are extracted defaults for reference only; do not hardcode them or change the host's theme attribute. Dark mode is owned by `body[data-ds-dark-theme]` and the native theme service.

| Role | Native token | Light default | Dark default |
| --- | --- | --- | --- |
| Field surface | `--dsw-alias-bg-layer-1` | `#ffffff` | `#232324` |
| Settings surface | `--dsw-alias-bg-layer-2` | `#ffffff` | `#2c2c2e` |
| Editor/group surface | `--dsw-alias-bg-module-platform` | `#f5f6f7` | `#353638` |
| Main text | `--dsw-alias-label-primary` | `#0f1115` | `#f9fafb` |
| Secondary text | `--dsw-alias-label-secondary` | `#61666b` | `#cfd3d6` |
| Native muted text | `--dsw-alias-label-tertiary` | `#81858c` | `#adb2b8` |
| Native placeholder | `--dsw-alias-label-dimmed` | `#e1e5ee` | `#43454a` |
| Filled-button text | `--dsw-alias-label-primary-foreground` | `#ffffff` | `#0f1115` |
| Divider | `--dsw-alias-border-l2` | `#0000001a` | `#ffffff1f` |
| Outline | `--dsw-alias-border-l3` | `#0000001f` | `#ffffff29` |
| Native field/card stroke | `--dsw-alias-border-l4` | `#00000029` | `#ffffff33` |
| Business/focus accent | `--dsw-alias-state-business-primary` | `#4176e6` | `#7aaaff` |
| Error accent | `--dsw-alias-state-error-primary` | `#ec1313` | `#f25a5a` |
| Success accent | `--dsw-alias-state-success-primary` | `#22c55e` | `#22c55e` |
| Warning accent | `--dsw-alias-state-warn-primary` | `#f59e0b` | `#f59e0b` |
| Hover surface | `--dsw-alias-interactive-bg-hover` | `#2631480f` | `#ffffff14` |
| Pressed surface | `--dsw-alias-interactive-bg-active` | `#2631481a` | `#ffffff24` |
| Primary action fill | `--dsw-alias-button-primary-fill` | `#0f1115` | `#f9fafb` |
| Primary action hover | `--dsw-alias-button-primary-hover` | `#43454a` | `#ebeef2` |

Host aliases `--dsw-alias-settings-card-fill` and `--dsw-alias-settings-card-stroke` resolve to layer-2 and border-l4. Use them only if an actual grouped surface is needed. No decorative gradients, new accent palette or colored status badges.

Required instructions, hints and status/error text use primary or secondary text, not a low-contrast accent. Native tertiary text, placeholder colors and thin strokes are not proof of accessible contrast; Section 8 governs their use. An error may have an error-colored accent while its message remains primary text. Color never carries state alone.

## 3. Typography

Inherit `var(--dsw-font-family)`:

`-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif`.

Configuration content and exact identifiers may use `var(--ds-font-family-code)`:

`"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei"`.

Do not import fonts or use the host's Montserrat brand face for settings text.

| Use | Size | Weight | Line height | Source |
| --- | --- | --- | --- | --- |
| Section heading | 18px | 600 | Inherit; native section does not declare another value | Plugins section |
| Group/profile heading | 14px | 500 | 22px | Models editor title |
| Body, controls, required hints | 14px | 400 | 22px | Native Button/Input and Models controls |
| Configuration editor | 14px | 400 | 22px | Body scale with native code font |
| Optional nonessential metadata | 12px | 400 | 18px | Native compact controls; still subject to contrast checks |

Native settings also contain 13px labels and 12px hints. DSMM's own essential labels, instructions and errors use the 14px body scale. Use sentence case, readable Chinese/English copy, no all-caps decoration and no emoji icons.

## 4. Spacing & Layout

At narrow widths and 200% zoom, labels, legends and disclosure summaries wrap within their own available width (`overflow-wrap: anywhere`, `min-width: 0`, `max-width: 100%`); do not clip content or hide document overflow. Retry controls use readable English/Chinese field descriptions with units instead of raw camelCase backend keys. IDs and JSONC policy paths remain exact technical identifiers.

The native interface uses a 4px rhythm plus explicit compact-control exceptions. These named values are the allowed geometry references for DSMM styles, not newly exported host tokens:

| Name | Value | Use |
| --- | --- | --- |
| Tight gap | 4px | Icon/action adjacency |
| Field gap | 6px | Existing native label-to-control spacing; documented host exception |
| Small gap | 8px | Action group and related labels |
| Control inset | 10px | Native Models select/input horizontal padding; documented host exception |
| Section gap / field inset | 12px | Vertical rhythm, editable field padding |
| Group padding | 16px | Optional grouped editor surface |
| Host content inset | 24px | Owned by Settings shell; do not add a second shell inset |
| Field height | 32px | Native Input and Models select |
| Default action height | 36px | Native Button `size="md"` |
| Compact action height | 28px | Native Button `size="sm"`; not the default form action |
| Section maximum width | 760px | Native Plugins section; DSMM remains `width: 100%`, `min-width: 0` |

Native radii: `--dsw-radius-xs` 4px, `--dsw-radius-sm` 8px, `--dsw-radius-md` 12px, `--dsw-radius-lg` 16px, `--dsw-radius-xl` 20px and `--dsw-radius-panel` 28px. Controls use md; DSMM does not create another panel.

The host owns its 800px Settings panel, 188px navigation and scroll container. DSMM owns only its section: one column, wrapping action rows, full-width fields and contained editor overflow. A profile selector follows the native Models select's 240px maximum and also obeys `max-width: 100%`. Long names and diagnostics wrap; code may scroll inside the editor but must not create document-level horizontal overflow. A textarea uses semantic rows and vertical resizing rather than a viewport-sized editor.

No new responsive framework or fixed sidebar. Verify the section at 375, 768 and 1280px, including the narrower space the host navigation leaves. Do not claim the host shell's independent responsive behavior was changed or verified by a standalone section test.

## 5. Components

### Planned Showcase Primitives

This matrix is the pre-implementation checklist for the new section, not documentation of completed reusable components. Mount the same production component in an isolated native-client test surface to exercise these states before delivery.

| Primitive | Default / hover / focus / pressed | Disabled / loading | Empty / success / error |
| --- | --- | --- | --- |
| Profile select | Named native `<select>`; keyboard selection; host-token focus ring | Disabled during selection commit; stable selected value | Explain no profiles; announce committed selection; refusal retains old selection |
| Profile name | Native `Input` with visible associated label; focus-within ring | Native disabled state only when mutation is pending | Required/invalid name message associated with the field; preserve draft |
| Configuration editor | Labeled native `<textarea>`; code font; visible focus ring | Prevent conflicting edits while save is pending; readable content | Explain expected overlay shape; preserve invalid/conflicting draft with actionable error |
| Save/create/select/reset actions | Native `Button`; clear action label; keyboard activation; visible ring | Native disabled plus busy label; no width-changing replacement | Announce actual commit; error does not masquerade as success |
| Status and diagnostics | Persistent semantic text in a stable position | Loading text and `aria-busy` where applicable | Distinguish unavailable service, empty store, conflict, validation and I/O refusal; offer relevant recovery |
| Structured route fields | Separate labeled editable provider/model/exact-effort comboboxes, each one native Input with a listbox and compact dropdown affordance; keyboard and pointer parity | Disabled while profile mutation is pending; catalog loading never replaces configured values | Suggestions retain actual IDs; arbitrary typed values remain exact. Explicit model changes clear stale effort, refresh does not |
| Ordered fallback rows | Numbered route groups and native add/remove/move buttons with route-specific names | Boundary moves disabled; preserve focus on the surviving row/action | Empty means an explicit empty chain; inherit is a separate choice; status explains draft-only changes |
| Role/profile strategy and retry fields | Explicit startup-lock/rate-limit-fallback/inherit selects and native bounded numeric inputs | Native disabled controls during mutations; inherited effective values remain readable | Invalid raw policy disables structured mutation without normalizing content; explicit inherit removes only the changed override |
| Advanced JSONC disclosure | Native keyboard-operable details/summary; same underlying draft as structured fields | Readable invalid draft retained during errors | Invalid JSONC refuses structured edits; unchanged comments/unrelated fields remain byte-preserved |
| Current-session profile scope | Distinct named selector and apply/baseline actions; public native current-session adapter only | Sessionless/unavailable/busy state explains refusal; stale view requests never publish to a new session | Accepted CAS/epoch snapshot proves success; global-default apply remains a separate action |
| Compact Conversation profile menu | One icon-only native Button and portaled Menu, one profile list and one `@use-model` action; native keyboard selection, Escape/outside dismissal and focus return | Keep the trigger available to inspect reasons; disable mutations while committing, not idle, unavailable, sessionless or a Settings draft needs explicit save/discard | Short sanitized errors inside the menu; successes only in a visually hidden live region, without visible success prose |
| Deepwork mode | Native menu toggle for other presets; explicit same-default intent persists | Sessionless/busy/unavailable mutation disabled; standing DW persona active only inside its captured module ceiling | Official minimal default off unless saved explicit `deepwork/mode`; module-off cannot be bypassed; retain mode across profile changes and reopen |

DW presets default on but are not locked; explicit off retains persona, read-only and Git/host permissions. A captured module-off ceiling remains unavailable, not a profile-editable bypass.

Current-session scope text displays the exact live admitted profile/revision separately from the future global default. Session-selection CAS continues to use only the sidecar selection state; an absent sidecar is not relabeled as baseline or as a newly changed global default. Older responses without the optional admitted identity use explicit captured-default wording.

The Conversation header is a compact session switch, not another Settings surface: one icon-only native 28px Button with the host's 16px branch SVG and an accessible **Current-session profile** name opens the native Menu. There is no visible standalone label, selected-profile text, status, tooltip copy or instruction outside the menu. Use one profile list, one **Use profile model** action, the Deepwork toggle/locked label and refresh; omit verbose normal-menu descriptions and the duplicate profile-model list. A visually hidden live region announces successful outcomes; no persistent visible success text is rendered. Short sanitized errors and necessary disabled/locked reasons remain visible inside the menu. Native Menu owns keyboard navigation, Escape/outside dismissal, focus return and body-portal placement, so native clipping ancestors cannot crop the popup. Choosing a saved profile or explicit baseline immediately invokes the existing session-choice/apply actions; accepted backend CAS/maintenance state remains authoritative. Refusal keeps the prior admission. Never silently discard a Settings draft, create a session or change a global default to operate this control.

Menu refusal diagnostics show only a finite known reason code and an optional closed canonical configuration-field grammar, with bounded length. Never echo raw Host/provider messages, arbitrary wire fields, paths, identifiers or credential values. Unknown transport/domain errors map to safe generic codes. Explain activation, maintenance and conflict distinctly and offer refresh plus an idle retry hint; refresh is read-only, not an automatic queued apply. These details remain inside the menu and its visually hidden accessible announcement. A native idle snapshot is not a reservation: another activity may acquire maintenance before CAS, in which case the previous profile remains applied and retry must remain explicit.

One root-scoped `conversation.header.leading` contribution is used for active, retained blank and genuinely sessionless welcome states. Unlike the old utilities seat, the shipped native header renders this slot even when `hideChrome` is true. Its numeric priority is `Number.MAX_SAFE_INTEGER`: native SlotCore chooses the lowest numeric priority, so ordinary existing native/plugin navigation wins. DSMM does not replace the header or another leading owner; a host whose plugin owns this single slot may not display the profile icon, a documented compatibility boundary. The root menu follows the existing public current-session adapter/controller identity, and retained action callbacks reject a changed identity before dispatch. With no real current identity it remains inspectable but all profile mutations are disabled. Binding a real native session enables the same menu without another seat or automatic session creation.

The single profile list switches the profile while preserving the chosen native main model, with zero native selection calls. Exactly one `@use-model` **Use profile model** action requests the current admitted immutable profile's configured ordinary-root primary through native `session.selectModel`. It does not reapply a subsequently saved draft revision, increment the profile epoch or write a profile sidecar. There is no local model echo, shadow selector or DOM/native-store patch: the native model-selection projection/picker is authoritative. Missing model configuration, withdrawn selector or native selection failure retains the admitted profile and reports a short sanitized error. This explicit action has the same native semantics as choosing the Models tab, including native default-model persistence in the background; normal switching, profile saving and route-field editing never invoke it.

For other native presets, the **Deepwork** toggle shows saved explicit `deepwork/mode` intent, otherwise official minimal mode defaults off. A same-default choice still persists intent. It remains authoritative across profile changes and reopen rather than inheriting a newly applied profile's `defaultActive`. Standing DW presets select their persona only within the captured module ceiling; an off admission remains off and cannot be lifted by a mode control. Native idle/ownership/session identity and persistence compatibility remain mutation gates. Desired-off saves never remove already captured read-only or Git protection.

The owned trigger uses only the native compact 28px control geometry and 16px icon. Portaled menu rows and essential headings wrap using the existing 14px/22px body scale and primary/secondary text tokens. Real browser checks must include the trigger focus ring and open menu's right edges against the viewport and native clipping ancestors, not only document scroll width.

The model action observes public current-session sources read-only: the `projection("modelSelection")` face, the borrowed live binding's `eventSource` model/selection sequence watermark, and the resident native ModelDirectory.store interaction phase. The native projection alone suppresses an identical pending selection, so it is not same-value intent proof. Read only event type/sequence from the already-materialized current-session window; do not retain, load history or export events. Capture these source identities/generations before reading the admitted profile model, then refuse the native model call if a newer durable model/selection event or local native selecting phase appears before dispatch. The local directory phase also protects a manual selection awaiting its native acknowledgment. Missing/withdrawn required observation fails closed. A newer native choice is kept with short sanitized feedback while the admitted profile remains applied. After native model dispatch, the native API retains its own last-writer semantics; DSMM never reissues or echoes a model to defeat a later Models-tab choice, and does not claim to fence remote mutations not yet observed before dispatch.

Use `Button`, `Input` and, if needed, existing SVG icons from `@deepseek-ai/dsh-client-ui-primitives`. Their native exports contain no `Select` or `Textarea`; do not invent imports. Use semantic HTML for those controls, adapting the existing Models input/select geometry and host tokens. Keep the browser's native select affordance rather than copying a hardcoded-color SVG arrow.

`Button` supports normal button attributes and `variant="primary" | "ghost" | "outline" | "toolbar"`, `size="md" | "sm"`, and `icon`. `Input` forwards normal input attributes; its `className` decorates the wrapper. Add a DSMM-owned wrapper focus ring if required; the native inner input disables its own outline. Do not patch vendor primitives.

Native `SettingsFormModel`/`configForms` manage the host plugin-config document, not independent DSMM profile files. Reuse visual primitives, not that persistence model. A `settings.section` contribution has its own stable id/label/locale and a native injected `getSnapshot`/`subscribe` source. Register it additively; do not replace the native settings slot owner.

### Implemented Reusable Patterns

### Profiles: four independent zones

Browse lists saved labels, IDs, immutable revisions and persistent warnings/errors. Opening changes only the editor; dirty changes require explicit discard confirmation with Escape cancellation and focus return. Edit shows draft and saved revision separately, with Save/Reload at the top. Structured routes, invocation levels, business locale, optional roles and topology share the original JSONC draft. Structured edits change only their addressed path; comments and unrelated bytes remain untouched. Blank labels retain their original bytes and use the ID as display fallback.

Future default shows the exact `selectedId`, `appliedRevision` and `selectionRevision` pin. Only a saved revision can be selected; Save neither selects a future default nor applies to the current session. Reset affects only future sessions. Current session displays exact `admittedSelection` and `admissionEpoch`; the sidecar selection remains CAS authority, not inferred live admission. Missing admission identity is unknown/captured, never inferred from a newer future default. Apply/Baseline retain exact-root idle/CAS authority and leave the native root model untouched; Use profile model remains an explicit separate native action.

Advanced JSONC is initially collapsed. A user-triggered validation refusal opens it and focuses/selects the Host's UTF-16 location; background refresh never steals focus. Persistent warning rows expose code, field and a nonblocking marker outside any disclosure; optional explanations may collapse. Draft, saved, future-pin and current-admission warnings remain separate. Unknown fields and exceptions never echo raw diagnostic values. Error code, safe field and location remain actionable; all errors other than blank-label warnings still block their operation.

Invocation `normal` is a read-only default-route alias; only low/high/max overrides are editable, and orchestrator has no levels. Each override is inherit, exact effort-only, or a complete provider/model route; changing mode replaces that override, and an explicit model change clears only its stale effort. Catalog refresh/unavailability preserves manual values. Business locale is inherited when omitted and does not change the en/zh interface locale. Named profiles expose only subagent topology, never deployment-only permissions/background/depth. Role required/ceiling state comes from server metadata, with reasons adjacent to controls; absent metadata stays unknown and cannot justify lifting a ceiling. Current-session startup-binding readiness uses only the server admission DTO, never desired settings as actual state.

Each zone is a one-column, borders-only semantic section using the existing spacing and type tokens. No session means an explicit unavailable current zone. Child lists, queue/steer and same-run handoff belong in the Conversation runtime surface only after a real child DTO/RPC exists; no pending/fake child controls are part of Profiles.

### Conversation child controls

An additive `conversation.view` entry with id `dsmm-children` supplies the native Deepwork children tab; the host owns tab navigation and Session scope. The view uses the existing one-column 760px measure, native typography, wrapping IDs, borders-only fieldsets, Button and semantic forms. It does not replace Profiles or the native composer/attachment surface.

The child controller consumes the separate `@dsmm/dsmm-children` remote contribution and binds the exact public native Session binding and connection generation. Session/owner/connection replacement and observed parent admission changes fence callbacks and late responses. Missing scope/service is unavailable, not an empty successful catalog. Describe and descendants are independently diagnosable; mismatched epochs are not combined. Status is explicitly last observed and refreshed read-only, without a second scheduler or fabricated activity.

Run rows display only published invocation identity, role, level, route source, mode and run/child/job IDs. A starting row has no fabricated invocation or action ID. Same-run background transition uses its observed toolCallId/runId and captured parent epoch; a pending click is single-flight, and accepted job receipts are retained without claiming the child completed. Compatibility `route` and `routeSource` are labelled as invocation projections, not route comparison or verified live headers.

Route comparison uses only the shared `DsmmRoleRouteComparison`: Initial route is separately known from `invocation-capture` or unknown with `missing-invocation-capture`; Latest own native request route is separately known from `own-native-request-header` or unknown with its reported `no-own-request-header`, `invalid-own-request-header` or `not-observed` reason. The two routes and their effort values never substitute for each other. Run details use `invocation.routeComparison`; the child row presents its top-level `routeComparison` before invocation details, including legacy rows with no invocation. Missing comparison is explicitly unobserved, not repaired from compatibility route, root/profile settings or route-lock lookup. A legacy native execution observation is not labelled as an initial capture; missing invocation never creates a role or invocation level. These semantic definition lists remain one-column, use the existing metadata tokens and wrap long provider/model/source text.

Direct continuable children have labelled Queue/Steer message forms, native text/image ContentBlocks and interrupt actions only when the server capabilities and row controls both permit them. Picked image bytes are encoded as image bodies, never fabricated durable attachment references or Agent senders. Image capability refusal leaves text and picked drafts available for correction; no automatic upload retry or message resend occurs. Accepted messages and interrupt acknowledgements do not alter observed execution/activity or completion. Transport loss retains the draft with an unknown-outcome guard; the user must check the native child conversation and explicitly allow a new message before sending again.

Descendant rows remain inspection-only even when the caller can see the subtree; diagnostics for corrupt/unsupported/unavailable branches remain visible. Captured and legacy-conservative evidence, original/parent epochs, proven fields and all limitations are persistent semantic text, not hidden behind a badge or inferred from desired settings. Disabled controls expose finite local bilingual explanations and a Refresh recovery path. Native focus rings and form keyboard semantics remain; no motion, shadow, framework, font or dependency is added. Browser/native QA remains distinct from controller/component tests and compile/bundle evidence.

The host primitives above are dependencies, not package-owned implementations. Package-owned patterns below are implemented and reused at least twice.

The structured editor uses a reusable route field group for primary and fallback candidates and a reusable runtime-policy group for profile defaults and role overrides. Both use the host primitives and the geometry above, with borders-only fieldsets and wrapping action rows. Their selectors are advisory, and exact manual values remain editable without a catalog listing.

`EditableChoice` is the shared one-input combobox for provider, model and exact effort, including fallback and invocation-level routes. Native Input and a compact native Button supply the existing surface, radius, focus treatment and dropdown affordance. The borders-only listbox uses layer-1, primary text, hover/active tokens, md radius, 4px adjacency, 8px/10px option padding and a 240px maximum scroll height. Focus remains on the input; arrows move the active suggestion, Enter chooses its ID or keeps typed text, Escape/outside blur dismisses. Suggestion labels may be friendly, but choosing stores the actual ID and typing stores the exact string. Catalog refresh never normalizes a value. Each control updates only its existing JSONC path, never reconstructs a route or changes model-parameter placement. Effort-only levels have no guessed catalog; the configured value remains a suggestion and arbitrary values remain editable.

The structured draft projection retains opaque route and level parameters without interpreting them. Known-field edits and fallback moves preserve these parameters and original JSONC bytes; malformed known fields, duplicate/unsafe keys and excessive nesting still refuse structured mutation. The Host remains authoritative for parameter support, validation and Apply. Closed host enums, role IDs, permissions and actions remain fixed selectors; this pattern does not make them arbitrary string inputs.

Field dependencies remain explicit: choosing another catalog provider resets that route's model and exact effort; typing a provider keeps the manual model and clears only its stale exact effort. Model changes clear that route's exact effort. Choosing an unchanged ID does not rewrite the draft; navigation, catalog refresh and unrelated instances never reset values.

## 6. Motion & Interaction

The host provides `--ds-transition-duration-fast` (100ms), `--ds-transition-duration` (200ms), `--ds-transition-duration-slow` (300ms), and `--ds-ease-in-out` (`cubic-bezier(.4, 0, .2, 1)`). This settings section needs no entrance animation or new motion library. Feedback is immediate and never waits for animation; if a transition is needed, use the host timing and opacity/transform only. Under `prefers-reduced-motion: reduce`, remove nonessential transitions and retain the same information and focus behavior.

Native focus expression: `var(--dsw-focus-ring-width)` (2px) solid `var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))`, with a 2px control-owned offset. Never remove keyboard focus feedback. Preserve the host's pointer/keyboard modality handling. Native Input's focus-within border alone is not sufficient evidence of a 2px keyboard ring.

Changing an editor's profile is distinct from activating that profile. Do not silently discard an unsaved draft or change the active profile while browsing. Block or explicitly confirm a draft-discarding action. Save success follows the accepted backend snapshot, not a click or locally valid JSON. Disable competing commits during pending work, keep error drafts, and ignore stale responses after another selection or disposal. External conflicts need a clear reload/retry path without overwriting the user's draft. Focus stays on the initiating control after ordinary saves; after refused validation, identify and focus the relevant field without stealing focus on background refreshes.

## 7. Depth & Surface

DSMM content uses borders-only grouping and the host's existing neutral surfaces. Native layer-1/layer-2/module surfaces, md control radii and subtle divider tokens supply the hierarchy; no new shadows, floating cards, nested modal or backdrop. The host Settings shell already owns `--dsw-elevation-prominent` and its panel radius. DSMM must not copy or override that shell. Strengthening an editable control boundary with an existing text token for accessibility is scoped to DSMM controls, not a vendor/theme redesign.

## 8. Accessibility constraints

Target WCAG 2.2 AA for the DSMM-owned section and its tested states. All text/control/status names must remain understandable without color, hover or a pointing device.

- Text contrast: at least 4.5:1 for ordinary text, or 3:1 only when the actual large-text criterion applies. Control/focus indicators needed for identification: at least 3:1 against adjacent colors. Check rendered light, dark and reduced-motion states; theme tokens alone are not a passing audit.
- Observed default-theme risks: tertiary light text on white is 3.71:1; error light text on white is approximately 4.4976:1; error dark text on layer-2 is 4.24:1; success green on white is 2.28:1. Therefore required hints/status/error messages use primary/secondary text. Colored accents are supplementary, never sole labels. Use an existing high-contrast token such as secondary text for DSMM editable boundaries if the subtle native border fails identification contrast. Do not silently accept these risks because they also occur in the host.
- Semantic `<label>`, `<select>`, `<input>`, `<textarea>` and `<button>` first. Use stable ids, associate hints/errors with `aria-describedby`, mark invalid fields with `aria-invalid`, and announce save/selection outcomes with a polite status region. An urgent user-triggered refusal may use an alert; avoid announcing every keystroke or duplicating messages.
- Every action has a keyboard path and visible focus; no keyboard trap, unbound custom shortcut or surprise focus loss. Native form targets are at least 24px in their applicable dimension. Test Tab/Shift+Tab, select arrow keys, Space/Enter, and any implemented confirmation's dismissal/focus return.
- Busy, unavailable and disabled states must explain why an action cannot proceed. Preserve readable error details and unsaved content; never expose credentials, token contents or unredacted provider errors in a profile editor/status message.
- Test normal and reduced motion, 200% zoom/reflow, long names, empty/unavailable stores, pending operations, validation errors, conflicts and backend failures. Capture screenshots at 375/768/1280px and keyboard/pointer evidence in a run-owned empty browser context.
- Do not sign in, import browser state, weaken native authentication or attach to the live user application to obtain QA evidence. Report the actual authenticated-host verification boundary explicitly.

Accepted accessibility debt: none. Any future exception must record location, reason, owner, exit criteria and explicit user authorization; an unavailable verification surface is a disclosed limitation, not an implicitly accepted exception.
