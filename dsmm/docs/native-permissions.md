# Native permissions

DSH owns approval. DSMM composes permission policy into the native tool pipeline; it doesn't add a separate approval queue, approval UI, TTL or session permit memory. This guide states the source contract, not verification of a published package, build or release.

## Full access and approval

Full access means actual native effective standing `danger-full-access`, not a model argument, a requested escalation or a configured `permissionControl.nativeCommands` target. With that standing authority, DSMM doesn't add an ask, downgrade the sandbox, demand a path permit or refuse an unknown operation because classification facts are missing. The only DSMM restriction is a deterministically matched existing explicit deny blacklist, expressed as a native pre-approval decision. There's no additional inferred high-risk list.

A captured read-only child or a live, composed DSMM read-only preset has an explicit blacklist covering `write`, `edit`, `bash` and `pwsh`. Standing Full access must not bypass that ceiling; useful native reads remain available. Missing ordinary DSMM policy or classification facts do not by themselves establish a read-only role.

The permission contract requires an actual DSH manual approval to be final for the same call and approved scope. Older DSMM rules, a changed permission revision or epoch, and DSMM internal gates must not veto it afterward. A pending native approval isn't canceled merely because a permission source changes. The one-shot delegation exception below remains an unresolved defect.

A native once grant applies only to its actual call and scope. It doesn't change standing session permissions, authorize later calls or turn a narrower approval into full access. DSMM can't infer approval from model-supplied arguments or saved policy. DSH rejection and caller/native cancellation remain effective, and the original tool or OS can still fail. Permission to execute isn't a command-success guarantee.

## Settings and synchronization

`permissionControl.enabled` defaults true independently of Deepwork and is captured at cold startup. Saving a different value reports restart-required; it neither hot-mounts an executor nor changes the admitted toggle, even for new roots. Turning it off doesn't disable native permissions or other independent tool restrictions.

Global and native-profile layers may configure permission settings; named/session overlays can't. Dynamic `permissionControl.outsideReads`, `permissionControl.webSearch`, `permissionControl.webFetch`, `permissionControl.rules` and `permissionControl.nativeCommands` require runtime policy synchronization, not a restart. A configured value isn't proof of mounting or synchronization. Outside-read and web controls cover their native tool surfaces, not every filesystem or network operation inside a shell command.

The rules RPC writes Global. A native override of outside-read, web or rule policy must be edited or unset at that layer rather than bypassed by a Global RPC save. An enabled-only override doesn't shadow dynamic policy. See [settings and status](settings-status.md) for layer ownership and save authority.

Storage CAS and runtime adoption are separate from native call approval. Saves recheck authoritative storage and await notification before publishing synchronized policy. Notification failure leaves saved/runtime revisions visibly unsynchronized; recovery rereads storage, and conflicts preserve dirty drafts. These checks don't cancel pending native approval or override an actual approved call. New calls consume current policy, with no cross-call reuse of a once grant.

## Capability limits

### Deferred P1: admission changes during one-shot approval

If a profile selection publishes a new parent admission epoch while a DSMM one-shot delegation awaits native approval, an ensuing Allow can still be rejected with `UNAUTHORIZED` before child dispatch, even when the physical Agent, owner and tool registration are unchanged. This is a known availability defect, not a successful approval or a permission grant to later calls. Avoid changing the parent profile while approval is pending; if the call is refused, issue a fresh invocation under the current profile.

This case is excluded from temporary integration acceptance, not considered fixed. Its complete regression remains in `test/native-core-review-regressions.test.mjs` and is skipped with an explicit reason by default. Set `DSMM_TEST_DEFERRED_APPROVAL=1` to run it. Final unrestricted acceptance still requires this regression to pass without weakening cancellation, ownership or input isolation. The installed SDK and existing request-revocation protections remain unchanged.

See the [accepted risk and reevaluation conditions](deferred-native-approval-risk.md) for the bounded deferral and future DSH compatibility requirements.

Permission coverage isn't proof of final inode identity or socket isolation. Colocation of `rg` with the intended execution environment isn't proven, and direct formal coverage remains partial. Native outside-read and web coverage, policy synchronization, and successful storage writes are distinct claims. None establishes complete shell filesystem/network isolation or published-artifact delivery.
