# Symbol-Related LSP Tool Implementation Plan

> **For agentic workers:** Use the subagent-driven-development skill to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete `find_symbol_related` and replace the rejected Windows cleanup with a dependency-free Job Object launch barrier that assigns every suspended language server before it executes and reliably removes ordinary descendants.

**Architecture:** Keep one fresh `LspSession` per MCP call and the existing structured grouped-result design. Wrap the stable `std::process::Command` child in `ManagedChild`; Windows creates/configures an unnamed `KILL_ON_JOB_CLOSE` Job Object, spawns suspended, assigns the process, finds and verifies its initial thread through thread-only Toolhelp APIs, then resumes it, while non-Windows keeps direct `Child` cleanup. Shutdown retains the Job during the 500 ms grace interval, explicitly terminates/closes it before return, and uses a bounded direct-child reap.

**Tech Stack:** Rust 2021, private Kernel32 FFI behind `cfg(windows)`, `anyhow`, `serde_json`, Rust unit/integration tests, Node.js 22 built-ins, MCP/LSP JSON-RPC, PowerShell 7, Cargo, pnpm.

**Global Constraints:**
- The behavior authority is `docs/superpowers/specs/2026-07-20-symbol-related-lsp-design.md`; implementation must match its exact tool, group, error, normalization, launch, cleanup, and test contracts.
- Add no Cargo/npm dependency and install no software. `crates/ocmm-lsp/Cargo.toml`, root `Cargo.toml`, and `Cargo.lock` remain unchanged.
- Keep stable `std::process::Command`; on Windows use only documented Kernel32 APIs through minimal private FFI.
- Windows creates an unnamed non-inheritable Job Object, configures `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` before spawn, and uses exactly `CREATE_NO_WINDOW | CREATE_SUSPENDED` without an escape flag.
- Assignment of `Child::as_raw_handle()` must succeed before any resume attempt. Toolhelp is limited to `TH32CS_SNAPTHREAD`; require one matching initial thread, re-verify its owner after `OpenThread`, and accept only `ResumeThread` previous suspend count `1`.
- `OpenThread` requests `THREAD_SUSPEND_RESUME | THREAD_QUERY_LIMITED_INFORMATION` because `GetProcessIdOfThread` requires query access; the handle is non-inheritable.
- Job create/configuration, spawn, assignment, thread lookup/open, owner verification, or resume failure fails closed. Never resume an unmanaged child.
- After `shutdown`/`exit`, retain the Windows Job during the 500 ms grace period. Timeout calls `TerminateJobObject`, direct-child kill fallback, bounded reap, and closes the Job. Natural wrapper exit also closes the Job before return so ordinary descendants cannot survive.
- Non-Windows retains direct `Child` termination/reaping behind `cfg(not(windows))`.
- Production changes stay in `crates/ocmm-lsp/src/main.rs`; protocol tests stay in `crates/ocmm-lsp/tests/mcp_stdio.rs` and `crates/ocmm-lsp/tests/fixtures/mock_lsp.mjs`.
- Direct documentation changes are limited to `AGENTS.md` and `docs/kb/omo-features/lsp-integration.md`.
- MCP input uses one-based `line` and zero-based `character`; one fresh session requests definition, implementation, and references in order; references set `includeDeclaration: true`.
- JSON-RPC `-32601` is `unsupported`; other response/client failures are `error`; successful `null` is `ok` with no items.
- Deduplicate only within each group by URI plus complete range, preserve first-seen order, and prefer `LocationLink.targetSelectionRange` before `targetRange`.
- Run commands from `C:\Users\hugefiver\source\ocmm` with PowerShell syntax.
- The final implementation remains one semantic commit over the exact seven-file allowlist, but no Git write occurs without explicit execution-time authorization.
- The prior final-review receipt is invalid. Do not implement until the orchestrator records a passing receipt for this exact revision; current status: `waiting for fresh receipt`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `crates/ocmm-lsp/src/main.rs` | Modify | Structured grouped tool, `ManagedChild`, private Windows Job/thread FFI, suspended launch barrier, bounded platform cleanup, and inline tests |
| `crates/ocmm-lsp/tests/mcp_stdio.rs` | Modify | Isolated MCP/mock-LSP harness and grouped protocol/lifecycle integration tests |
| `crates/ocmm-lsp/tests/fixtures/mock_lsp.mjs` | Create | Deterministic Content-Length LSP fixture, including success/error/ignore-exit scenarios |
| `AGENTS.md` | Modify | Eight-tool native MCP smoke expectation |
| `docs/kb/omo-features/lsp-integration.md` | Modify | Local grouped tool and managed platform cleanup documentation |
| `docs/superpowers/specs/2026-07-20-symbol-related-lsp-design.md` | Track in final commit | Corrected approved behavior and lifecycle authority |
| `docs/superpowers/plans/2026-07-20-symbol-related-lsp.md` | Track in final commit | Executable TDD sequence and verification record |

`crates/ocmm-lsp/Cargo.toml` is deliberately absent from the File Map and final allowlist because it must not change.

## Requirement Coverage

| Requirement | Plan evidence |
|---|---|
| No dependency; private documented Kernel32 FFI | Task 1 Steps 2-5 and Task 3 manifest audit |
| Job configured before suspended spawn | Task 1 interfaces, implementation sequence, and suspended-launch test |
| Assignment before execution | Task 1 observing launch-ops test |
| Thread-only lookup/open/owner verification/resume count | Task 1 FFI/ops implementation and failure tests |
| Fail-closed startup | Task 1 assignment/owner/resume injected failures and bounded cleanup assertions |
| `.cmd` persistent descendant + unrelated sentinel | Task 1 Windows timeout-tree test |
| Natural wrapper exit with surviving descendant | Task 1 Job-close test |
| Natural/direct timeout tests remain | Task 1 cross-platform child-reaper tests |
| Existing grouped MCP behavior remains | Task 2 full named integration suite |
| Windows x64/arm64 ABI | Task 1 installed-x64 layout test plus 64-bit static assertions; Task 3 records the existing release matrix as Windows arm64 acceptance |
| Non-Windows cfg/direct cleanup | Task 1 source-level cfg split; Task 3 records the existing release matrix as non-Windows compile acceptance |
| Full gates and exact seven-file scope | Task 3 formatting/tests/build/smoke/scope audit |

## Dependency Order

1. Task 1 replaces the rejected process lifecycle primitive, routes `LspSession` through it, and proves the lifecycle independently.
2. Task 2 reruns the complete grouped MCP surface against that managed lifecycle.
3. Task 3 synchronizes direct documentation, runs installed-host/full gates, records existing eight-target workflow acceptance, audits manifests and the seven-file delta, then creates the sole commit only after authorization.

---

### Task 1: Build the Dependency-Free Managed Child and Windows Job Barrier

