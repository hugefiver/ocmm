# Symbol-Related LSP Tool Design

## Status

The Symbol-Related LSP behavior remains approved, but the prior final-review receipt is invalid because this revision replaces the rejected Windows cleanup strategy. The current design and implementation-plan status is `waiting for fresh receipt`. This planning correction changes only this design and its implementation plan; it does not modify production/test code or perform a Git write.

## Goal

Add a Rust MCP tool named `find_symbol_related` that opens one fresh `LspSession`, resolves definition, implementation, and references for one source position in that same session, and returns independently classified, normalized, deduplicated groups without introducing a daemon. Every spawned language server must also have bounded, race-safe cleanup: Windows uses a dependency-free Job Object established before the suspended server can execute, while non-Windows retains direct `Child` cleanup.

## Current Repository Context

The native MCP is implemented in the single Rust binary at `crates/ocmm-lsp/src/main.rs`.

- `tool_descriptors()` exposes the native MCP tools; `execute_tool()` dispatches each tool and `normalize_tool_name()` supplies `lsp_*` aliases.
- Position tools create a fresh `LspSession`, initialize it, open the file, issue requests, and explicitly shut it down.
- The pending feature work adds implementation-link capability, structured request errors, grouped related-symbol output, and idempotent shutdown.
- The pending Windows cleanup implementation is not accepted. It must be replaced by the Job Object launch barrier in this design.
- `prepared_command()` already resolves `.cmd`/`.bat` server commands through `cmd.exe`, so Windows cleanup must cover wrapper processes and their ordinary descendants.
- `crates/ocmm-lsp/Cargo.toml` currently contains only `anyhow`, `serde`, and `serde_json`; it remains unchanged.
- `crates/ocmm-lsp/tests/mcp_stdio.rs` and `tests/fixtures/mock_lsp.mjs` provide deterministic protocol-level coverage without an installed language server.

## Approaches Considered

### 1. One fresh session, three sequential requests, canonical grouped output — selected

Create one `LspSession`, initialize and open the file once, then request definition, implementation, and references in that order. Preserve response errors structurally, normalize locations into one shape, and classify each group independently. A deterministic mock LSP fixture drives end-to-end MCP tests.

### 2. Call the three existing MCP handlers and aggregate their results

This would reuse more handler code, but every handler creates its own language-server process. It violates the same-session requirement, repeats initialization/file opening, and cannot classify structured `-32601` responses reliably if the request layer stringifies errors.

### 3. Introduce an LSP manager or daemon

A pooled manager could reuse sessions across MCP calls, but it adds shared lifecycle, concurrency, and invalidation behavior unrelated to this feature. Reuse is required only within one call, so daemon/pool work remains out of scope.

## MCP Contract

### Discovery and dispatch

`tool_descriptors()` adds the canonical tool:

```json
{
  "name": "find_symbol_related",
  "title": "LSP Find Symbol Related",
  "description": "Find definitions, implementations, and references for a symbol in one language-server session."
}
```

`normalize_tool_name()` maps `lsp_find_symbol_related` to `find_symbol_related`. `execute_tool()` dispatches the canonical name to `find_symbol_related_tool()`.

### Input

```json
{
  "filePath": "path/to/source.rs",
  "line": 1,
  "character": 0
}
```

- `filePath` is a required non-empty string.
- `line` is a required integer greater than or equal to 1.
- `character` is a required integer greater than or equal to 0.
- LSP receives `line - 1` and the unchanged `character`.
- References always set `context.includeDeclaration` to `true`.

### Structured details

The MCP result keeps `content` and `isError`. Its `details` value has exactly three named groups:

```json
{
  "definition": {
    "status": "ok",
    "items": [
      {
        "uri": "file:///workspace/src/lib.rs",
        "range": {
          "start": { "line": 4, "character": 7 },
          "end": { "line": 4, "character": 13 }
        }
      }
    ]
  },
  "implementation": {
    "status": "unsupported",
    "items": [],
    "error": {
      "code": -32601,
      "message": "Method not found",
      "data": null
    }
  },
  "references": {
    "status": "error",
    "items": [],
    "error": {
      "code": -32001,
      "message": "Index unavailable",
      "data": { "retryable": true }
    }
  }
}
```

Each group always contains `status` and `items`.

