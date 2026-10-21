# Native permissions

DSMM 0.3.1 targets exactly DSH `0.2.1-rc.2`. DSH owns approval; DSMM composes policy into the native tool pipeline without a second approval queue, UI, TTL or session permit memory.

## Full access and approval

Full access means actual native effective standing `danger-full-access`, not a model argument, a requested escalation or a configured `permissionControl.nativeCommands` target. With that standing authority, DSMM doesn't add an ask, downgrade the sandbox, demand a path permit or refuse an unknown operation because classification facts are missing. The only DSMM restriction is a deterministically matched existing explicit deny blacklist, expressed as a native pre-approval decision. There's no additional inferred high-risk list.

A captured read-only child or a live, composed DSMM read-only preset has an explicit blacklist covering `write`, `edit`, `bash` and `pwsh`. Standing Full access must not bypass that ceiling; useful native reads remain available. Missing ordinary DSMM policy or classification facts do not by themselves establish a read-only role.

Actual DSH manual approval is final for the same call and approved scope. Older DSMM rules, a changed permission revision or epoch, and DSMM internal gates don't veto it afterward. A pending native approval isn't canceled merely because a permission source changes.

A native once grant applies only to its actual call and scope. It doesn't change standing session permissions, authorize later calls or turn a narrower approval into full access. DSMM can't infer approval from model-supplied arguments or saved policy. DSH rejection and caller/native cancellation remain effective, and the original tool or OS can still fail. Permission to execute isn't a command-success guarantee.

## Settings and synchronization

`permissionControl.enabled` defaults true independently of Deepwork and is captured at cold startup. Saving a different value reports restart-required; it neither hot-mounts an executor nor changes the admitted toggle, even for new roots. Turning it off doesn't disable native permissions or other independent tool restrictions.

Global and native-profile layers may configure permission settings; named/session overlays can't. Dynamic `permissionControl.outsideReads`, `permissionControl.webSearch`, `permissionControl.webFetch`, `permissionControl.rules` and `permissionControl.nativeCommands` require runtime policy synchronization, not a restart. A configured value isn't proof of mounting or synchronization. Outside-read and web controls cover their native tool surfaces, not every filesystem or network operation inside a shell command.

The rules RPC writes Global. A native override of outside-read, web or rule policy must be edited or unset at that layer rather than bypassed by a Global RPC save. An enabled-only override doesn't shadow dynamic policy. See [settings and status](settings-status.md) for layer ownership and save authority.

Storage CAS and runtime adoption are separate from native call approval. Saves recheck authoritative storage and await notification before publishing synchronized policy. Notification failure leaves saved/runtime revisions visibly unsynchronized; recovery rereads storage, and conflicts preserve dirty drafts. These checks don't cancel pending native approval or override an actual approved call. New calls consume current policy, with no cross-call reuse of a once grant.

Configuration writes require the real native operator, exact entry/form or Root authority and a live connection/owner through every await and immediately before commit. Serialized provenance, a client loopback claim or an old registration isn't authority. Only relevant effective permission changes coordinate revocation; unrelated model/locale/display edits aren't a second approval gate. A committed write stays committed when notification or observation fails, with refresh-required/unsynchronized status. An unconfirmed native result requires reread, not blind retry.

## Configuration drawer and command rules

Use **Plugins → DSMM bundle config → Permissions**. The selected Global/native-profile scope edits its sparse deployment policy; a separate Root-rules transaction writes Global only under the existing live operator, exact open Root, registration and synchronized-policy authority. A child, stale connection, read-only Host or shadowing native policy doesn't acquire a fallback Global write. Named Profiles can't grant these permissions. No duplicate Settings permission page or Conversation permission tab is registered.

A trusted, writable ordinary native Root can manage Global rules without DSMM role admission, including when it predates Core mounting. This does not grant it a DSMM role. Captured DSMM objects still require current admission and role checks; retired captures and unadmitted Roots currently composed with a `dsmm-` preset cannot fall back to ordinary native authority.

`permissionControl.nativeCommands` defaults off. Each entry stores exactly one match shape, `{ tool, workingDirectory, commandPattern }`. Legacy `executable`/`subcommand`/`args` entries are not migrated, converted or silently dropped: configuration, persistence, runtime and the form reject them, so an older configuration must be rewritten explicitly rather than widened in place.

Entries use `executable BLANK subcommands [BLANK "*"]`, where subcommands are `|`-separated literals: `go build|test` and `go build|test *` are equivalent and allow zero or more trailing argv. `*` only stands for the whole trailing argument list; there is no character glob, regex, executable alternative, parenthesized group or cross-token alternative. Literals allow Unicode letters/marks/digits plus `_ . / : = + % -`, and the executable may also contain Windows path backslashes; quotes, escapes and whitespace inside a path are unsupported. A single-token call or a call with no subcommand position has no pattern equivalent, and any allowed trailing arguments are broader than a formerly fixed argv list.

The pattern is compared against the actual call only after the existing static literal parser accepts it. `go build|test` typed into a real shell is still pipe syntax and gains nothing from a configured pattern; pipes, chaining, newlines, redirects, substitutions, expansions and wrapper/interpreter calls continue on the ordinary native path. A non-match never turns into a blanket refusal. Case, executable spelling, subcommand spelling and the Host-normalized effective cwd remain literal, and no subdirectory access is implied.

Trailing arguments mean the selected program keeps its own capabilities, including build scripts, test code and options such as `go test -exec` that launch other programs. The static shell parse only excludes outer shell composition; it is not program-semantic or filesystem isolation. This feature adds no path, temp-directory or cache-root authorization. All hits are collected together: differing sandbox modes stay `ambiguous` and fall back to the native path, and `ask` wins within one sandbox mode. There is no longest-prefix or entry-order precedence.

New UI entries use Ask and `workspace-write`, not full access; an Allow entry can't replace downstream Ask/Deny or a role's read-only ceiling. The UI offers no entry that creates `danger-full-access`, and an existing value from another source is displayed with its original restriction. The editor has one pattern field per entry: correcting invalid pattern text never widens an entry, and only Save persists it. Removing a row discards only that row's draft and keeps every other row's edits; Unset replaces the whole array with the inherited list.

Observed `kind:shell` registration isn't proof of the actual executor, environment, executable or sandbox. The editor doesn't auto-certify those values. Missing/stale controller or registration identity still refuses consumption. Saving a rule isn't native manual approval and doesn't solve an unexplained read-only Git prompt; that investigation needs the full triggering call and approval reason.

## Capability limits

### Running overlay changes

Live overlay Apply is unavailable. Save/select a future default and create a new session instead of rebinding an active parent or pending invocation. Ordinary mode controls and Use profile model retain independent capabilities; neither grants overlay authority.

Same-call approval, cancellation, ownership and input isolation remain effective. Don't replay a whole parent task to work around a refused call; inspect the outcome and explicitly invoke fresh work only when appropriate.

See [running-overlay and approval boundaries](deferred-native-approval-risk.md).

Outside-read and web policies apply to their native tool surfaces. They don't provide complete filesystem/network isolation for arbitrary shell commands or replace operating-system checks on the final inode and socket target.