**Files:**
- Modify: `crates/ocmm-lsp/src/main.rs:178-355,1610-1655,1800-1812,2090-2410`
- Test: `crates/ocmm-lsp/src/main.rs` inline `#[cfg(test)]` module

**Interfaces:**
- Consumes: existing stable `Command`, `Child`, `prepared_command(&[String]) -> Result<(OsString, Vec<OsString>)>`, `LSP_EXIT_GRACE_MS`, `LSP_EXIT_POLL_MS`, and idempotent `LspSession::shutdown()` behavior.
- Produces: `ManagedChild { child: Child, #[cfg(windows)] job: Option<WindowsJob> }`; `ManagedChild::spawn(&mut Command) -> Result<ManagedChild>`; `OwnedWindowsHandle`; documented Job/thread FFI layouts; `WindowsJob::{create_kill_on_close, assign_child, terminate, close}`; narrow `WindowsLaunchOps`; `spawn_windows_managed_child_with_ops(&mut Command, &dyn WindowsLaunchOps) -> Result<ManagedChild>`; `wait_for_direct_child(&mut Child, Duration, Duration) -> Result<()>`; `reap_child_after_exit(&mut ManagedChild, Duration, Duration, Duration) -> Result<ChildReapOutcome>`; and `LspSession { child: ManagedChild, ... }` for Task 2 protocol regression.

- [ ] **Step 1: Confirm the correction baseline without changing production bytes**

Read:

```text
docs/superpowers/specs/2026-07-20-symbol-related-lsp-design.md
crates/ocmm-lsp/Cargo.toml
crates/ocmm-lsp/src/main.rs
crates/ocmm-lsp/tests/mcp_stdio.rs
crates/ocmm-lsp/tests/fixtures/mock_lsp.mjs
```

Run:

```powershell
git status --short
cargo test -p ocmm-lsp --bin ocmm-lsp child_reaper_ -- --nocapture
cargo test -p ocmm-lsp --test mcp_stdio find_symbol_related -- --nocapture
```

Expected: both commands exit 0 against the pending feature implementation, and the manifests are unchanged. The passing baseline does not approve the rejected Windows lifecycle. If another task modified a task-owned path, stop and report the overlap rather than overwriting it.

- [ ] **Step 2: Write RED tests for Windows ABI and the suspended launch barrier**

Add the following exact layout test in the inline test module:

```rust
#[cfg(all(windows, target_pointer_width = "64"))]
#[test]
fn windows_job_abi_layout_matches_supported_64_bit_windows() {
    use std::mem::{align_of, offset_of, size_of};

    assert_eq!(size_of::<JobObjectBasicLimitInformation>(), 64);
    assert_eq!(align_of::<JobObjectBasicLimitInformation>(), 8);
    assert_eq!(offset_of!(JobObjectBasicLimitInformation, limit_flags), 16);
    assert_eq!(offset_of!(JobObjectBasicLimitInformation, minimum_working_set_size), 24);
    assert_eq!(offset_of!(JobObjectBasicLimitInformation, maximum_working_set_size), 32);
    assert_eq!(offset_of!(JobObjectBasicLimitInformation, active_process_limit), 40);
    assert_eq!(offset_of!(JobObjectBasicLimitInformation, affinity), 48);
    assert_eq!(offset_of!(JobObjectBasicLimitInformation, priority_class), 56);
    assert_eq!(offset_of!(JobObjectBasicLimitInformation, scheduling_class), 60);

    assert_eq!(size_of::<IoCounters>(), 48);
    assert_eq!(align_of::<IoCounters>(), 8);
    assert_eq!(size_of::<JobObjectExtendedLimitInformation>(), 144);
    assert_eq!(align_of::<JobObjectExtendedLimitInformation>(), 8);
    assert_eq!(offset_of!(JobObjectExtendedLimitInformation, io_info), 64);
    assert_eq!(offset_of!(JobObjectExtendedLimitInformation, process_memory_limit), 112);
    assert_eq!(offset_of!(JobObjectExtendedLimitInformation, job_memory_limit), 120);
    assert_eq!(offset_of!(JobObjectExtendedLimitInformation, peak_process_memory_used), 128);
    assert_eq!(offset_of!(JobObjectExtendedLimitInformation, peak_job_memory_used), 136);

    assert_eq!(size_of::<ThreadEntry32>(), 28);
    assert_eq!(align_of::<ThreadEntry32>(), 4);
    assert_eq!(offset_of!(ThreadEntry32, size), 0);
    assert_eq!(offset_of!(ThreadEntry32, usage_count), 4);
    assert_eq!(offset_of!(ThreadEntry32, thread_id), 8);
    assert_eq!(offset_of!(ThreadEntry32, owner_process_id), 12);
    assert_eq!(offset_of!(ThreadEntry32, base_priority), 16);
    assert_eq!(offset_of!(ThreadEntry32, delta_priority), 20);
    assert_eq!(offset_of!(ThreadEntry32, flags), 24);
}
```

Add the Windows-only atomic import and these private test-operation types; they are the only injected Windows boundary:

```rust
#[cfg(windows)]
use std::sync::atomic::{AtomicU32, Ordering};

#[cfg(windows)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LaunchFailure {
    Assign,
    ThreadEnumeration,
    OwnerVerification,
    Resume,
}

#[cfg(windows)]
struct TestLaunchOps {
    real: Kernel32LaunchOps,
    marker: PathBuf,
    failure: Option<LaunchFailure>,
    child_pid: AtomicU32,
}

#[cfg(windows)]
impl TestLaunchOps {
    fn observing(marker: PathBuf) -> Self {
        Self {
            real: Kernel32LaunchOps,
            marker,
            failure: None,
            child_pid: AtomicU32::new(0),
        }
    }

    fn failing(marker: PathBuf, failure: LaunchFailure) -> Self {
        Self {
            real: Kernel32LaunchOps,
            marker,
            failure: Some(failure),
            child_pid: AtomicU32::new(0),
        }
    }
}

#[cfg(windows)]
impl WindowsLaunchOps for TestLaunchOps {
    fn assign_process(&self, job: &WindowsJob, child: &Child) -> std::io::Result<()> {
        self.child_pid.store(child.id(), Ordering::SeqCst);
        assert!(!self.marker.exists(), "child executed before assignment");
        if self.failure == Some(LaunchFailure::Assign) {
            return Err(std::io::Error::other("injected assignment failure"));
        }
        self.real.assign_process(job, child)
    }

    fn open_initial_thread(&self, child_pid: u32) -> std::io::Result<OwnedWindowsHandle> {
        if self.failure == Some(LaunchFailure::ThreadEnumeration) {
            return Err(std::io::Error::other("injected thread enumeration failure"));
        }
        self.real.open_initial_thread(child_pid)
    }

    fn thread_owner_pid(&self, thread: &OwnedWindowsHandle) -> std::io::Result<u32> {
        if self.failure == Some(LaunchFailure::OwnerVerification) {
            return Ok(self.child_pid.load(Ordering::SeqCst).wrapping_add(1));
        }
        self.real.thread_owner_pid(thread)
    }

    fn resume_thread(&self, thread: &OwnedWindowsHandle) -> std::io::Result<u32> {
        assert!(!self.marker.exists(), "child executed before resume");
        if self.failure == Some(LaunchFailure::Resume) {
            return Err(std::io::Error::other("injected resume failure"));
        }
        self.real.resume_thread(thread)
    }
}
```