- `ok`: the LSP request returned a result, including `null` or an empty array; `error` is omitted.
- `unsupported`: the server returned JSON-RPC code `-32601`; `items` is empty and the structured error is retained.
- `error`: any other response, protocol, timeout, transport, or channel error; `items` is empty and `error` is present.

The `error` object always has `code`, `message`, and `data`; absent data serializes as `null`. Client-side failures use synthetic code `-32000` with `data: null`. A malformed response error uses `-32603`, a descriptive message, and preserves only the malformed inner error value in `data`.

Top-level `isError` is `true` only when all three groups have status `error`. `unsupported` is a valid capability result and therefore prevents the all-error condition. Text content is deterministic in definition, implementation, references order; `details` is authoritative for machine consumers.

## Structured Request Errors

```rust
const LSP_CLIENT_ERROR_CODE: i64 = -32000;

#[derive(Debug, Clone, PartialEq)]
struct LspErrorDetails {
    code: i64,
    message: String,
    data: Option<Value>,
}

#[derive(Debug)]
enum LspRequestError {
    Response(LspErrorDetails),
    Client(anyhow::Error),
}

type LspRequestResult<T> = std::result::Result<T, LspRequestError>;

fn request(&mut self, method: &str, params: Value) -> LspRequestResult<Value>;
```

`LspRequestError` implements `Display` and `std::error::Error`, provides conversion to `LspErrorDetails`, preserves the existing legacy error text for existing tools, and detects exact `-32601` without parsing text.

## Related-Result Model and Interfaces

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RelatedStatus {
    Ok,
    Unsupported,
    Error,
}

#[derive(Debug, Clone, PartialEq)]
struct RelatedGroup {
    status: RelatedStatus,
    items: Vec<Value>,
    error: Option<LspErrorDetails>,
}

fn find_symbol_related_tool(args: &Value) -> Result<ToolOutput>;

fn request_related_group(
    session: &mut LspSession,
    method: &str,
    params: Value,
) -> RelatedGroup;

fn normalize_locations(value: &Value) -> Vec<Value>;
fn location_key(item: &Value) -> Option<String>;
fn format_related_groups(groups: &[(&str, &RelatedGroup)]) -> String;
```

`RelatedGroup::to_json()` produces the stable group contract. `request_related_group()` alone maps request errors to group status, keeping transport classification separate from normalization and presentation.

## Data Flow

For each MCP call:

1. Validate `filePath`, one-based `line`, and zero-based `character`.
2. Create one fresh `LspSession` with `LspSession::for_file()`.
3. Initialize once and advertise `textDocument.implementation.linkSupport: true` alongside definition link support.
4. Open the file once with `textDocument/didOpen`.
5. Build shared `textDocument` and zero-based `position` values.
6. Request `textDocument/definition`.
7. Request `textDocument/implementation` on the same session even after a definition response error.
8. Request `textDocument/references` on the same session with `includeDeclaration: true` even after earlier unsupported/error groups.
9. Normalize and deduplicate each successful group independently.
10. Build text/details and shut down the session.

Session creation, initialization, or file-open failures remain top-level failures. Once grouped requests begin, each group failure is captured and later requests still run.

## Location Normalization and Deduplication

Successful LSP results may be `null`, one `Location`, an array of `Location`, or an array of `LocationLink`.

- A `Location` becomes `{ "uri": location.uri, "range": location.range }`.
- A `LocationLink` uses `targetUri` and prefers `targetSelectionRange`, falling back to `targetRange`.
- Entries without a string URI and complete numeric start/end line/character positions are ignored.
- `null` and empty arrays are successful empty groups.
- Deduplication is stable and group-local; the first exact `(uri, start.line, start.character, end.line, end.character)` tuple wins.
- There is no cross-group deduplication.

## Managed Child Boundary

The session stores a cross-platform managed child rather than a bare `Child`:

```rust
struct ManagedChild {
    child: Child,
    #[cfg(windows)]
    job: Option<WindowsJob>,
}

