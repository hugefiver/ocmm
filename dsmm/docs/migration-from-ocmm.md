# Migrating from ocmm to DSMM

DSMM 0.3.1 targets exactly DSH `0.2.1-rc.2`. It's a DSH-native Cordis bundle, not an OpenCode compatibility layer. Don't copy `.opencode/ocmm.jsonc` into DSH.

Model selection, authentication, permissions, session ownership and package loading remain DSH-native. Existing OpenCode configuration and sessions may coexist, but they don't become DSMM configuration or fallback sessions. Migration doesn't copy credentials, account records or private provider preferences.

## Feature mapping

| ocmm area | DSMM contract |
| --- | --- |
| Deepwork workflow | Risk-based discovery and planning adapted to native tools. Complex product behavior retains orchestrator-owned planning/criticism; bounded routine work doesn't require a ceremonial approval loop. |
| Roles and categories | 11 base roles and 11 categories with canonical `dsmm-*` IDs. Cross-cutting defaults off. Only the Orchestrator is standing-root eligible; other roles are internal delegation targets. |
| Skills | Fourteen configurable lazy native skills, discovered through metadata and loaded through `get`/`resourceBase`, not full bodies injected every turn. |
| Model routing | Generic native capabilities, `modelParameters`, role primary/fallback routes and explicit invocation levels. Ordinary root model/effort stays native-owned. |
| Settings | Sparse Global/native deployment layers plus independent named Profiles. Save, future default, mode and native model selection have independent capabilities; live overlay Apply is unavailable. |
| Safety | Native tool policies and scoped helpers; mandatory role/read-only/delegation fences remain independent of optional workflow mode. DSH owns approval and cancellation. |
| Child lifecycle | Official activation/results/disposal, immutable admission and live direct-parent controls. Background is selected before start; no running handoff, guessed task IDs or cold DSMM recovery. |
| Recovery | Startup locks and explicitly configured bounded rate-limit fallback, requiring positive no-output evidence. Idle continuation is separately opt-in. |
| LSP/MCP | DSMM automatic integration remains off, even with `lsp.enabled:true`; original interfaces/config remain. Native DSH LSP and independently configured MCP are unaffected. |
| OpenCode hooks and Codex marketplace | No hook ABI, history/cache mutation or marketplace compatibility. Use native DSH installation and actual exposed capabilities. |
| Release | Dedicated DSMM workflow and checker, not the root ocmm completion authority. |

See [Agent presets](agent-presets.md) for the canonical inventory and permission matrix. An exported template isn't a callable role. Reviewer is primary-lane self-review; Oracle is an external-model check only when the observed route actually differs. A role name alone doesn't prove model heterogeneity.

[Source synchronization](skill-sync.md) defines prompt/resource provenance and fixed-pin distribution. The full frontend library and licenses must be present in the packed artifact; offline build/check refuses missing or unsafe resources without imposing content locks on local files.

## Configuration sequence

These steps are operator guidance, not authorization to install or change user profiles:

1. Evaluate a reviewed packed candidate in an isolated `DSH_HOME` and dedicated native profile. The [README](../README.md#use-a-local-artifact) gives the minimal CLI example. Keep the original OpenCode configuration until the intended DSH carrier has passed its own checks.
2. Configure actual providers, model IDs, exact efforts and credential references through native DSH. Discover the real catalog and adapter capabilities; don't infer aliases, vision support or protocol behavior from another provider's SDK name.
3. Translate intended behavior into DSMM's sparse Global or exact native entry `config`, preserving unrelated settings and Loader rows. Use **Plugins → DSMM bundle config** for module drawers; named **Deepwork Profiles** remains separate. Don't copy the removed `settings.yaml` namespace or merged defaults into a sparse layer.
4. Use `workflow.policy: risk-based` unless deliberately retaining supported legacy controls. Inspect normalized status because omitted values and explicit same-default pins have different inheritance effects.
5. Configure canonical `roleRouting` IDs and explicit low/high/max levels where needed. Source tier guidance doesn't create suffix roles. Preserve disabled roles; a source `explore` alias maps to `dsmm-code-search`, not another role/tool.
6. Retain official AgentRegistry, SubagentRuntime and JSONL namespace ownership. Don't add a DSMM custom owner, manual-runtime selector or persistence companion. Check actual admission/capabilities independently of saved desired settings.
7. Verify actual native delegation, useful read/write/tool-result behavior, read-only denial and the child's own request route. Config/catalog inspection isn't execution evidence. Don't enable DSMM LSP through the retained historical manual patch; see [LSP boundary](lsp.md).

Headless task execution uses an effective `defaultActive:true` and a native provider; it doesn't select Agent presets. Command-capable Hosts execute `/deepwork` and `/dsmm-status` through the command adapter, not as model task text. `--dump-config` shows Loader composition, not complete Global-aware DSMM admission.

## Retired fields and retained history

Brand-calibration/default-effort and MaxReasoningPresets fields reject with `deprecated-field`; [model routing](model-routing.md#generic-model-parameters) lists their exact names. Edit the invalid configuration deliberately using generic routes, parameters and levels. There is no automatic migration or silent field rewrite.

Unsupported legacy profile libraries and history remain untouched; same-name central documents aren't substitutes. Source versions and immutable references distinguish observed/saved state, not permission to adopt the latest draft or restore execution. Native CAS, admission epochs and release/resource integrity keep separate contracts.

Cold DSMM resume without trusted live admission is unsupported. Preserve history and obtain direction rather than substituting a persona or reconstructing permissions from the current parent. Display metadata and old captures don't grant authority; no automatic import, rewrite or migration is supplied.

Live overlay Apply is unavailable; select a saved future default for new sessions. **Use profile model** and ordinary Deepwork mode changes have independent capabilities, not Apply's disabled gate. The model action requests the admitted immutable configuration's model, not a later draft, and newer observed native model/effort intent wins, including same-value reselection. See [Profiles](profiles.md).

## Carrier and permission limits

Real Desktop and CLI/TUI installations require separate exact authorization. Use the installation-owned carrier on exact rc.2, preserve provider/account state and unrelated rows, and follow cold-start requirements. Desktop plugin installation follows publication and doesn't authorize upgrading the Host. Don't copy credentials or browser storage into tests.

DSH owns depth, sandbox and approval. DSMM doesn't raise those ceilings or infer approval from configuration. [Running-overlay and approval boundaries](deferred-native-approval-risk.md) prohibit rebinding a pending call to another configuration. Repeated approval for read-only Git remains unclassified until the exact call and approval reason are supplied.

Any profile/log repair or rollback needs its own data-preserving scope, concurrency checks and recoverable backup. Migration never authorizes rewriting immutable releases, deleting history or restoring credentials. [Release controls](releasing.md) separate npm publication completion from GitHub Release delivery and installed-carrier acceptance.