Add a marker command and liveness helpers using Node only:

```rust
#[cfg(windows)]
fn marker_command(marker: &Path) -> Command {
    let mut command = Command::new("node");
    command
        .arg("-e")
        .arg("const fs=require('node:fs'); fs.writeFileSync(process.env.OCMM_MARKER,'ran'); process.stdout.write('started\\n'); process.stdin.once('data', data => { process.stdout.write(`echo:${data}`); process.exit(0); });")
        .env("OCMM_MARKER", marker)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    command
}

#[cfg(windows)]
fn node_reports_process_alive(pid: u32) -> bool {
    Command::new("node")
        .args(["-e", "try { process.kill(Number(process.argv[1]), 0); process.exit(0); } catch (error) { process.exit(error.code === 'ESRCH' ? 1 : 2); }"])
        .arg(pid.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .expect("run Node liveness probe")
        .success()
}

#[cfg(windows)]
fn wait_for_process_gone(pid: u32, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if !node_reports_process_alive(pid) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    !node_reports_process_alive(pid)
}

#[cfg(windows)]
fn unique_test_dir(label: &str) -> PathBuf {
    let root = temp_dir(&format!("ocmm-lsp-{label}"));
    fs::create_dir_all(&root).expect("create Windows lifecycle test directory");
    root
}

#[cfg(windows)]
fn wait_for_pid_file(path: &Path, timeout: Duration) -> u32 {
    let deadline = Instant::now() + timeout;
    loop {
        if let Ok(contents) = fs::read_to_string(path) {
            if let Ok(pid) = contents.trim().parse::<u32>() {
                return pid;
            }
        }
        assert!(Instant::now() < deadline, "timed out waiting for {}", path.display());
        std::thread::sleep(Duration::from_millis(10));
    }
}
```

Use the existing unique temporary-directory helper pattern and add the suspended launch test:

```rust
#[cfg(windows)]
#[test]
fn windows_job_suspended_launch_assigns_before_execution_and_preserves_pipes() {
    let root = unique_test_dir("suspended-launch");
    let marker = root.join("marker.txt");
    let ops = TestLaunchOps::observing(marker.clone());
    let mut command = marker_command(&marker);

    let mut managed = spawn_windows_managed_child_with_ops(&mut command, &ops)
        .expect("spawn assigned suspended child");
    let mut stdout = BufReader::new(managed.child.stdout.take().expect("piped stdout"));
    let mut started = String::new();
    stdout.read_line(&mut started).expect("read startup output");

    assert_eq!(started, "started\n");
    assert_eq!(fs::read_to_string(&marker).expect("read marker"), "ran");
    let stdin = managed.child.stdin.as_mut().expect("piped stdin");
    stdin.write_all(b"ping\n").expect("write ping");
    stdin.flush().expect("flush ping");
    let mut echoed = String::new();
    stdout.read_line(&mut echoed).expect("read echo");
    assert_eq!(echoed, "echo:ping\n");

    assert_eq!(
        reap_child_after_exit(
            &mut managed,
            Duration::from_secs(2),
            Duration::from_millis(10),
            Duration::from_secs(2),
        )
        .expect("reap child"),
        ChildReapOutcome::Exited
    );
    let _ = fs::remove_dir_all(root);
}
```

- [ ] **Step 3: Write RED failure, `.cmd` timeout-tree, and natural-wrapper tests**

Add one table-driven failure test. The injected assignment and resume branches return before invoking the real operation; the owner branch returns a mismatched owner. All three must leave the marker absent and the direct PID gone within two seconds:

```rust
#[cfg(windows)]
#[test]
fn windows_job_launch_failures_never_execute_child_and_cleanup_is_bounded() {
    for failure in [
        LaunchFailure::Assign,
        LaunchFailure::OwnerVerification,
        LaunchFailure::Resume,
    ] {
        let root = unique_test_dir(&format!("launch-failure-{failure:?}"));
        let marker = root.join("marker.txt");
        let ops = TestLaunchOps::failing(marker.clone(), failure);
        let mut command = marker_command(&marker);
        let started = Instant::now();

        let result = spawn_windows_managed_child_with_ops(&mut command, &ops);
        assert!(result.is_err(), "{failure:?} unexpectedly succeeded");
        let pid = ops.child_pid.load(Ordering::SeqCst);
        assert_ne!(pid, 0, "failure seam did not observe child PID");
        assert!(!marker.exists(), "{failure:?} executed child marker");
        assert!(wait_for_process_gone(pid, Duration::from_secs(2)));
        assert!(started.elapsed() < Duration::from_secs(3));
        let _ = fs::remove_dir_all(root);
    }
}
```

Replace the rejected Windows command-tree fixture/test with a real managed `.cmd` wrapper test. The wrapper launches persistent Node and writes only its Node PID for liveness assertion; the sentinel is spawned independently with plain `Command` and is cleaned through its owned `Child` handle:

```rust
#[cfg(windows)]
#[test]
fn windows_job_cmd_timeout_kills_descendant_reaps_wrapper_and_preserves_sentinel() {
    let root = unique_test_dir("cmd-timeout");
    let wrapper = root.join("persistent-server.cmd");
    let pid_file = root.join("descendant.pid");
    fs::write(
        &wrapper,
        "@echo off\r\nnode -e \"require('node:fs').writeFileSync(process.env.OCMM_PID_FILE,String(process.pid)); setInterval(function(){},1000);\"\r\n",
    )
    .expect("write cmd wrapper");

    let mut sentinel = spawn_node_child("setInterval(() => {}, 1000);");
    let words = vec![wrapper.to_string_lossy().to_string()];
    let (program, args) = prepared_command(&words).expect("prepare cmd wrapper");
    let mut command = Command::new(program);
    command
        .args(args)
        .env("OCMM_PID_FILE", &pid_file)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut managed = ManagedChild::spawn(&mut command).expect("spawn managed cmd wrapper");
    let descendant_pid = wait_for_pid_file(&pid_file, Duration::from_secs(3));
    let started = Instant::now();

    assert_eq!(
        reap_child_after_exit(
            &mut managed,
            Duration::from_millis(80),
            Duration::from_millis(10),
            Duration::from_secs(2),
        )
        .expect("timeout cleanup"),
        ChildReapOutcome::KilledAfterTimeout
    );
    assert!(managed.child.try_wait().expect("direct status").is_some());
    assert!(wait_for_process_gone(descendant_pid, Duration::from_secs(2)));
    assert!(sentinel.try_wait().expect("sentinel status").is_none());
    assert!(started.elapsed() < Duration::from_secs(5));

    sentinel.kill().expect("kill sentinel");
    sentinel.wait().expect("reap sentinel");
    let _ = fs::remove_dir_all(root);
}
```

