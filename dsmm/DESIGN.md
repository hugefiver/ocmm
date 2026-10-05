# Deepwork native client design system

## 0. Research Log

This is an extension of the existing DSH Settings interface, not a new application or a redesign. The selected reference is the native DSH 0.2.0-rc.2 system; no unrelated brand, font, styling framework or animation dependency is needed. Historical design research is unavailable and is not reconstructed here.

Read-only extraction used the installed DSH package's `dsh-client-ui-theme`, `dsh-client-ui-primitives`, `dsh-client-ui-settings-general`, `dsh-client-ui-settings-models` and `dsh-client-ui-settings-plugins`. Relevant authored sources are `ui-theme/src/styles/{base,design-platform,focus}.css`, `ui-primitives/src/{Button,Input}.module.css`, and the Settings/Models section CSS embedded in their published client bundles. The values below describe the shipped default theme; installed theme overrides remain authoritative. No vendor code, theme or user configuration is changed.

This document records the prospective Deepwork 0.1.8 UI design contract. The interaction matrix and browser checks below are requirements, not claims of final 0.1.8 acceptance. Historical completed proofs remain unchanged; 0.1.7 is npm published and Desktop installed but its failed terminal verification is not a completed GitHub Release. Native browser authentication remains intact; an isolated component/in-process-carrier test does not establish authenticated Desktop/Web end-to-end behavior.

## 1. Atmosphere & Identity

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
| Structured route fields | Labeled native provider/model/exact-effort selects plus explicit manual inputs; keyboard and pointer parity | Disabled while profile mutation is pending; catalog loading never replaces configured values | Advisory catalog failures and unlisted values are explained; explicit model changes clear stale effort, refresh does not |
| Ordered fallback rows | Numbered route groups and native add/remove/move buttons with route-specific names | Boundary moves disabled; preserve focus on the surviving row/action | Empty means an explicit empty chain; inherit is a separate choice; status explains draft-only changes |
| Role/profile strategy and retry fields | Explicit startup-lock/rate-limit-fallback/inherit selects and native bounded numeric inputs | Native disabled controls during mutations; inherited effective values remain readable | Invalid raw policy disables structured mutation without normalizing content; explicit inherit removes only the changed override |
| Advanced JSONC disclosure | Native keyboard-operable details/summary; same underlying draft as structured fields | Readable invalid draft retained during errors | Invalid JSONC refuses structured edits; unchanged comments/unrelated fields remain byte-preserved |
| Current-session profile scope | Distinct named selector and apply/baseline actions; public native current-session adapter only | Sessionless/unavailable/busy state explains refusal; stale view requests never publish to a new session | Accepted CAS/epoch snapshot proves success; global-default apply remains a separate action |
| Compact Conversation profile menu | One icon-only native Button and portaled Menu, one profile list and one `@use-model` action; native keyboard selection, Escape/outside dismissal and focus return | Keep the trigger available to inspect reasons; disable mutations while committing, not idle, unavailable, sessionless or a Settings draft needs explicit save/discard | Short sanitized errors inside the menu; successes only in a visually hidden live region, without visible success prose |
| Deepwork mode | Native menu toggle for other presets; explicit same-default intent persists | Sessionless/busy/unavailable mutation disabled; standing DW preset locked enabled with a label | Official minimal default off unless saved explicit `deepwork/mode`; retain mode across profile changes and reopen |

Current-session scope text displays the exact live admitted profile/revision separately from the future global default. Session-selection CAS continues to use only the sidecar selection state; an absent sidecar is not relabeled as baseline or as a newly changed global default. Older responses without the optional admitted identity use explicit captured-default wording.

The Conversation header is a compact session switch, not another Settings surface: one icon-only native 28px Button with the host's 16px branch SVG and an accessible **Current-session profile** name opens the native Menu. There is no visible standalone label, selected-profile text, status, tooltip copy or instruction outside the menu. Use one profile list, one **Use profile model** action, the Deepwork toggle/locked label and refresh; omit verbose normal-menu descriptions and the duplicate profile-model list. A visually hidden live region announces successful outcomes; no persistent visible success text is rendered. Short sanitized errors and necessary disabled/locked reasons remain visible inside the menu. Native Menu owns keyboard navigation, Escape/outside dismissal, focus return and body-portal placement, so native clipping ancestors cannot crop the popup. Choosing a saved profile or explicit baseline immediately invokes the existing session-choice/apply actions; accepted backend CAS/maintenance state remains authoritative. Refusal keeps the prior admission. Never silently discard a Settings draft, create a session or change a global default to operate this control.

