# DSMM native client design system

## 0. Research Log

This is an extension of the existing DSH Settings interface, not a new application or a redesign. The selected reference is the native DSH 0.2.0-rc.2 system; no unrelated brand, font, styling framework or animation dependency is needed. Historical design research is unavailable and is not reconstructed here.

Read-only extraction used the installed DSH package's `dsh-client-ui-theme`, `dsh-client-ui-primitives`, `dsh-client-ui-settings-general`, `dsh-client-ui-settings-models` and `dsh-client-ui-settings-plugins`. Relevant authored sources are `ui-theme/src/styles/{base,design-platform,focus}.css`, `ui-primitives/src/{Button,Input}.module.css`, and the Settings/Models section CSS embedded in their published client bundles. The values below describe the shipped default theme; installed theme overrides remain authoritative. No vendor code, theme or user configuration is changed.

This document precedes DSMM UI implementation. The interaction matrix and browser checks below are requirements, not claims that verification has already passed. Native browser authentication remains intact; an isolated component/in-process-carrier test does not establish authenticated Desktop/Web end-to-end behavior.

## 1. Atmosphere & Identity

A quiet, practical part of DSH Settings: system typography, compact controls, a readable configuration editor, clear selection and explicit save outcomes. Its signature is continuity with the host, not new branding. DSMM contributes one `settings.section` named DSMM Profiles, without replacing navigation, opening another application shell or relabeling native agent presets as configuration profiles.

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

Use `Button`, `Input` and, if needed, existing SVG icons from `@deepseek-ai/dsh-client-ui-primitives`. Their native exports contain no `Select` or `Textarea`; do not invent imports. Use semantic HTML for those controls, adapting the existing Models input/select geometry and host tokens. Keep the browser's native select affordance rather than copying a hardcoded-color SVG arrow.

`Button` supports normal button attributes and `variant="primary" | "ghost" | "outline" | "toolbar"`, `size="md" | "sm"`, and `icon`. `Input` forwards normal input attributes; its `className` decorates the wrapper. Add a DSMM-owned wrapper focus ring if required; the native inner input disables its own outline. Do not patch vendor primitives.

Native `SettingsFormModel`/`configForms` manage the host plugin-config document, not independent DSMM profile files. Reuse visual primitives, not that persistence model. A `settings.section` contribution has its own stable id/label/locale and a native injected `getSnapshot`/`subscribe` source. Register it additively; do not replace the native settings slot owner.

### Implemented Reusable Patterns

No DSMM client pattern is implemented yet. Add documentation here only after a real DSMM pattern is implemented and used at least twice; the host primitives above are dependencies, not DSMM-owned implementations.

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