Add a natural-wrapper test. The root Node process spawns an ordinary child without a breakaway option, writes its PID, unrefs it, and exits; `reap_child_after_exit()` observes the natural root exit and closes the Job:

```rust
#[cfg(windows)]
#[test]
fn windows_job_natural_wrapper_exit_closes_job_and_kills_descendant() {
    let root = unique_test_dir("natural-wrapper");
    let pid_file = root.join("descendant.pid");
    let mut command = Command::new("node");
    command
        .args(["-e", "const fs=require('node:fs'); const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(() => {}, 1000)'],{stdio:'ignore'}); fs.writeFileSync(process.env.OCMM_PID_FILE,String(child.pid)); child.unref();"])
        .env("OCMM_PID_FILE", &pid_file)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut managed = ManagedChild::spawn(&mut command).expect("spawn managed wrapper");
    let descendant_pid = wait_for_pid_file(&pid_file, Duration::from_secs(3));
    assert!(node_reports_process_alive(descendant_pid));

    assert_eq!(
        reap_child_after_exit(
            &mut managed,
            Duration::from_secs(2),
            Duration::from_millis(10),
            Duration::from_secs(2),
        )
        .expect("natural wrapper cleanup"),
        ChildReapOutcome::Exited
    );
    assert!(managed.child.try_wait().expect("wrapper status").is_some());
    assert!(wait_for_process_gone(descendant_pid, Duration::from_secs(2)));
    let _ = fs::remove_dir_all(root);
}
```

Keep and adapt the existing `child_reaper_allows_natural_exit_before_deadline` and `child_reaper_kills_and_reaps_only_after_timeout` tests to construct `ManagedChild::spawn()` and pass `Duration::from_secs(2)` as the fourth reaper argument. These two tests remain cross-platform and continue asserting `Exited`, `KilledAfterTimeout`, the grace lower bound, upper bound, and a reaped direct child.

- [ ] **Step 4: Run the focused tests and verify RED**

Run:

```powershell
cargo test -p ocmm-lsp --bin ocmm-lsp windows_job_ -- --nocapture
cargo test -p ocmm-lsp --bin ocmm-lsp child_reaper_ -- --nocapture
```

Expected: Windows compilation fails because the Job ABI types, `ManagedChild`, `WindowsLaunchOps`, and managed reaper signature do not exist. On non-Windows, the adapted child-reaper tests fail for the missing `ManagedChild`. Correct only test syntax/environment issues before production changes.

- [ ] **Step 5: Replace the rejected lifecycle block with the exact Job/thread FFI boundary**

Under `#[cfg(windows)]`, define these constants and C layouts:

```rust
type WindowsHandle = *mut std::ffi::c_void;

const INVALID_HANDLE_VALUE: WindowsHandle = -1_isize as WindowsHandle;
const CREATE_SUSPENDED: u32 = 0x0000_0004;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: i32 = 9;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;
const TH32CS_SNAPTHREAD: u32 = 0x0000_0004;
const THREAD_SUSPEND_RESUME: u32 = 0x0002;
const THREAD_QUERY_LIMITED_INFORMATION: u32 = 0x0800;
const RESUME_THREAD_FAILED: u32 = u32::MAX;
const ERROR_NO_MORE_FILES: i32 = 18;

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

Add compile-time assertions for both supported 64-bit Windows ABIs:

```rust
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 64] = [(); std::mem::size_of::<JobObjectBasicLimitInformation>()];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 8] = [(); std::mem::align_of::<JobObjectBasicLimitInformation>()];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 48] = [(); std::mem::size_of::<IoCounters>()];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 8] = [(); std::mem::align_of::<IoCounters>()];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 144] = [(); std::mem::size_of::<JobObjectExtendedLimitInformation>()];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 8] = [(); std::mem::align_of::<JobObjectExtendedLimitInformation>()];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 16] = [(); std::mem::offset_of!(JobObjectBasicLimitInformation, limit_flags)];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 24] = [(); std::mem::offset_of!(JobObjectBasicLimitInformation, minimum_working_set_size)];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 32] = [(); std::mem::offset_of!(JobObjectBasicLimitInformation, maximum_working_set_size)];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 40] = [(); std::mem::offset_of!(JobObjectBasicLimitInformation, active_process_limit)];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 48] = [(); std::mem::offset_of!(JobObjectBasicLimitInformation, affinity)];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 56] = [(); std::mem::offset_of!(JobObjectBasicLimitInformation, priority_class)];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 60] = [(); std::mem::offset_of!(JobObjectBasicLimitInformation, scheduling_class)];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 64] = [(); std::mem::offset_of!(JobObjectExtendedLimitInformation, io_info)];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 112] = [(); std::mem::offset_of!(JobObjectExtendedLimitInformation, process_memory_limit)];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 120] = [(); std::mem::offset_of!(JobObjectExtendedLimitInformation, job_memory_limit)];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 128] = [(); std::mem::offset_of!(JobObjectExtendedLimitInformation, peak_process_memory_used)];
#[cfg(all(windows, target_pointer_width = "64"))]
const _: [(); 136] = [(); std::mem::offset_of!(JobObjectExtendedLimitInformation, peak_job_memory_used)];
#[cfg(windows)]
const _: [(); 28] = [(); std::mem::size_of::<ThreadEntry32>()];
#[cfg(windows)]
const _: [(); 4] = [(); std::mem::align_of::<ThreadEntry32>()];
#[cfg(windows)]
const _: [(); 0] = [(); std::mem::offset_of!(ThreadEntry32, size)];
#[cfg(windows)]
const _: [(); 4] = [(); std::mem::offset_of!(ThreadEntry32, usage_count)];
#[cfg(windows)]
const _: [(); 8] = [(); std::mem::offset_of!(ThreadEntry32, thread_id)];
#[cfg(windows)]
const _: [(); 12] = [(); std::mem::offset_of!(ThreadEntry32, owner_process_id)];
#[cfg(windows)]
const _: [(); 16] = [(); std::mem::offset_of!(ThreadEntry32, base_priority)];
#[cfg(windows)]
const _: [(); 20] = [(); std::mem::offset_of!(ThreadEntry32, delta_priority)];
#[cfg(windows)]
const _: [(); 24] = [(); std::mem::offset_of!(ThreadEntry32, flags)];
```

Declare only this Kernel32 surface:

```rust
#[link(name = "kernel32")]
unsafe extern "system" {
    #[link_name = "CreateJobObjectW"]
    fn create_job_object_w(attributes: *const std::ffi::c_void, name: *const u16) -> WindowsHandle;
    #[link_name = "SetInformationJobObject"]
    fn set_information_job_object(job: WindowsHandle, class: i32, information: *mut std::ffi::c_void, length: u32) -> i32;
    #[link_name = "AssignProcessToJobObject"]
    fn assign_process_to_job_object(job: WindowsHandle, process: WindowsHandle) -> i32;
    #[link_name = "TerminateJobObject"]
    fn terminate_job_object(job: WindowsHandle, exit_code: u32) -> i32;
    #[link_name = "CreateToolhelp32Snapshot"]
    fn create_toolhelp32_snapshot(flags: u32, process_id: u32) -> WindowsHandle;
    #[link_name = "Thread32First"]
    fn thread32_first(snapshot: WindowsHandle, entry: *mut ThreadEntry32) -> i32;
    #[link_name = "Thread32Next"]
    fn thread32_next(snapshot: WindowsHandle, entry: *mut ThreadEntry32) -> i32;
    #[link_name = "OpenThread"]
    fn open_thread(access: u32, inherit_handle: i32, thread_id: u32) -> WindowsHandle;
    #[link_name = "GetProcessIdOfThread"]
    fn get_process_id_of_thread(thread: WindowsHandle) -> u32;
    #[link_name = "ResumeThread"]
    fn resume_thread(thread: WindowsHandle) -> u32;
    #[link_name = "CloseHandle"]
    fn close_handle(handle: WindowsHandle) -> i32;
}
```

Implement `OwnedWindowsHandle` as a non-`Clone`, non-`Copy` owner that validates null/sentinel results, exposes `raw(&self) -> WindowsHandle`, and calls `CloseHandle` once in `Drop`. Capture `std::io::Error::last_os_error()` immediately after failed Win32 calls.

Implement `WindowsJob` exactly as specified by the design:

```rust
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