Menu refusal diagnostics show only a finite known reason code and an optional closed canonical configuration-field grammar, with bounded length. Never echo raw Host/provider messages, arbitrary wire fields, paths, identifiers or credential values. Unknown transport/domain errors map to safe generic codes. Explain activation, maintenance and conflict distinctly and offer refresh plus an idle retry hint; refresh is read-only, not an automatic queued apply. These details remain inside the menu and its visually hidden accessible announcement. A native idle snapshot is not a reservation: another activity may acquire maintenance before CAS, in which case the previous profile remains applied and retry must remain explicit.

One root-scoped `conversation.header.leading` contribution is used for active, retained blank and genuinely sessionless welcome states. Unlike the old utilities seat, the shipped native header renders this slot even when `hideChrome` is true. Its numeric priority is `Number.MAX_SAFE_INTEGER`: native SlotCore chooses the lowest numeric priority, so ordinary existing native/plugin navigation wins. DSMM does not replace the header or another leading owner; a host whose plugin owns this single slot may not display the profile icon, a documented compatibility boundary. The root menu follows the existing public current-session adapter/controller identity, and retained action callbacks reject a changed identity before dispatch. With no real current identity it remains inspectable but all profile mutations are disabled. Binding a real native session enables the same menu without another seat or automatic session creation.

The single profile list switches the profile while preserving the chosen native main model, with zero native selection calls. Exactly one `@use-model` **Use profile model** action requests the current admitted immutable profile's configured ordinary-root primary through native `session.selectModel`. It does not reapply a subsequently saved draft revision, increment the profile epoch or write a profile sidecar. There is no local model echo, shadow selector or DOM/native-store patch: the native model-selection projection/picker is authoritative. Missing model configuration, withdrawn selector or native selection failure retains the admitted profile and reports a short sanitized error. This explicit action has the same native semantics as choosing the Models tab, including native default-model persistence in the background; normal switching, profile saving and route-field editing never invoke it.

For other native presets, the **Deepwork** toggle shows saved explicit `deepwork/mode` intent, otherwise official minimal mode defaults off. A same-default choice still persists intent. It remains authoritative across profile changes and reopen rather than inheriting a newly applied profile's `defaultActive`. Standing DW presets are locked enabled and identified as such; do not offer a contradictory off action. Native idle/ownership/session identity and persistence compatibility remain mutation gates.

The owned trigger uses only the native compact 28px control geometry and 16px icon. Portaled menu rows and essential headings wrap using the existing 14px/22px body scale and primary/secondary text tokens. Real browser checks must include the trigger focus ring and open menu's right edges against the viewport and native clipping ancestors, not only document scroll width.

The model action observes public current-session sources read-only: the `projection("modelSelection")` face, the borrowed live binding's `eventSource` model/selection sequence watermark, and the resident native ModelDirectory.store interaction phase. The native projection alone suppresses an identical pending selection, so it is not same-value intent proof. Read only event type/sequence from the already-materialized current-session window; do not retain, load history or export events. Capture these source identities/generations before reading the admitted profile model, then refuse the native model call if a newer durable model/selection event or local native selecting phase appears before dispatch. The local directory phase also protects a manual selection awaiting its native acknowledgment. Missing/withdrawn required observation fails closed. A newer native choice is kept with short sanitized feedback while the admitted profile remains applied. After native model dispatch, the native API retains its own last-writer semantics; DSMM never reissues or echoes a model to defeat a later Models-tab choice, and does not claim to fence remote mutations not yet observed before dispatch.

Use `Button`, `Input` and, if needed, existing SVG icons from `@deepseek-ai/dsh-client-ui-primitives`. Their native exports contain no `Select` or `Textarea`; do not invent imports. Use semantic HTML for those controls, adapting the existing Models input/select geometry and host tokens. Keep the browser's native select affordance rather than copying a hardcoded-color SVG arrow.

`Button` supports normal button attributes and `variant="primary" | "ghost" | "outline" | "toolbar"`, `size="md" | "sm"`, and `icon`. `Input` forwards normal input attributes; its `className` decorates the wrapper. Add a DSMM-owned wrapper focus ring if required; the native inner input disables its own outline. Do not patch vendor primitives.

Native `SettingsFormModel`/`configForms` manage the host plugin-config document, not independent DSMM profile files. Reuse visual primitives, not that persistence model. A `settings.section` contribution has its own stable id/label/locale and a native injected `getSnapshot`/`subscribe` source. Register it additively; do not replace the native settings slot owner.