impl ManagedChild {
    fn spawn(command: &mut Command) -> Result<Self>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ChildReapOutcome {
    Exited,
    KilledAfterTimeout,
}

fn reap_child_after_exit(
    child: &mut ManagedChild,
    grace: Duration,
    poll_interval: Duration,
    termination_wait: Duration,
) -> Result<ChildReapOutcome>;
```

On non-Windows, `ManagedChild::spawn()` uses the configured stable `std::process::Command` directly. Timeout cleanup calls `Child::kill()` and uses bounded `try_wait()` polling until the direct child is reaped; it does not add process-group behavior.

## Windows Job Object Launch Barrier

### Dependency and API boundary

No Cargo dependency is added. `crates/ocmm-lsp/Cargo.toml` remains byte-for-byte unchanged. A private `#[cfg(windows)]` module links documented Kernel32 exports through `unsafe extern "system"` declarations.

The FFI surface is limited to:

- `CreateJobObjectW`, `SetInformationJobObject`, `AssignProcessToJobObject`, and `TerminateJobObject`;
- `CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD)`, `Thread32First`, and `Thread32Next` for thread discovery only;
- `OpenThread`, `GetProcessIdOfThread`, and `ResumeThread` for the suspended initial thread;
- `CloseHandle` for owned Job, snapshot, and thread handles.

There is no process-enumeration FFI and no PID-directed termination FFI. Toolhelp is limited strictly to finding the suspended child thread. No shell/management process-control command, undocumented whole-process resume API, process-escape creation flag, daemon, or new crate is used. The implementation-plan scope audit rejects the exact forbidden API/flag spellings in production source and both planning artifacts.

Official API references are the Microsoft Learn pages for `CreateJobObjectW`, `SetInformationJobObject`, `JOBOBJECT_EXTENDED_LIMIT_INFORMATION`, `AssignProcessToJobObject`, `TerminateJobObject`, process creation flags, `CreateToolhelp32Snapshot`, `THREADENTRY32`, `OpenThread`, `GetProcessIdOfThread`, and `ResumeThread`.

### ABI types and layouts

The private FFI uses these exact Rust representations:

```rust
#[cfg(windows)]
type WindowsHandle = *mut std::ffi::c_void;

#[cfg(windows)]
#[repr(C)]
#[derive(Default)]
struct JobObjectBasicLimitInformation {
    per_process_user_time_limit: i64,
    per_job_user_time_limit: i64,
    limit_flags: u32,
    minimum_working_set_size: usize,
    maximum_working_set_size: usize,
    active_process_limit: u32,
    affinity: usize,
    priority_class: u32,
    scheduling_class: u32,
}

#[cfg(windows)]
#[repr(C)]
#[derive(Default)]
struct IoCounters {
    read_operation_count: u64,
    write_operation_count: u64,
    other_operation_count: u64,
    read_transfer_count: u64,
    write_transfer_count: u64,
    other_transfer_count: u64,
}

#[cfg(windows)]
#[repr(C)]
#[derive(Default)]
struct JobObjectExtendedLimitInformation {
    basic_limit_information: JobObjectBasicLimitInformation,
    io_info: IoCounters,
    process_memory_limit: usize,
    job_memory_limit: usize,
    peak_process_memory_used: usize,
    peak_job_memory_used: usize,
}

#[cfg(windows)]
#[repr(C)]
struct ThreadEntry32 {
    size: u32,
    usage_count: u32,
    thread_id: u32,
    owner_process_id: u32,
    base_priority: i32,
    delta_priority: i32,
    flags: u32,
}
```

For both supported 64-bit Windows targets (`x86_64-pc-windows-msvc` and `aarch64-pc-windows-msvc`), compile-time assertions require:

- `JobObjectBasicLimitInformation`: size 64, alignment 8; pointer-sized offsets 24, 32, and 48; final `u32` offsets 56 and 60.
- `IoCounters`: size 48, alignment 8.
- `JobObjectExtendedLimitInformation`: size 144, alignment 8; `io_info` offset 64; four trailing `usize` offsets 112, 120, 128, and 136.
- `ThreadEntry32`: size 28, alignment 4; field offsets 0, 4, 8, 12, 16, 20, and 24.

Constants are exact Win32 values: `CREATE_SUSPENDED = 0x00000004`, `CREATE_NO_WINDOW = 0x08000000`, `JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS = 9`, `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000`, `TH32CS_SNAPTHREAD = 0x00000004`, `THREAD_SUSPEND_RESUME = 0x0002`, `THREAD_QUERY_LIMITED_INFORMATION = 0x0800`, and `RESUME_THREAD_FAILED = u32::MAX`.

`GetProcessIdOfThread` requires query access, so `OpenThread` requests `THREAD_SUSPEND_RESUME | THREAD_QUERY_LIMITED_INFORMATION`, remains non-inheritable, and requests no unrelated rights.

### Handle ownership

`OwnedWindowsHandle` owns exactly one non-null/non-sentinel handle and closes it once in `Drop`. It is neither `Clone` nor `Copy`.

```rust
#[cfg(windows)]
struct OwnedWindowsHandle(WindowsHandle);

#[cfg(windows)]
struct WindowsJob {
    handle: Option<OwnedWindowsHandle>,
}

impl WindowsJob {
    fn create_kill_on_close() -> std::io::Result<Self>;
    fn assign_child(&self, child: &Child) -> std::io::Result<()>;
    fn terminate(&self) -> std::io::Result<()>;
    fn close(&mut self);
}
```

`CreateJobObjectW(NULL, NULL)` creates an unnamed job whose returned handle is non-inheritable. Before any child is spawned, `SetInformationJobObject(JobObjectExtendedLimitInformation)` receives a zero-initialized extended-limit structure whose only active field is `basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.

`WindowsJob::close()` uses `Option::take()`, so explicit close plus `Drop` is idempotent. Closing the last handle is the final safeguard that terminates ordinary non-breakaway processes still in the job.

### Suspended spawn, assignment, and resume

The production launch path has a narrow injectable boundary only around the four operations needed to establish/release the barrier:

```rust
#[cfg(windows)]
trait WindowsLaunchOps {
    fn assign_process(&self, job: &WindowsJob, child: &Child) -> std::io::Result<()>;
    fn open_initial_thread(&self, child_pid: u32) -> std::io::Result<OwnedWindowsHandle>;
    fn thread_owner_pid(&self, thread: &OwnedWindowsHandle) -> std::io::Result<u32>;
    fn resume_thread(&self, thread: &OwnedWindowsHandle) -> std::io::Result<u32>;
}

#[cfg(windows)]
fn spawn_windows_managed_child_with_ops(
    command: &mut Command,
    ops: &dyn WindowsLaunchOps,
) -> Result<ManagedChild>;
```

The real implementation performs this sequence:

1. Create the unnamed non-inheritable Job Object and configure `KILL_ON_JOB_CLOSE`.
2. Apply `CREATE_NO_WINDOW | CREATE_SUSPENDED` to the existing `Command`; do not replace stable command construction or piped stdio.
3. Spawn the direct child. It cannot execute because its primary thread is suspended.
4. Assign `Child::as_raw_handle()` to the configured job. Assignment must complete before any resume operation.
5. Take a thread-only Toolhelp snapshot, enumerate `ThreadEntry32`, and require exactly one entry whose `owner_process_id == child.id()`.
6. Open that thread with suspend/resume plus query-limited access and no handle inheritance.
7. Re-read ownership with `GetProcessIdOfThread`; require the result to equal `child.id()`.
8. Call `ResumeThread`; require its returned previous suspend count to equal exactly `1`.
9. Close the temporary thread/snapshot handles and return `ManagedChild { child, job: Some(job) }`.

Zero or multiple matching thread entries, a recycled thread ID, a zero owner result, or any API failure is a startup failure. Toolhelp data is not used to infer any process relationship.

### Fail-closed startup

Job create/configuration failures occur before spawn and return a controlled startup error with no child. Spawn failure closes the empty job. Assignment, thread lookup/open, owner verification, and resume failures perform all applicable cleanup before returning the operation-specific error:

- if assignment succeeded, call `TerminateJobObject`;
- always call direct `Child::kill()` as fallback for the still-suspended direct child;
- use bounded `try_wait()` polling to reap the direct child;
- close thread, snapshot, and job handles through RAII.

An assignment failure never reaches the thread-open/resume path. Owner-verification and injected resume failures do not call the real `ResumeThread`. No unmanaged child is resumed.

## Session Shutdown and Cleanup

```rust
const LSP_EXIT_GRACE_MS: u64 = 500;
const LSP_EXIT_POLL_MS: u64 = 10;
const LSP_TERMINATION_WAIT_MS: u64 = 2_000;
```

`LspSession` keeps an idempotent `closed` flag. `shutdown()` marks closed, attempts the LSP `shutdown` request and `exit` notification, then calls `reap_child_after_exit()`.

- During the 500 ms grace window, the Windows Job handle stays open while the direct wrapper/server may exit naturally.
- When the direct Windows child exits naturally, it is reaped and the job handle is explicitly closed before return. `KILL_ON_JOB_CLOSE` therefore terminates any ordinary descendant that outlived the wrapper.
- At the grace deadline, Windows calls `TerminateJobObject`, invokes direct `Child::kill()` as fallback, closes the job, and polls the direct child for at most `LSP_TERMINATION_WAIT_MS` until it is reaped.
- Non-Windows retains direct-child behavior: natural exit is reaped; timeout calls `Child::kill()` and performs the same bounded direct-child reap.
- A cleanup API error is returned only after all applicable termination/close/reap attempts have run. `shutdown()` remains best-effort, while startup returns its controlled error.
- `Drop` calls idempotent `shutdown()`. `WindowsJob` handle RAII and `KILL_ON_JOB_CLOSE` remain final safeguards for early returns and unwinding.

This cleanup applies to all tools using `LspSession`; it does not retain sessions across MCP calls.

## Test Architecture

`crates/ocmm-lsp/tests/fixtures/mock_lsp.mjs` remains a deterministic stdio JSON-RPC fixture using Node built-ins. Each integration test creates isolated source/config/trace paths and a fresh MCP process. No installed real language server, daemon, Cargo crate, or npm package is required.

Required coverage:

| Scenario | Assertions |
|---|---|
| Tool discovery and alias | `tools/list` contains `find_symbol_related`; `lsp_find_symbol_related` dispatches to it |
| All requests succeed | One initialize/open; definition → implementation → references; all groups `ok`; top-level non-error |
| Unsupported/partial/all errors | Exact structured errors are retained, remaining requests run, and top-level semantics match the contract |
| Duplicate/`LocationLink` results | Group-local stable deduplication and selection/fallback ranges are exact |
| Cleanup after group error | Exactly one `shutdown` then one `exit`; explicit cleanup plus `Drop` is idempotent |
| Ignore-exit cleanup timing | The fixture timestamps receipt of `exit`; response completion is 400 ms or more and under 5 seconds after that trace point, independently of concurrent Node cold-start delay; total invocation remains under the request-timeout safety bound |
| Natural direct exit | Piped stdio remains usable; direct child exits during grace and is reaped without timeout termination |
| Direct timeout | Long-lived direct child reaches the deadline, is killed/reaped, and cleanup is bounded |
| Windows ABI | Installed x64 host tests validate sizes/alignments/offsets; 64-bit static assertions remain in cfg-gated source for the release matrix to compile on Windows x64/arm64 |
| Windows suspended launch | Marker/output is absent before assignment and resume, appears after resume, and piped stdin/stdout still works |
| Windows launch failures | Assignment, unexpected thread-enumeration error, owner-verification, and resume seams never execute the child marker; startup fails and cleanup finishes within the bound |
| Windows `.cmd` timeout tree | `.cmd` launches persistent Node; timeout removes the descendant, reaps the direct wrapper, leaves an unrelated sentinel alive, and finishes in under 5 seconds |
| Windows natural wrapper exit | Root wrapper exits while an ordinary long-lived descendant is alive; closing the Job handle removes the descendant |
| Cross-platform cfg | Local host checks validate the installed Windows x64 target; the existing eight-target release workflow is responsible for compiling Windows arm64 and non-Windows cfg branches when that workflow runs |

PID values may be used only by test liveness probes. Tests never use a PID to decide ownership or perform production cleanup.

## Files

| File | Action | Responsibility |
|---|---|---|
| `crates/ocmm-lsp/src/main.rs` | Modify during implementation | Tool behavior, structured errors, managed-child boundary, private Windows Job/thread FFI, launch barrier, bounded cleanup, and inline unit tests |
| `crates/ocmm-lsp/tests/mcp_stdio.rs` | Modify during implementation | MCP/grouped integration assertions and isolated mock-LSP harness |
| `crates/ocmm-lsp/tests/fixtures/mock_lsp.mjs` | Create during implementation | Deterministic cross-platform LSP protocol fixture using Node built-ins |
| `AGENTS.md` | Modify during implementation | Update the native MCP smoke expectation from seven to eight tools |
| `docs/kb/omo-features/lsp-integration.md` | Modify during implementation | Document the local grouped tool and platform-specific managed cleanup |
| `docs/superpowers/specs/2026-07-20-symbol-related-lsp-design.md` | Planning artifact | Approved design and corrected Windows lifecycle contract |
| `docs/superpowers/plans/2026-07-20-symbol-related-lsp.md` | Planning artifact | Executable TDD sequence and verification commands |

The implementation scope remains exactly these seven files. `crates/ocmm-lsp/Cargo.toml`, root `Cargo.toml`, and `Cargo.lock` must remain unchanged; adding a dependency would require a new decision and a revised allowlist.

## Verification

Run from `C:\Users\hugefiver\source\ocmm` with PowerShell-compatible syntax:

```powershell
cargo fmt --check --package ocmm-lsp
cargo test -p ocmm-lsp --bin ocmm-lsp child_reaper_ -- --nocapture
cargo test -p ocmm-lsp --bin ocmm-lsp windows_job_ -- --nocapture
cargo test -p ocmm-lsp --test mcp_stdio find_symbol_related -- --nocapture
cargo test -p ocmm-lsp
cargo check -p ocmm-lsp --all-targets --target x86_64-pc-windows-msvc
cargo build -p ocmm-lsp --target x86_64-pc-windows-msvc
pnpm run typecheck
pnpm test
pnpm run build
'{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist\cli\ocmm-lsp.js mcp
```

These are executable local check/test/build gates for the already installed `x86_64-pc-windows-msvc` host. They do not claim local Windows arm64 or non-Windows compilation evidence. Release acceptance additionally requires the existing eight-target native matrix in `.github/workflows/release.yml` to compile the cfg-gated implementation when that workflow next runs: Windows x64/arm64 compile the 64-bit ABI assertions, and non-Windows targets compile only direct-child cleanup. That workflow result is a release-gate responsibility, not evidence produced by this planning session, and no target installation is requested.

## Commit Boundary

After implementation, all verification, a fresh passing plan receipt, and explicit Git-write authorization, the requirement produces one semantic commit containing exactly the seven allowlisted files. Intended title:

```text
feat(lsp): add related symbol lookup
```

No Git write occurs during this planning correction.

## Non-Goals

- No daemon, socket transport, manager, persistent session pool, retry layer, or cross-call cache.
- No change to existing single-purpose tool response contracts.
- No new user configuration/schema fields or TypeScript MCP runtime changes.
- No prompt, skill, generated bundle, package metadata, release workflow, or Cargo manifest changes.
- No result ranking, cross-group merging, call hierarchy, type hierarchy, or workspace-wide symbol search.
- No custom `CreateProcessW` implementation; stable `std::process::Command` remains the spawn surface.
- No process enumeration, PID-based production termination, shell process-control fallback, or child escape flag.

## Acceptance Criteria

- `find_symbol_related` and `lsp_find_symbol_related` are discoverable/dispatchable as designed.
- Definition, implementation, and references execute sequentially in one fresh session after one initialize/open.
- Structured group/error, normalization, deduplication, line/character, and top-level error contracts are exact.
- Every Windows server is assigned to an already configured unnamed non-inheritable `KILL_ON_JOB_CLOSE` Job Object before its suspended initial thread can execute.
- Thread lookup uses only `TH32CS_SNAPTHREAD`; ownership is re-verified on the opened thread handle; only a previous suspend count of exactly `1` is accepted.
- Every Windows launch failure fails closed, never resumes an unmanaged child, reaps the direct child within a bound, and closes all handles.
- Windows timeout cleanup terminates the job and direct child fallback; natural wrapper exit closes the job so ordinary descendants cannot survive.
- Non-Windows retains bounded direct-child cleanup.
- `.cmd` descendants are cleaned without harming an unrelated sentinel, and all cleanup tests finish in under 5 seconds.
- Installed Windows x64 host ABI/tests/checks pass without a new dependency; the cfg-gated source retains 64-bit static assertions for Windows x64/arm64.
- The existing eight-target native release workflow must compile the Windows arm64 and non-Windows branches when it runs; this is recorded as release-gate acceptance rather than local evidence.
- The complete test matrix and repository gates pass.
- The final change remains within the seven-file allowlist; Cargo manifests remain unchanged.
- The prior receipt remains invalid; execution waits for a fresh receipt for this exact revision.