`create_kill_on_close()` must call `CreateJobObjectW(NULL, NULL)`, zero-initialize `JobObjectExtendedLimitInformation`, set only `basic_limit_information.limit_flags`, and call `SetInformationJobObject` before returning. `assign_child()` imports `std::os::windows::io::AsRawHandle` and passes `child.as_raw_handle()` to `AssignProcessToJobObject`. `close()` calls `self.handle.take()`.

- [ ] **Step 6: Implement the narrow launch operations and fail-closed spawn sequence**

Add the exact interface:

```rust
#[cfg(windows)]
trait WindowsLaunchOps {
    fn assign_process(&self, job: &WindowsJob, child: &Child) -> std::io::Result<()>;
    fn open_initial_thread(&self, child_pid: u32) -> std::io::Result<OwnedWindowsHandle>;
    fn thread_owner_pid(&self, thread: &OwnedWindowsHandle) -> std::io::Result<u32>;
    fn resume_thread(&self, thread: &OwnedWindowsHandle) -> std::io::Result<u32>;
}

#[cfg(windows)]
struct Kernel32LaunchOps;
```

`Kernel32LaunchOps::open_initial_thread()` must:

1. call `CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0)` and own the snapshot;
2. initialize `ThreadEntry32.size` to `size_of::<ThreadEntry32>() as u32`;
3. enumerate `Thread32First/Next`, capturing `last_os_error()` immediately after a zero `Thread32Next` result, treating only OS error 18 as normal end-of-enumeration and returning every other error;
4. collect exactly one `thread_id` whose `owner_process_id == child_pid`, failing on zero or multiple matches;
5. call `OpenThread(THREAD_SUSPEND_RESUME | THREAD_QUERY_LIMITED_INFORMATION, 0, thread_id)` and return the owned handle.

`thread_owner_pid()` calls `GetProcessIdOfThread` and treats zero as failure. `resume_thread()` calls `ResumeThread` and treats `u32::MAX` as failure.

Define the all-platform owner:

```rust
struct ManagedChild {
    child: Child,
    #[cfg(windows)]
    job: Option<WindowsJob>,
}

impl ManagedChild {
    fn spawn(command: &mut Command) -> Result<Self> {
        #[cfg(windows)]
        {
            return spawn_windows_managed_child_with_ops(command, &Kernel32LaunchOps);
        }
        #[cfg(not(windows))]
        {
            let child = command.spawn()?;
            Ok(Self { child })
        }
    }
}
```

Implement the Windows function with this exact order and error policy:

```rust
#[cfg(windows)]
fn spawn_windows_managed_child_with_ops(
    command: &mut Command,
    ops: &dyn WindowsLaunchOps,
) -> Result<ManagedChild>;
```

1. `WindowsJob::create_kill_on_close()`.
2. `CommandExt::creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED)`.
3. `command.spawn()`.
4. `ops.assign_process(&job, &child)`; set `assigned = true` only after success.
5. `ops.open_initial_thread(child.id())`.
6. `ops.thread_owner_pid(&thread)` and exact equality with `child.id()`.
7. `ops.resume_thread(&thread)` and exact equality with `1`.
8. Return `ManagedChild { child, job: Some(job) }`.

For every error after spawn, retain the primary operation error, call `job.terminate()` only when `assigned`, call `child.kill()` in all cases, bound `try_wait()` reaping to `LSP_TERMINATION_WAIT_MS`, then close/drop all handles. Append cleanup failures as context but never replace the primary startup error. No failure branch after assignment/owner verification may call the real resume operation.

- [ ] **Step 7: Implement bounded natural/timeout cleanup for both platform branches**

Add:

```rust
const LSP_TERMINATION_WAIT_MS: u64 = 2_000;

fn wait_for_direct_child(
    child: &mut Child,
    timeout: Duration,
    poll_interval: Duration,
) -> Result<()>;

fn reap_child_after_exit(
    child: &mut ManagedChild,
    grace: Duration,
    poll_interval: Duration,
    termination_wait: Duration,
) -> Result<ChildReapOutcome>;
```

`wait_for_direct_child()` polls `try_wait()` until `Some(status)` or deadline; it returns a descriptive timeout error and never calls unbounded `wait()` while the process is still live.

`reap_child_after_exit()` must implement:

- natural direct exit: call cached `wait()`, then on Windows `child.job.take()` so final Job close kills any remaining ordinary descendant; return `Exited`;
- grace timeout on Windows: call `job.terminate()`, call `child.child.kill()` as fallback, close the Job with `take()`, then call `wait_for_direct_child()`; return `KilledAfterTimeout` only after reap;
- grace timeout on non-Windows: call `child.child.kill()`, then `wait_for_direct_child()`; return `KilledAfterTimeout` only after reap;
- all branches aggregate a Win32/direct-kill error only after remaining cleanup actions execute.