### Implemented Reusable Patterns

The host primitives above are dependencies, not package-owned implementations. Package-owned patterns below are implemented and reused at least twice.

The structured editor uses a reusable route field group for primary and fallback candidates and a reusable runtime-policy group for profile defaults and role overrides. Both use the host primitives and the geometry above, with borders-only fieldsets and wrapping action rows. Their selectors are advisory, and exact manual values remain editable without a catalog listing.

## 6. Motion & Interaction

The host provides `--ds-transition-duration-fast` (100ms), `--ds-transition-duration` (200ms), `--ds-transition-duration-slow` (300ms), and `--ds-ease-in-out` (`cubic-bezier(.4, 0, .2, 1)`). This settings section needs no entrance animation or new motion library. Feedback is immediate and never waits for animation; if a transition is needed, use the host timing and opacity/transform only. Under `prefers-reduced-motion: reduce`, remove nonessential transitions and retain the same information and focus behavior.

Native focus expression: `var(--dsw-focus-ring-width)` (2px) solid `var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary))`, with a 2px control-owned offset. Never remove keyboard focus feedback. Preserve the host's pointer/keyboard modality handling. Native Input's focus-within border alone is not sufficient evidence of a 2px keyboard ring.

Changing an editor's profile is distinct from activating that profile. Do not silently discard an unsaved draft or change the active profile while browsing. Block or explicitly confirm a draft-discarding action. Save success follows the accepted backend snapshot, not a click or locally valid JSON. Disable competing commits during pending work, keep error drafts, and ignore stale responses after another selection or disposal. External conflicts need a clear reload/retry path without overwriting the user's draft. Focus stays on the initiating control after ordinary saves; after refused validation, identify and focus the relevant field without stealing focus on background refreshes.

## 7. Depth & Surface

DSMM content uses borders-only grouping and the host's existing neutral surfaces. Native layer-1/layer-2/module surfaces, md control radii and subtle divider tokens supply the hierarchy; no new shadows, floating cards, nested modal or backdrop. The host Settings shell already owns `--dsw-elevation-prominent` and its panel radius. DSMM must not copy or override that shell. Strengthening an editable control boundary with an existing text token for accessibility is scoped to DSMM controls, not a vendor/theme redesign.

## 8. Accessibility Constraints & Accepted Debt

Target WCAG 2.2 AA for the DSMM-owned section and its tested states. All text/control/status names must remain understandable without color, hover or a pointing device.

- Text contrast: at least 4.5:1 for ordinary text, or 3:1 only when the actual large-text criterion applies. Control/focus indicators needed for identification: at least 3:1 against adjacent colors. Check rendered light, dark and reduced-motion states; theme tokens alone are not a passing audit.
- Observed default-theme risks: tertiary light text on white is 3.71:1; error light text on white is approximately 4.4976:1; error dark text on layer-2 is 4.24:1; success green on white is 2.28:1. Therefore required hints/status/error messages use primary/secondary text. Colored accents are supplementary, never sole labels. Use an existing high-contrast token such as secondary text for DSMM editable boundaries if the subtle native border fails identification contrast. Do not silently accept these risks because they also occur in the host.
- Semantic `<label>`, `<select>`, `<input>`, `<textarea>` and `<button>` first. Use stable ids, associate hints/errors with `aria-describedby`, mark invalid fields with `aria-invalid`, and announce save/selection outcomes with a polite status region. An urgent user-triggered refusal may use an alert; avoid announcing every keystroke or duplicating messages.
- Every action has a keyboard path and visible focus; no keyboard trap, unbound custom shortcut or surprise focus loss. Native form targets are at least 24px in their applicable dimension. Test Tab/Shift+Tab, select arrow keys, Space/Enter, and any implemented confirmation's dismissal/focus return.
- Busy, unavailable and disabled states must explain why an action cannot proceed. Preserve readable error details and unsaved content; never expose credentials, token contents or unredacted provider errors in a profile editor/status message.
- Test normal and reduced motion, 200% zoom/reflow, long names, empty/unavailable stores, pending operations, validation errors, conflicts and backend failures. Capture screenshots at 375/768/1280px and keyboard/pointer evidence in a run-owned empty browser context.
- Do not sign in, import browser state, weaken native authentication or attach to the live user application to obtain QA evidence. Report the actual authenticated-host verification boundary explicitly.

Accepted accessibility debt: none. Any future exception must record location, reason, owner, exit criteria and explicit user authorization; an unavailable verification surface is a disclosed limitation, not an implicitly accepted exception.