Update the two existing cross-platform child-reaper tests to use this signature. Do not retain a separate Windows production cleanup path outside `ManagedChild`.

In the same step, complete the mechanical session wiring required for the binary to compile: change `LspSession.child` from `Child` to `ManagedChild`; remove the local Windows `creation_flags` block from `LspSession::for_file()`; call `ManagedChild::spawn(&mut command)`; take stdin/stdout through `child.child.stdin` and `child.child.stdout`; and call the four-argument reaper from `shutdown()` with `Duration::from_millis(LSP_TERMINATION_WAIT_MS)`. Keep `closed = true` before protocol shutdown and keep `Drop for LspSession` calling `shutdown()`. Task 2 verifies this wiring through the full protocol surface rather than introducing a second ownership change.

- [ ] **Step 8: Run focused Task 1 tests and verify GREEN**

Run:

```powershell
cargo fmt --package ocmm-lsp
cargo test -p ocmm-lsp --bin ocmm-lsp windows_job_abi_layout_matches_supported_64_bit_windows -- --nocapture
cargo test -p ocmm-lsp --bin ocmm-lsp windows_job_suspended_launch_assigns_before_execution_and_preserves_pipes -- --nocapture
cargo test -p ocmm-lsp --bin ocmm-lsp windows_job_launch_failures_never_execute_child_and_cleanup_is_bounded -- --nocapture
cargo test -p ocmm-lsp --bin ocmm-lsp windows_job_cmd_timeout_kills_descendant_reaps_wrapper_and_preserves_sentinel -- --nocapture
cargo test -p ocmm-lsp --bin ocmm-lsp windows_job_natural_wrapper_exit_closes_job_and_kills_descendant -- --nocapture
cargo test -p ocmm-lsp --bin ocmm-lsp child_reaper_ -- --nocapture
```

Expected on Windows: all named tests pass, the `.cmd` and failure tests each finish in under 5 seconds, direct children are reaped, descendants are gone, and the independent sentinel survives until explicit test cleanup. Expected on non-Windows: the two `child_reaper_*` tests pass and Windows tests are cfg-excluded. Do not commit.

---

### Task 2: Verify Managed LspSession Cleanup Across the Full Grouped MCP Surface

**Files:**
- Verify: `crates/ocmm-lsp/src/main.rs:1610-1812`
- Modify only if an assertion is missing: `crates/ocmm-lsp/tests/mcp_stdio.rs:1-475`
- Verify: `crates/ocmm-lsp/tests/fixtures/mock_lsp.mjs`
- Test: `crates/ocmm-lsp/src/main.rs` inline tests and `crates/ocmm-lsp/tests/mcp_stdio.rs`

**Interfaces:**
- Consumes: Task 1 `LspSession { child: ManagedChild, ... }`, `ManagedChild::spawn()`, `reap_child_after_exit(&mut ManagedChild, Duration, Duration, Duration) -> Result<ChildReapOutcome>`, Job RAII, structured `LspRequestError`, and existing grouped-tool helpers.
- Produces: protocol-level evidence for stable piped stdin/stdout, idempotent shutdown with Job retention during grace, all existing structured-error/normalizer behavior, all existing grouped MCP tests (success, alias, normalization, unsupported, partial error, malformed error, all error, cleanup after group error, ignore-exit timeout), and unchanged non-Windows contracts.

- [ ] **Step 1: Retain the integration assertions for the managed session**

Keep the existing mock fixture scenarios and these exact integration test names:

```text
find_symbol_related_uses_one_session_and_returns_all_groups
find_symbol_related_alias_dispatches_to_grouped_tool
find_symbol_related_deduplicates_and_normalizes_location_links
find_symbol_related_classifies_method_not_found_as_unsupported
find_symbol_related_keeps_partial_errors_below_top_level
find_symbol_related_keeps_only_inner_malformed_error_data
find_symbol_related_marks_three_errors_as_top_level_error
find_symbol_related_shuts_down_after_group_error
find_symbol_related_kills_server_that_ignores_exit_after_grace_period
```

The success test must continue asserting one initialize/open, ordered definition → implementation → references, implementation link support, zero-based LSP line, unchanged character, `includeDeclaration: true`, exact grouped item counts, and deterministic text. The cleanup-after-error test must continue asserting exactly one `shutdown` and one `exit`. For the ignore-exit test, have the fixture add `observedAtMs: Date.now()` to each trace entry and assert that response completion occurs at least 400 ms and less than 5 seconds after the traced `exit`; this isolates the cleanup bound from concurrent Node cold-start delay. Keep a separate 20-second total-invocation safety bound.

Keep the inline tests for response/client/malformed errors, legacy error text, and stable/group-local location normalization. Do not weaken or delete any existing natural/direct timeout/grouped assertion while changing process ownership.

- [ ] **Step 2: Run the grouped suite against the managed session**

Run:

```powershell
cargo test -p ocmm-lsp --test mcp_stdio find_symbol_related -- --nocapture
```

Expected: all nine named integration tests pass. The success path proves piped stdio and one-session ordering after suspended launch; cleanup/error paths prove the managed lifecycle does not alter the grouped result contract.

- [ ] **Step 3: Verify LspSession has one managed ownership path**

Confirm the field is:

```rust
struct LspSession {
    child: ManagedChild,
    stdin: ChildStdin,
    receiver: Receiver<Value>,
    next_id: u64,
    file_path: PathBuf,
    root: PathBuf,
    server: LspServer,
    diagnostics: HashMap<String, Vec<Value>>,
    closed: bool,
}
```

Confirm `LspSession::for_file()` preserves `prepared_command()`, arguments, current directory, environment, and piped stdio; contains no local Windows `creation_flags` block; and uses this sole spawn path:

```rust
let mut command = Command::new(program);
command.args(args).current_dir(&root);
command
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
command.envs(&server.env);

let mut child = ManagedChild::spawn(&mut command)
    .with_context(|| format!("failed to spawn {}", server.command.join(" ")))?;
let stdin = child
    .child
    .stdin
    .take()
    .ok_or_else(|| anyhow!("language server stdin unavailable"))?;
let stdout = child
    .child
    .stdout
    .take()
    .ok_or_else(|| anyhow!("language server stdout unavailable"))?;
```

If either pipe extraction fails, returning from `for_file()` drops `ManagedChild`; Windows Job close kills the suspended/assigned process. Do not duplicate Job handles into `LspSession`. If the source does not match this exact wiring, correct it before continuing and rerun Step 2.

- [ ] **Step 4: Verify idempotent shutdown retains and finalizes the Job correctly**

Confirm `closed = true` precedes protocol shutdown and the reaper call is:

```rust
fn shutdown(&mut self) {
    if self.closed {
        return;
    }
    self.closed = true;
    let _ = self.request_legacy("shutdown", json!(null));
    let _ = self.notify("exit", json!(null));
    let _ = reap_child_after_exit(
        &mut self.child,
        Duration::from_millis(LSP_EXIT_GRACE_MS),
        Duration::from_millis(LSP_EXIT_POLL_MS),
        Duration::from_millis(LSP_TERMINATION_WAIT_MS),
    );
}
```

Keep `Drop for LspSession` calling `shutdown()`. After reaping, `ManagedChild.job` must be `None`; a second explicit shutdown/drop remains a no-op. If the source does not match, correct it and rerun Step 2.

- [ ] **Step 5: Run all Task 2 regression and protocol tests**

Run:

```powershell
cargo fmt --package ocmm-lsp
cargo test -p ocmm-lsp --bin ocmm-lsp lsp_response_error -- --nocapture
cargo test -p ocmm-lsp --bin ocmm-lsp lsp_request_error -- --nocapture
cargo test -p ocmm-lsp --bin ocmm-lsp legacy_request_error -- --nocapture
cargo test -p ocmm-lsp --bin ocmm-lsp normalize_locations_is_stable_and_group_local -- --nocapture
cargo test -p ocmm-lsp --bin ocmm-lsp child_reaper_ -- --nocapture
cargo test -p ocmm-lsp --bin ocmm-lsp windows_job_ -- --nocapture
cargo test -p ocmm-lsp --test mcp_stdio find_symbol_related -- --nocapture
cargo test -p ocmm-lsp
```

Expected: all structured error/legacy/normalizer tests pass; natural/direct timeout and every Windows Job test pass; all nine named grouped integration tests pass; the full Rust package is green. On natural mock exit, traces end `shutdown`, `exit`; on ignore-exit, response returns 400 ms or more and under 5 seconds after the fixture traces `exit`, while the complete invocation remains under 20 seconds. Do not commit.

---

### Task 3: Synchronize Documentation, Run Installed-Host/Full Gates, and Create the Sole Authorized Commit

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/kb/omo-features/lsp-integration.md`
- Verify/commit: the exact seven paths in the File Map

**Interfaces:**
- Consumes: complete green behavior from Tasks 1-2 and the corrected design/plan.
- Produces: accurate eight-tool/platform-lifecycle documentation, installed Windows x64 host evidence, a recorded eight-target release-workflow acceptance responsibility, all repository gates, exact eight-tool smoke output, an audited seven-file delta with unchanged Cargo manifests, and (only after explicit authorization) one semantic commit `feat(lsp): add related symbol lookup`.

- [ ] **Step 1: Update direct documentation without expanding scope**

In `AGENTS.md`, keep the native MCP smoke expectation as:

```markdown
Should list the eight primary LSP tools: `status`, `diagnostics`, `goto_definition`, `find_references`, `find_symbol_related`, `symbols`, `prepare_rename`, and `rename`.
```

In `docs/kb/omo-features/lsp-integration.md`, preserve the historical seven upstream contracts and document the local grouped tool. Replace generic lifecycle text with:

```markdown
`find_symbol_related` accepts `filePath`, one-based `line`, and zero-based
`character`. One fresh session requests definition, implementation, and
references in order. Each group returns `status: ok|unsupported|error`,
canonical URI/range `items`, and structured `code`/`message`/`data` when
applicable. JSON-RPC `-32601` is `unsupported`; locations are deduplicated
within each group; `LocationLink` prefers `targetSelectionRange` and falls back
to `targetRange`.

On Windows, the server starts suspended, is assigned to an already configured
unnamed `KILL_ON_JOB_CLOSE` Job Object, and is resumed only after its initial
thread owner is verified. Shutdown retains the Job during the bounded graceful
wait and terminates or closes it before return so ordinary descendants cannot
survive. Other platforms retain bounded direct-child cleanup. No daemon or new
runtime dependency is required.
```

- [ ] **Step 2: Format and run focused/full repository gates**

Run in order:

```powershell
cargo fmt --package ocmm-lsp
cargo fmt --check --package ocmm-lsp
cargo test -p ocmm-lsp --bin ocmm-lsp child_reaper_ -- --nocapture
cargo test -p ocmm-lsp --bin ocmm-lsp windows_job_ -- --nocapture
cargo test -p ocmm-lsp --test mcp_stdio find_symbol_related -- --nocapture
cargo test -p ocmm-lsp
pnpm run typecheck
pnpm test
pnpm run build
```

Expected: formatting exits 0; all targeted/full Rust tests pass; TypeScript typecheck passes; `pnpm test` passes Node and Cargo lanes; build produces TypeScript output and native LSP binaries without errors.

- [ ] **Step 3: Check the installed Windows x64 host and record release-matrix acceptance**

Run only the installed host target:

```powershell
cargo check -p ocmm-lsp --all-targets --target x86_64-pc-windows-msvc
cargo build -p ocmm-lsp --target x86_64-pc-windows-msvc
```

Expected local evidence: the host check and build exit 0 and compile the Windows x64 ABI/layout tests plus all cfg-visible targets. Do not run or require checks for targets that are not already the host target, and do not request target installation.

Record this explicit release-gate acceptance item in the execution receipt (without claiming it ran locally): the existing eight-target native matrix in `.github/workflows/release.yml` must compile the cfg-gated implementation when that workflow next runs. Its Windows x64/arm64 jobs compile the 64-bit static layout assertions; its non-Windows jobs compile only the `cfg(not(windows))` direct-child path. A future workflow failure on any of those targets blocks release.

- [ ] **Step 4: Smoke-test the built MCP surface**

Run:

```powershell
$response = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist\cli\ocmm-lsp.js mcp | ConvertFrom-Json
$names = @($response.result.tools | ForEach-Object { $_.name })
$expected = @("status", "diagnostics", "goto_definition", "find_references", "find_symbol_related", "symbols", "prepare_rename", "rename")
$missing = @($expected | Where-Object { $_ -notin $names })
if ($missing.Count -ne 0) { throw "Missing MCP tools: $($missing -join ', ')" }
if ($names.Count -ne 8) { throw "Expected 8 canonical MCP tools, got $($names.Count): $($names -join ', ')" }
$names
```

Expected: exactly the eight canonical names; alias behavior remains covered by integration tests.

- [ ] **Step 5: Audit forbidden lifecycle remnants, manifests, markers, and exact scope**

Run:

```powershell
$lifecycleScanPaths = @(
  "crates/ocmm-lsp/src/main.rs",
  "docs/superpowers/specs/2026-07-20-symbol-related-lsp-design.md",
  "docs/superpowers/plans/2026-07-20-symbol-related-lsp.md"
)
$forbidden = @(
  ("TH32CS_" + "SNAPPROCESS"),
  ("Process32" + "First"),
  ("Process32" + "Next"),
  ("Open" + "Process"),
  ("Terminate" + "Process"),
  ("task" + "kill"),
  ("NtResume" + "Process"),
  ("CREATE_BREAKAWAY_" + "FROM_JOB"),
  ("direct child" + "-only")
)
foreach ($term in $forbidden) {
  rg -n -i --fixed-strings $term $lifecycleScanPaths
  if ($LASTEXITCODE -eq 0) { throw "Rejected lifecycle term remains: $term" }
  if ($LASTEXITCODE -ne 1) { throw "Lifecycle scan failed for: $term" }
}

$markerPattern = ("T" + "BD|T" + "ODO|PLACE" + "HOLDER")
rg -n $markerPattern "docs/superpowers/specs/2026-07-20-symbol-related-lsp-design.md" "docs/superpowers/plans/2026-07-20-symbol-related-lsp.md"
if ($LASTEXITCODE -eq 0) { throw "Unresolved planning marker found" }
if ($LASTEXITCODE -ne 1) { throw "Marker scan failed" }

git diff --exit-code -- "Cargo.toml" "Cargo.lock" "crates/ocmm-lsp/Cargo.toml"
if ($LASTEXITCODE -ne 0) { throw "Cargo manifests/lockfile changed despite the no-dependency decision" }

$allowed = @(
  "AGENTS.md",
  "crates/ocmm-lsp/src/main.rs",
  "crates/ocmm-lsp/tests/fixtures/mock_lsp.mjs",
  "crates/ocmm-lsp/tests/mcp_stdio.rs",
  "docs/kb/omo-features/lsp-integration.md",
  "docs/superpowers/plans/2026-07-20-symbol-related-lsp.md",
  "docs/superpowers/specs/2026-07-20-symbol-related-lsp-design.md"
)
$changed = @(git status --short | ForEach-Object { $_.Substring(3).Replace('\', '/') })
$taskChanged = @($changed | Where-Object { $_ -in $allowed })
$missingAllowed = @($allowed | Where-Object { $_ -notin $taskChanged })
if ($missingAllowed.Count -ne 0) { throw "Expected task paths missing: $($missingAllowed -join ', ')" }
$unrelated = @($changed | Where-Object { $_ -notin $allowed })
if ($unrelated.Count -ne 0) { "Unrelated paths left untouched: $($unrelated -join ', ')" }
git diff --check
git status --short
```

Expected: every exact forbidden term is absent from production source and both planning artifacts while allowed `TH32CS_SNAPTHREAD`, `Thread32First/Next`, `OpenThread`, and `TerminateJobObject` remain; marker scan returns ripgrep exit 1; manifests/lockfile are unchanged; all seven allowlisted paths are present; unrelated work is printed and left untouched; diff whitespace checks pass.

- [ ] **Step 6: Stage and commit only after explicit Git-write authorization**

After every prior check is green and the user explicitly authorizes the Git write in the execution conversation, run:

```powershell
git add -- "AGENTS.md" "crates/ocmm-lsp/src/main.rs" "crates/ocmm-lsp/tests/fixtures/mock_lsp.mjs" "crates/ocmm-lsp/tests/mcp_stdio.rs" "docs/kb/omo-features/lsp-integration.md" "docs/superpowers/plans/2026-07-20-symbol-related-lsp.md" "docs/superpowers/specs/2026-07-20-symbol-related-lsp-design.md"
$staged = @(git diff --cached --name-only)
$expectedStaged = @(
  "AGENTS.md",
  "crates/ocmm-lsp/src/main.rs",
  "crates/ocmm-lsp/tests/fixtures/mock_lsp.mjs",
  "crates/ocmm-lsp/tests/mcp_stdio.rs",
  "docs/kb/omo-features/lsp-integration.md",
  "docs/superpowers/plans/2026-07-20-symbol-related-lsp.md",
  "docs/superpowers/specs/2026-07-20-symbol-related-lsp-design.md"
)
$stageDiff = @(Compare-Object -ReferenceObject ($expectedStaged | Sort-Object) -DifferenceObject ($staged | Sort-Object))
if ($stageDiff.Count -ne 0) { throw "Staged path mismatch: $($stageDiff | Out-String)" }
git diff --cached --check
git commit -m "feat(lsp): add related symbol lookup" -m "Add grouped symbol lookup and race-safe Windows Job Object lifecycle management."
```

Expected: one commit contains exactly the seven paths. Do not push, tag, or create an intermediate/follow-up commit.

---

## Execution and Review Boundaries

1. Obtain a fresh passing receipt for this exact revision before Task 1; status is `waiting for fresh receipt`.
2. Task 1 must pass independently after changing `LspSession` ownership; Task 2 then verifies the grouped protocol surface without introducing a second ownership path.
3. Task 2 must preserve every structured-error, normalizer, natural/direct timeout, and grouped integration assertion.
4. Task 3 runs formatting, the installed Windows x64 host check, full repository gates, real-surface smoke, and manifest/scope audits after final bytes settle; the existing eight-target workflow remains a recorded release gate rather than local evidence.
5. The exact seven-file audit must pass before staging.
6. A Git write requires explicit execution-time authorization; no push, tag, release, or extra commit is in scope.

## Agent-Executable QA Evidence

The handoff is complete only when it records:

- RED output for missing Job/managed-child interfaces before lifecycle implementation;
- GREEN local output for Windows x64 ABI layout, suspended launch, assignment/thread-enumeration/owner/resume failures, `.cmd` descendant cleanup with live sentinel, natural-wrapper Job close, and host natural/direct reaping;
- GREEN output for structured errors, normalization, and all nine grouped integration tests;
- `cargo fmt --check`, installed-host `cargo check -p ocmm-lsp --all-targets --target x86_64-pc-windows-msvc`, `cargo build -p ocmm-lsp --target x86_64-pc-windows-msvc`, `cargo test -p ocmm-lsp`, `pnpm run typecheck`, `pnpm test`, and `pnpm run build` success;
- an explicit receipt note that Windows arm64 and non-Windows compilation remains acceptance work for the existing eight-target release workflow and is not claimed as local evidence;
- built MCP output containing exactly eight canonical names;
- clean Cargo manifest/lockfile diff evidence;
- exact seven-file scope evidence with unrelated dirty paths untouched;
- current plan-review receipt status and, if authorized later, the single commit hash/title.

## Self-Review Mapping

- Every authoritative Windows launch/cleanup decision maps to Task 1 Steps 2-8.
- Every existing Symbol-Related behavior and regression maps to Task 2 Steps 1-5.
- Installed-host cfg/ABI checks, eight-target release acceptance, full gates, no dependency, seven-file scope, and receipt/commit controls map to Task 3.
- Type/signature names are consistent with the design: `ManagedChild`, `WindowsJob`, `WindowsLaunchOps`, `OwnedWindowsHandle`, `spawn_windows_managed_child_with_ops`, `wait_for_direct_child`, and four-argument `reap_child_after_exit`.
- The prior receipt is invalid and the current status remains `waiting for fresh receipt`.
