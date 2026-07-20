use anyhow::{anyhow, bail, Context, Result};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::env;
use std::ffi::OsString;
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::time::{Duration, Instant};

const SERVER_NAME: &str = "ocmm-lsp";
const SERVER_VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_REQUEST_TIMEOUT_MS: u64 = 15_000;
const DIAGNOSTICS_WAIT_MS: u64 = 1_200;
const LSP_CLIENT_ERROR_CODE: i64 = -32000;
const LSP_EXIT_GRACE_MS: u64 = 500;
const LSP_EXIT_POLL_MS: u64 = 10;
const LSP_TERMINATION_WAIT_MS: u64 = 2_000;

#[derive(Clone, Copy)]
enum WireMode {
    Line,
    Framed,
}

#[derive(Debug, Clone)]
struct LspServer {
    id: String,
    command: Vec<String>,
    extensions: Vec<String>,
    priority: i64,
    env: HashMap<String, String>,
    initialization: Option<Value>,
    source: &'static str,
}

#[derive(Debug, Clone)]
struct ToolOutput {
    text: String,
    is_error: bool,
    details: Option<Value>,
}

#[derive(Debug, Clone, PartialEq)]
struct LspErrorDetails {
    code: i64,
    message: String,
    data: Option<Value>,
}

impl LspErrorDetails {
    fn from_response(response: &Value) -> Self {
        let error = response.get("error").unwrap_or(response);
        let code = error.get("code").and_then(Value::as_i64);
        let message = error.get("message").and_then(Value::as_str);
        match (code, message) {
            (Some(code), Some(message)) => Self {
                code,
                message: message.to_string(),
                data: error.get("data").cloned(),
            },
            _ => Self {
                code: -32603,
                message: format!("Malformed LSP JSON-RPC error response: {error}"),
                data: Some(error.clone()),
            },
        }
    }

    fn to_json(&self) -> Value {
        json!({
            "code": self.code,
            "message": self.message,
            "data": self.data
        })
    }
}

#[derive(Debug)]
enum LspRequestError {
    Response {
        details: LspErrorDetails,
        original: Value,
    },
    Client(anyhow::Error),
}

impl LspRequestError {
    fn from_response(response: &Value) -> Self {
        Self::Response {
            details: LspErrorDetails::from_response(response),
            original: response.get("error").unwrap_or(response).clone(),
        }
    }

    fn details(&self) -> LspErrorDetails {
        match self {
            Self::Response { details, .. } => details.clone(),
            Self::Client(error) => LspErrorDetails {
                code: LSP_CLIENT_ERROR_CODE,
                message: error.to_string(),
                data: None,
            },
        }
    }

    fn is_method_not_found(&self) -> bool {
        matches!(self, Self::Response { details, .. } if details.code == -32601)
    }

    fn into_legacy(self, method: &str) -> anyhow::Error {
        match self {
            Self::Response { original, .. } => {
                anyhow!("LSP request {method} failed: {original}")
            }
            Self::Client(error) => error,
        }
    }
}

impl std::fmt::Display for LspRequestError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Response { details, .. } => {
                write!(
                    formatter,
                    "LSP JSON-RPC error {}: {}",
                    details.code, details.message
                )
            }
            Self::Client(error) => write!(formatter, "LSP client error: {error}"),
        }
    }
}

impl std::error::Error for LspRequestError {}

type LspRequestResult<T> = std::result::Result<T, LspRequestError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RelatedStatus {
    Ok,
    Unsupported,
    Error,
}

impl RelatedStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Ok => "ok",
            Self::Unsupported => "unsupported",
            Self::Error => "error",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
struct RelatedGroup {
    status: RelatedStatus,
    items: Vec<Value>,
    error: Option<LspErrorDetails>,
}

impl RelatedGroup {
    fn to_json(&self) -> Value {
        let mut value = json!({
            "status": self.status.as_str(),
            "items": self.items
        });
        if let Some(error) = &self.error {
            value["error"] = error.to_json();
        }
        value
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ChildReapOutcome {
    Exited,
    KilledAfterTimeout,
}

#[cfg(windows)]
mod windows_job {
    use super::*;
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;
    use std::os::windows::process::CommandExt;

    pub(super) type WindowsHandle = *mut c_void;

    const INVALID_HANDLE_VALUE: WindowsHandle = -1_isize as WindowsHandle;
    pub(super) const CREATE_SUSPENDED: u32 = 0x0000_0004;
    pub(super) const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    pub(super) const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: i32 = 9;
    pub(super) const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;
    pub(super) const TH32CS_SNAPTHREAD: u32 = 0x0000_0004;
    pub(super) const THREAD_SUSPEND_RESUME: u32 = 0x0002;
    pub(super) const THREAD_QUERY_LIMITED_INFORMATION: u32 = 0x0800;
    pub(super) const RESUME_THREAD_FAILED: u32 = u32::MAX;
    pub(super) const ERROR_NO_MORE_FILES: i32 = 18;

    #[repr(C)]
    #[derive(Default)]
    pub(super) struct JobObjectBasicLimitInformation {
        pub(super) per_process_user_time_limit: i64,
        pub(super) per_job_user_time_limit: i64,
        pub(super) limit_flags: u32,
        pub(super) minimum_working_set_size: usize,
        pub(super) maximum_working_set_size: usize,
        pub(super) active_process_limit: u32,
        pub(super) affinity: usize,
        pub(super) priority_class: u32,
        pub(super) scheduling_class: u32,
    }

    #[repr(C)]
    #[derive(Default)]
    pub(super) struct IoCounters {
        pub(super) read_operation_count: u64,
        pub(super) write_operation_count: u64,
        pub(super) other_operation_count: u64,
        pub(super) read_transfer_count: u64,
        pub(super) write_transfer_count: u64,
        pub(super) other_transfer_count: u64,
    }

    #[repr(C)]
    #[derive(Default)]
    pub(super) struct JobObjectExtendedLimitInformation {
        pub(super) basic_limit_information: JobObjectBasicLimitInformation,
        pub(super) io_info: IoCounters,
        pub(super) process_memory_limit: usize,
        pub(super) job_memory_limit: usize,
        pub(super) peak_process_memory_used: usize,
        pub(super) peak_job_memory_used: usize,
    }

    #[repr(C)]
    pub(super) struct ThreadEntry32 {
        pub(super) size: u32,
        pub(super) usage_count: u32,
        pub(super) thread_id: u32,
        pub(super) owner_process_id: u32,
        pub(super) base_priority: i32,
        pub(super) delta_priority: i32,
        pub(super) flags: u32,
    }

    impl ThreadEntry32 {
        fn initialized() -> Self {
            Self {
                size: std::mem::size_of::<Self>() as u32,
                usage_count: 0,
                thread_id: 0,
                owner_process_id: 0,
                base_priority: 0,
                delta_priority: 0,
                flags: 0,
            }
        }
    }

    pub(super) fn thread32_next_has_entry(result: i32, error: io::Error) -> io::Result<bool> {
        if result != 0 {
            return Ok(true);
        }
        if error.raw_os_error() == Some(ERROR_NO_MORE_FILES) {
            return Ok(false);
        }
        Err(io::Error::new(
            error.kind(),
            format!("Thread32Next failed while locating suspended child thread: {error}"),
        ))
    }

    #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
    compile_error!("ocmm-lsp Windows Job Object support requires x86_64 or aarch64");

    const _: () = {
        use std::mem::{align_of, offset_of, size_of};

        assert!(size_of::<JobObjectBasicLimitInformation>() == 64);
        assert!(align_of::<JobObjectBasicLimitInformation>() == 8);
        assert!(offset_of!(JobObjectBasicLimitInformation, minimum_working_set_size) == 24);
        assert!(offset_of!(JobObjectBasicLimitInformation, maximum_working_set_size) == 32);
        assert!(offset_of!(JobObjectBasicLimitInformation, affinity) == 48);
        assert!(offset_of!(JobObjectBasicLimitInformation, priority_class) == 56);
        assert!(offset_of!(JobObjectBasicLimitInformation, scheduling_class) == 60);
        assert!(size_of::<IoCounters>() == 48);
        assert!(align_of::<IoCounters>() == 8);
        assert!(size_of::<JobObjectExtendedLimitInformation>() == 144);
        assert!(align_of::<JobObjectExtendedLimitInformation>() == 8);
        assert!(offset_of!(JobObjectExtendedLimitInformation, io_info) == 64);
        assert!(offset_of!(JobObjectExtendedLimitInformation, process_memory_limit) == 112);
        assert!(offset_of!(JobObjectExtendedLimitInformation, job_memory_limit) == 120);
        assert!(offset_of!(JobObjectExtendedLimitInformation, peak_process_memory_used) == 128);
        assert!(offset_of!(JobObjectExtendedLimitInformation, peak_job_memory_used) == 136);
        assert!(size_of::<ThreadEntry32>() == 28);
        assert!(align_of::<ThreadEntry32>() == 4);
        assert!(offset_of!(ThreadEntry32, size) == 0);
        assert!(offset_of!(ThreadEntry32, usage_count) == 4);
        assert!(offset_of!(ThreadEntry32, thread_id) == 8);
        assert!(offset_of!(ThreadEntry32, owner_process_id) == 12);
        assert!(offset_of!(ThreadEntry32, base_priority) == 16);
        assert!(offset_of!(ThreadEntry32, delta_priority) == 20);
        assert!(offset_of!(ThreadEntry32, flags) == 24);
    };

    #[link(name = "kernel32")]
    unsafe extern "system" {
        #[link_name = "CreateJobObjectW"]
        fn create_job_object(job_attributes: *const c_void, name: *const u16) -> WindowsHandle;
        #[link_name = "SetInformationJobObject"]
        fn set_information_job_object(
            job: WindowsHandle,
            information_class: i32,
            information: *const c_void,
            information_length: u32,
        ) -> i32;
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

    #[derive(Debug)]
    pub(super) struct OwnedWindowsHandle(WindowsHandle);

    impl OwnedWindowsHandle {
        fn from_raw(handle: WindowsHandle) -> io::Result<Self> {
            if handle.is_null() || handle == INVALID_HANDLE_VALUE {
                Err(io::Error::last_os_error())
            } else {
                Ok(Self(handle))
            }
        }

        fn as_raw(&self) -> WindowsHandle {
            self.0
        }
    }

    impl Drop for OwnedWindowsHandle {
        fn drop(&mut self) {
            // SAFETY: `OwnedWindowsHandle` accepts only non-null, non-sentinel owned handles and
            // is neither Clone nor Copy, so this is the unique close for this live handle.
            let _ = unsafe { close_handle(self.0) };
        }
    }

    #[derive(Debug)]
    pub(super) struct WindowsJob {
        handle: Option<OwnedWindowsHandle>,
    }

    impl WindowsJob {
        pub(super) fn create_kill_on_close() -> io::Result<Self> {
            // SAFETY: Both optional pointers are null, requesting an unnamed Job with default
            // security. A successful result is a new non-inheritable owned handle.
            let handle = OwnedWindowsHandle::from_raw(unsafe {
                create_job_object(std::ptr::null(), std::ptr::null())
            })?;
            let mut information = JobObjectExtendedLimitInformation::default();
            information.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            // SAFETY: `handle` is live for the call; `information` has the documented C layout,
            // remains initialized and immutably borrowed, and its exact byte size is supplied.
            let configured = unsafe {
                set_information_job_object(
                    handle.as_raw(),
                    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
                    std::ptr::from_ref(&information).cast(),
                    std::mem::size_of_val(&information) as u32,
                )
            };
            if configured == 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(Self {
                handle: Some(handle),
            })
        }

        pub(super) fn assign_child(&self, child: &Child) -> io::Result<()> {
            let handle = self
                .handle
                .as_ref()
                .ok_or_else(|| io::Error::other("cannot assign a child to a closed Job Object"))?;
            // SAFETY: The Job handle and `Child` process handle are both live for this call. The
            // process handle is borrowed from `Child` and is not closed by this operation.
            let assigned = unsafe {
                assign_process_to_job_object(handle.as_raw(), child.as_raw_handle().cast())
            };
            if assigned == 0 {
                Err(io::Error::last_os_error())
            } else {
                Ok(())
            }
        }

        pub(super) fn terminate(&self) -> io::Result<()> {
            let Some(handle) = self.handle.as_ref() else {
                return Ok(());
            };
            // SAFETY: `handle` is a live Job handle owned by this value and remains valid for the
            // duration of the call. No pointers are passed.
            let terminated = unsafe { terminate_job_object(handle.as_raw(), 1) };
            if terminated == 0 {
                Err(io::Error::last_os_error())
            } else {
                Ok(())
            }
        }

        pub(super) fn close(&mut self) {
            self.handle.take();
        }
    }

    impl Drop for WindowsJob {
        fn drop(&mut self) {
            self.close();
        }
    }

    pub(super) trait WindowsLaunchOps {
        fn assign_process(&self, job: &WindowsJob, child: &Child) -> io::Result<()>;
        fn open_initial_thread(&self, child_pid: u32) -> io::Result<OwnedWindowsHandle>;
        fn thread_owner_pid(&self, thread: &OwnedWindowsHandle) -> io::Result<u32>;
        fn resume_thread(&self, thread: &OwnedWindowsHandle) -> io::Result<u32>;
    }

    #[derive(Debug)]
    pub(super) struct RealWindowsLaunchOps;

    impl WindowsLaunchOps for RealWindowsLaunchOps {
        fn assign_process(&self, job: &WindowsJob, child: &Child) -> io::Result<()> {
            job.assign_child(child)
        }

        fn open_initial_thread(&self, child_pid: u32) -> io::Result<OwnedWindowsHandle> {
            // SAFETY: This call has no pointer arguments. A successful non-sentinel result is a
            // new snapshot handle transferred immediately into `OwnedWindowsHandle`.
            let snapshot = OwnedWindowsHandle::from_raw(unsafe {
                create_toolhelp32_snapshot(TH32CS_SNAPTHREAD, 0)
            })?;
            let mut entry = ThreadEntry32::initialized();
            let mut matching_thread_ids = Vec::new();
            // SAFETY: `snapshot` is live and `entry` is writable, correctly sized, and has the
            // documented C layout for the duration of this enumeration call.
            let mut has_entry = unsafe { thread32_first(snapshot.as_raw(), &mut entry) } != 0;
            if !has_entry {
                return Err(io::Error::new(
                    io::ErrorKind::NotFound,
                    format!(
                        "Thread32First found no threads while locating child {child_pid}: {}",
                        io::Error::last_os_error()
                    ),
                ));
            }
            while has_entry {
                if entry.owner_process_id == child_pid {
                    matching_thread_ids.push(entry.thread_id);
                }
                // SAFETY: The same live snapshot and writable, correctly sized `entry` remain
                // valid. A zero result is normal only when Kernel32 reports
                // ERROR_NO_MORE_FILES; every other enumeration error fails closed.
                let next_result = unsafe { thread32_next(snapshot.as_raw(), &mut entry) };
                let next_error = io::Error::last_os_error();
                has_entry = thread32_next_has_entry(next_result, next_error)?;
            }
            if matching_thread_ids.len() != 1 {
                return Err(io::Error::other(format!(
                    "expected exactly one suspended thread for child {child_pid}, found {}",
                    matching_thread_ids.len()
                )));
            }
            // SAFETY: The thread ID came from the live thread-only snapshot. The requested handle
            // is non-inheritable and uses only suspend/resume plus query-limited rights.
            OwnedWindowsHandle::from_raw(unsafe {
                open_thread(
                    THREAD_SUSPEND_RESUME | THREAD_QUERY_LIMITED_INFORMATION,
                    0,
                    matching_thread_ids[0],
                )
            })
        }

        fn thread_owner_pid(&self, thread: &OwnedWindowsHandle) -> io::Result<u32> {
            // SAFETY: `thread` is a live owned thread handle opened with query-limited access and
            // remains borrowed for the duration of the call.
            let process_id = unsafe { get_process_id_of_thread(thread.as_raw()) };
            if process_id == 0 {
                Err(io::Error::last_os_error())
            } else {
                Ok(process_id)
            }
        }

        fn resume_thread(&self, thread: &OwnedWindowsHandle) -> io::Result<u32> {
            // SAFETY: `thread` is a live owned thread handle opened with suspend/resume access and
            // remains borrowed for the duration of the call.
            let previous_count = unsafe { resume_thread(thread.as_raw()) };
            if previous_count == RESUME_THREAD_FAILED {
                Err(io::Error::last_os_error())
            } else {
                Ok(previous_count)
            }
        }
    }

    fn cleanup_failed_launch(
        mut child: Child,
        mut job: WindowsJob,
        assigned: bool,
        primary_error: anyhow::Error,
    ) -> anyhow::Error {
        let mut cleanup_errors = Vec::new();
        if assigned {
            if let Err(error) = job.terminate() {
                cleanup_errors.push(format!("terminate assigned Job Object: {error}"));
            }
        }
        if let Err(error) = child.kill() {
            cleanup_errors.push(format!("kill suspended direct child: {error}"));
        }
        job.close();
        match poll_child_until_reaped(
            &mut child,
            Duration::from_millis(LSP_TERMINATION_WAIT_MS),
            Duration::from_millis(LSP_EXIT_POLL_MS),
        ) {
            Ok(true) => {}
            Ok(false) => cleanup_errors.push(format!(
                "direct child was not reaped within {LSP_TERMINATION_WAIT_MS}ms"
            )),
            Err(error) => cleanup_errors.push(format!("poll direct child after kill: {error}")),
        }
        if cleanup_errors.is_empty() {
            primary_error
        } else {
            anyhow!(
                "{primary_error}; cleanup errors: {}",
                cleanup_errors.join("; ")
            )
        }
    }

    pub(super) fn spawn_windows_managed_child_with_ops(
        command: &mut Command,
        ops: &dyn WindowsLaunchOps,
    ) -> Result<ManagedChild> {
        let job = WindowsJob::create_kill_on_close()
            .context("create and configure Windows Job Object")?;
        command.creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);
        let child = command.spawn().context("spawn suspended child")?;

        if let Err(error) = ops.assign_process(&job, &child) {
            return Err(cleanup_failed_launch(
                child,
                job,
                false,
                anyhow!(error).context("assign suspended child to Job Object"),
            ));
        }

        let thread = match ops.open_initial_thread(child.id()) {
            Ok(thread) => thread,
            Err(error) => {
                return Err(cleanup_failed_launch(
                    child,
                    job,
                    true,
                    anyhow!(error).context("open suspended initial thread"),
                ));
            }
        };
        let owner_pid = match ops.thread_owner_pid(&thread) {
            Ok(owner_pid) => owner_pid,
            Err(error) => {
                drop(thread);
                return Err(cleanup_failed_launch(
                    child,
                    job,
                    true,
                    anyhow!(error).context("query suspended initial thread owner"),
                ));
            }
        };
        if owner_pid != child.id() {
            drop(thread);
            let child_pid = child.id();
            return Err(cleanup_failed_launch(
                child,
                job,
                true,
                anyhow!(
                    "suspended initial thread owner mismatch: expected {child_pid}, got {owner_pid}"
                ),
            ));
        }
        let previous_count = match ops.resume_thread(&thread) {
            Ok(previous_count) => previous_count,
            Err(error) => {
                drop(thread);
                return Err(cleanup_failed_launch(
                    child,
                    job,
                    true,
                    anyhow!(error).context("resume suspended initial thread"),
                ));
            }
        };
        drop(thread);
        if previous_count != 1 {
            return Err(cleanup_failed_launch(
                child,
                job,
                true,
                anyhow!(
                    "resume suspended initial thread returned previous suspend count {previous_count}, expected 1"
                ),
            ));
        }

        Ok(ManagedChild {
            child,
            job: Some(job),
        })
    }
}

#[cfg(windows)]
use windows_job::*;

#[derive(Debug)]
struct ManagedChild {
    child: Child,
    #[cfg(windows)]
    job: Option<WindowsJob>,
}

impl ManagedChild {
    fn spawn(command: &mut Command) -> Result<Self> {
        #[cfg(windows)]
        {
            spawn_windows_managed_child_with_ops(command, &RealWindowsLaunchOps)
        }
        #[cfg(not(windows))]
        {
            Ok(Self {
                child: command.spawn()?,
            })
        }
    }

    #[cfg(windows)]
    fn close_job(&mut self) {
        if let Some(mut job) = self.job.take() {
            job.close();
        }
    }
}

impl Drop for ManagedChild {
    fn drop(&mut self) {
        let _ = reap_child_after_exit(
            self,
            Duration::ZERO,
            Duration::from_millis(LSP_EXIT_POLL_MS),
            Duration::from_millis(LSP_TERMINATION_WAIT_MS),
        );
    }
}

fn poll_child_until_reaped(
    child: &mut Child,
    timeout: Duration,
    poll: Duration,
) -> io::Result<bool> {
    let deadline = Instant::now() + timeout;
    loop {
        if child.try_wait()?.is_some() {
            return Ok(true);
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Ok(false);
        }
        std::thread::sleep(remaining.min(poll));
    }
}

fn reap_child_after_exit(
    child: &mut ManagedChild,
    grace: Duration,
    poll: Duration,
    termination_wait: Duration,
) -> Result<ChildReapOutcome> {
    let grace_deadline = Instant::now() + grace;
    let mut cleanup_errors = Vec::new();
    loop {
        match child.child.try_wait() {
            Ok(Some(_)) => {
                #[cfg(windows)]
                child.close_job();
                return if cleanup_errors.is_empty() {
                    Ok(ChildReapOutcome::Exited)
                } else {
                    Err(anyhow!(cleanup_errors.join("; ")))
                };
            }
            Ok(None) => {}
            Err(error) => {
                cleanup_errors.push(format!("poll direct child during grace period: {error}"));
                break;
            }
        }

        let remaining = grace_deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            break;
        }
        std::thread::sleep(remaining.min(poll));
    }

    #[cfg(windows)]
    {
        if let Some(job) = child.job.as_ref() {
            if let Err(error) = job.terminate() {
                cleanup_errors.push(format!("terminate Windows Job Object: {error}"));
            }
        }
    }
    if let Err(error) = child.child.kill() {
        cleanup_errors.push(format!("kill direct child: {error}"));
    }
    #[cfg(windows)]
    child.close_job();

    match poll_child_until_reaped(&mut child.child, termination_wait, poll) {
        Ok(true) => {}
        Ok(false) => cleanup_errors.push(format!(
            "direct child was not reaped within {}ms after termination",
            termination_wait.as_millis()
        )),
        Err(error) => cleanup_errors.push(format!("poll direct child after termination: {error}")),
    }

    if cleanup_errors.is_empty() {
        Ok(ChildReapOutcome::KilledAfterTimeout)
    } else {
        Err(anyhow!(cleanup_errors.join("; ")))
    }
}

fn main() {
    if let Err(error) = real_main() {
        eprintln!("{error:?}");
        std::process::exit(1);
    }
}

fn real_main() -> Result<()> {
    let mut args = env::args().skip(1);
    let command = args.next().unwrap_or_else(|| "mcp".to_string());
    match command.as_str() {
        "mcp" => run_mcp(),
        "-h" | "--help" | "help" => {
            println!("Usage: ocmm-lsp [mcp]");
            Ok(())
        }
        other => bail!("unknown command '{other}'. Usage: ocmm-lsp [mcp]"),
    }
}

fn run_mcp() -> Result<()> {
    let mut input = io::stdin().lock();
    let mut output = io::stdout().lock();
    let mut buffer = Vec::<u8>::new();
    let mut chunk = [0_u8; 8192];

    loop {
        while let Some((message, mode)) = try_parse_message(&mut buffer)? {
            if let Some(response) = handle_mcp_message(message) {
                write_mcp_response(&mut output, &response, mode)?;
            }
        }

        let read = input.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
    }

    Ok(())
}

fn try_parse_message(buffer: &mut Vec<u8>) -> Result<Option<(Value, WireMode)>> {
    if buffer.is_empty() {
        return Ok(None);
    }

    if starts_with_content_length(buffer) {
        let Some(header_end) = find_bytes(buffer, b"\r\n\r\n") else {
            return Ok(None);
        };
        let headers = std::str::from_utf8(&buffer[..header_end]).context("invalid MCP headers")?;
        let length = parse_content_length(headers)?;
        let body_start = header_end + 4;
        let body_end = body_start + length;
        if buffer.len() < body_end {
            return Ok(None);
        }
        let body = buffer[body_start..body_end].to_vec();
        buffer.drain(..body_end);
        let parsed = serde_json::from_slice(&body).context("invalid MCP JSON body")?;
        return Ok(Some((parsed, WireMode::Framed)));
    }

    let Some(newline) = buffer.iter().position(|byte| *byte == b'\n') else {
        return Ok(None);
    };
    let line = buffer[..=newline].to_vec();
    buffer.drain(..=newline);
    let trimmed = String::from_utf8(line)?.trim().to_string();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let parsed = serde_json::from_str(&trimmed).context("invalid MCP line JSON")?;
    Ok(Some((parsed, WireMode::Line)))
}

fn starts_with_content_length(buffer: &[u8]) -> bool {
    let prefix = b"content-length:";
    buffer.len() >= prefix.len()
        && buffer[..prefix.len()]
            .iter()
            .zip(prefix.iter())
            .all(|(a, b)| a.to_ascii_lowercase() == *b)
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn parse_content_length(headers: &str) -> Result<usize> {
    for line in headers.split("\r\n") {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.trim().eq_ignore_ascii_case("content-length") {
            return value
                .trim()
                .parse::<usize>()
                .context("invalid Content-Length value");
        }
    }
    bail!("missing Content-Length header")
}

fn write_mcp_response(output: &mut impl Write, response: &Value, mode: WireMode) -> Result<()> {
    let body = serde_json::to_string(response)?;
    match mode {
        WireMode::Line => {
            writeln!(output, "{body}")?;
        }
        WireMode::Framed => {
            write!(
                output,
                "Content-Length: {}\r\n\r\n{body}",
                body.as_bytes().len()
            )?;
        }
    }
    output.flush()?;
    Ok(())
}

fn handle_mcp_message(input: Value) -> Option<Value> {
    let Some(object) = input.as_object() else {
        return Some(error_response(Value::Null, -32600, "Invalid Request"));
    };
    let id = object.get("id").cloned().unwrap_or(Value::Null);
    let method = object.get("method").and_then(Value::as_str).unwrap_or("");

    match method {
        "notifications/initialized" => None,
        "ping" => Some(success_response(id, json!({}))),
        "initialize" => {
            let protocol = object
                .get("params")
                .and_then(|params| params.get("protocolVersion"))
                .and_then(Value::as_str)
                .unwrap_or("2024-11-05");
            Some(success_response(
                id,
                json!({
                    "protocolVersion": protocol,
                    "capabilities": { "tools": { "listChanged": false } },
                    "serverInfo": { "name": SERVER_NAME, "version": SERVER_VERSION }
                }),
            ))
        }
        "tools/list" => Some(success_response(id, json!({ "tools": tool_descriptors() }))),
        "tools/call" => Some(handle_tool_call(id, object.get("params"))),
        _ => Some(error_response(
            id,
            -32601,
            &format!("Method not found: {method}"),
        )),
    }
}

fn success_response(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn error_response(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

fn handle_tool_call(id: Value, params: Option<&Value>) -> Value {
    let Some(params) = params.and_then(Value::as_object) else {
        return error_response(id, -32602, "tools/call requires params.name");
    };
    let Some(name) = params.get("name").and_then(Value::as_str) else {
        return error_response(id, -32602, "tools/call requires params.name");
    };
    let args = params
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));

    let output = match execute_tool(name, &args) {
        Ok(output) => output,
        Err(error) => ToolOutput {
            text: error.to_string(),
            is_error: true,
            details: None,
        },
    };

    let mut result = json!({
        "content": [{ "type": "text", "text": output.text }],
        "isError": output.is_error
    });
    if let Some(details) = output.details {
        result["details"] = details;
    }
    success_response(id, result)
}

fn tool_descriptors() -> Value {
    json!([
        {
            "name": "status",
            "title": "LSP Status",
            "description": "List configured and detected LSP servers without starting a language server.",
            "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false }
        },
        {
            "name": "diagnostics",
            "title": "LSP Diagnostics",
            "description": "Open a source file in its language server and return published diagnostics.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "filePath": { "type": "string" },
                    "severity": { "type": "string", "enum": ["error", "warning", "information", "hint", "all"] }
                },
                "required": ["filePath"],
                "additionalProperties": false
            }
        },
        {
            "name": "goto_definition",
            "title": "LSP Goto Definition",
            "description": "Find where a symbol is defined.",
            "inputSchema": position_schema()
        },
        {
            "name": "find_references",
            "title": "LSP Find References",
            "description": "Find references of a symbol across the workspace.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "filePath": { "type": "string" },
                    "line": { "type": "number" },
                    "character": { "type": "number" },
                    "includeDeclaration": { "type": "boolean" }
                },
                "required": ["filePath", "line", "character"],
                "additionalProperties": false
            }
        },
        {
            "name": "find_symbol_related",
            "title": "LSP Find Symbol Related",
            "description": "Find definitions, implementations, and references for a symbol in one language-server session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "filePath": { "type": "string" },
                    "line": { "type": "integer", "minimum": 1 },
                    "character": { "type": "integer", "minimum": 0 }
                },
                "required": ["filePath", "line", "character"],
                "additionalProperties": false
            }
        },
        {
            "name": "symbols",
            "title": "LSP Symbols",
            "description": "List document symbols or search workspace symbols.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "filePath": { "type": "string" },
                    "scope": { "type": "string", "enum": ["document", "workspace"] },
                    "query": { "type": "string" },
                    "limit": { "type": "number" }
                },
                "required": ["filePath", "scope"],
                "additionalProperties": false
            }
        },
        {
            "name": "prepare_rename",
            "title": "LSP Prepare Rename",
            "description": "Check whether a symbol can be renamed at a position.",
            "inputSchema": position_schema()
        },
        {
            "name": "rename",
            "title": "LSP Rename",
            "description": "Rename a symbol across the workspace and apply the returned workspace edit.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "filePath": { "type": "string" },
                    "line": { "type": "number" },
                    "character": { "type": "number" },
                    "newName": { "type": "string" }
                },
                "required": ["filePath", "line", "character", "newName"],
                "additionalProperties": false
            }
        }
    ])
}

fn position_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "filePath": { "type": "string" },
            "line": { "type": "number" },
            "character": { "type": "number" }
        },
        "required": ["filePath", "line", "character"],
        "additionalProperties": false
    })
}

fn execute_tool(name: &str, args: &Value) -> Result<ToolOutput> {
    match normalize_tool_name(name) {
        "status" => status_tool(),
        "diagnostics" => diagnostics_tool(args),
        "goto_definition" => position_request_tool(args, "textDocument/definition", "definition"),
        "find_references" => references_tool(args),
        "find_symbol_related" => find_symbol_related_tool(args),
        "symbols" => symbols_tool(args),
        "prepare_rename" => {
            position_request_tool(args, "textDocument/prepareRename", "prepare_rename")
        }
        "rename" => rename_tool(args),
        other => Ok(ToolOutput {
            text: format!("Unknown LSP tool: {other}"),
            is_error: true,
            details: None,
        }),
    }
}

fn normalize_tool_name(name: &str) -> &str {
    match name {
        "lsp_status" => "status",
        "lsp_diagnostics" => "diagnostics",
        "lsp_goto_definition" => "goto_definition",
        "lsp_find_references" => "find_references",
        "lsp_find_symbol_related" => "find_symbol_related",
        "lsp_symbols" => "symbols",
        "lsp_prepare_rename" => "prepare_rename",
        "lsp_rename" => "rename",
        other => other,
    }
}

fn status_tool() -> Result<ToolOutput> {
    let servers = merged_servers();
    let mut lines = vec!["Configured LSP servers:".to_string()];
    for server in &servers {
        let installed = command_installed(&server.command);
        lines.push(format!(
            "- {} [{}] {} extensions={} command={}",
            server.id,
            server.source,
            if installed { "installed" } else { "missing" },
            server.extensions.join(","),
            server.command.join(" ")
        ));
    }
    Ok(ToolOutput {
        text: lines.join("\n"),
        is_error: false,
        details: Some(json!({
            "servers": servers.iter().map(|server| json!({
                "id": server.id,
                "source": server.source,
                "installed": command_installed(&server.command),
                "extensions": server.extensions,
                "command": server.command
            })).collect::<Vec<_>>()
        })),
    })
}

fn diagnostics_tool(args: &Value) -> Result<ToolOutput> {
    let file = required_string(args, "filePath")?;
    let severity = args
        .get("severity")
        .and_then(Value::as_str)
        .unwrap_or("all");
    let mut session = LspSession::for_file(file)?;
    session.initialize()?;
    let uri = session.open_file()?;
    let diagnostics =
        session.collect_diagnostics(&uri, Duration::from_millis(DIAGNOSTICS_WAIT_MS))?;
    session.shutdown();

    let mut lines = Vec::new();
    for diagnostic in diagnostics {
        if severity != "all" && severity_name(diagnostic.get("severity")) != severity {
            continue;
        }
        lines.push(format_diagnostic(&diagnostic));
        if lines.len() >= 200 {
            lines.push("... truncated at 200 diagnostics".to_string());
            break;
        }
    }

    if lines.is_empty() {
        lines.push("No diagnostics published by the language server.".to_string());
    }
    Ok(ToolOutput {
        text: lines.join("\n"),
        is_error: false,
        details: None,
    })
}

fn position_request_tool(args: &Value, method: &str, label: &str) -> Result<ToolOutput> {
    let file = required_string(args, "filePath")?;
    let line = required_u64(args, "line")?;
    let character = required_u64(args, "character")?;
    let mut session = LspSession::for_file(file)?;
    session.initialize()?;
    let uri = session.open_file()?;
    let result = session.request_legacy(
        method,
        json!({
            "textDocument": { "uri": uri },
            "position": { "line": line.saturating_sub(1), "character": character }
        }),
    )?;
    session.shutdown();
    Ok(ToolOutput {
        text: format_locations_or_value(&result, label),
        is_error: false,
        details: Some(result),
    })
}

fn references_tool(args: &Value) -> Result<ToolOutput> {
    let file = required_string(args, "filePath")?;
    let line = required_u64(args, "line")?;
    let character = required_u64(args, "character")?;
    let include_declaration = args
        .get("includeDeclaration")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let mut session = LspSession::for_file(file)?;
    session.initialize()?;
    let uri = session.open_file()?;
    let result = session.request_legacy(
        "textDocument/references",
        json!({
            "textDocument": { "uri": uri },
            "position": { "line": line.saturating_sub(1), "character": character },
            "context": { "includeDeclaration": include_declaration }
        }),
    )?;
    session.shutdown();
    Ok(ToolOutput {
        text: format_locations_or_value(&result, "references"),
        is_error: false,
        details: Some(result),
    })
}

fn find_symbol_related_tool(args: &Value) -> Result<ToolOutput> {
    let file = required_string(args, "filePath")?;
    let line = required_u64(args, "line")?;
    if line == 0 {
        bail!("line must be at least 1");
    }
    let character = required_u64(args, "character")?;

    let mut session = LspSession::for_file(file)?;
    session.initialize()?;
    let uri = session.open_file()?;
    let position = json!({ "line": line - 1, "character": character });

    let definition = request_related_group(
        &mut session,
        "textDocument/definition",
        json!({
            "textDocument": { "uri": uri },
            "position": position
        }),
    );
    let implementation = request_related_group(
        &mut session,
        "textDocument/implementation",
        json!({
            "textDocument": { "uri": uri },
            "position": position
        }),
    );
    let references = request_related_group(
        &mut session,
        "textDocument/references",
        json!({
            "textDocument": { "uri": uri },
            "position": position,
            "context": { "includeDeclaration": true }
        }),
    );
    session.shutdown();

    let groups = [
        ("definition", &definition),
        ("implementation", &implementation),
        ("references", &references),
    ];
    let is_error = groups
        .iter()
        .all(|(_, group)| group.status == RelatedStatus::Error);

    Ok(ToolOutput {
        text: format_related_groups(&groups),
        is_error,
        details: Some(json!({
            "definition": definition.to_json(),
            "implementation": implementation.to_json(),
            "references": references.to_json()
        })),
    })
}

fn request_related_group(session: &mut LspSession, method: &str, params: Value) -> RelatedGroup {
    match session.request(method, params) {
        Ok(result) => RelatedGroup {
            status: RelatedStatus::Ok,
            items: normalize_locations(&result),
            error: None,
        },
        Err(error) => {
            let status = if error.is_method_not_found() {
                RelatedStatus::Unsupported
            } else {
                RelatedStatus::Error
            };
            RelatedGroup {
                status,
                items: Vec::new(),
                error: Some(error.details()),
            }
        }
    }
}

fn format_related_groups(groups: &[(&str, &RelatedGroup)]) -> String {
    let mut lines = Vec::new();
    for (name, group) in groups {
        lines.push(format!(
            "{name}: {} ({} items)",
            group.status.as_str(),
            group.items.len()
        ));
        if group.status == RelatedStatus::Ok {
            for item in &group.items {
                collect_locations(item, &mut lines);
            }
        } else if let Some(error) = &group.error {
            lines.push(format!("  [{}] {}", error.code, error.message));
        }
    }
    lines.join("\n")
}

fn normalize_locations(value: &Value) -> Vec<Value> {
    let values = match value.as_array() {
        Some(values) => values.as_slice(),
        None if value.is_null() => &[],
        None => std::slice::from_ref(value),
    };
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();
    for value in values {
        let Some(location) = normalize_location(value) else {
            continue;
        };
        let Some(key) = location_key(&location) else {
            continue;
        };
        if seen.insert(key) {
            normalized.push(location);
        }
    }
    normalized
}

fn normalize_location(value: &Value) -> Option<Value> {
    let (uri, range) = if let Some(uri) = value.get("uri").and_then(Value::as_str) {
        (uri, value.get("range")?)
    } else {
        let uri = value.get("targetUri").and_then(Value::as_str)?;
        let range = value
            .get("targetSelectionRange")
            .or_else(|| value.get("targetRange"))?;
        (uri, range)
    };
    let range = normalize_range(range)?;
    Some(json!({ "uri": uri, "range": range }))
}

fn normalize_range(range: &Value) -> Option<Value> {
    let start = range.get("start")?;
    let end = range.get("end")?;
    let start_line = start.get("line")?.as_u64()?;
    let start_character = start.get("character")?.as_u64()?;
    let end_line = end.get("line")?.as_u64()?;
    let end_character = end.get("character")?.as_u64()?;
    Some(json!({
        "start": { "line": start_line, "character": start_character },
        "end": { "line": end_line, "character": end_character }
    }))
}

fn location_key(location: &Value) -> Option<String> {
    let uri = location.get("uri")?.as_str()?;
    let range = location.get("range")?;
    let start = range.get("start")?;
    let end = range.get("end")?;
    Some(format!(
        "{}\u{0}{}:{}:{}:{}",
        uri,
        start.get("line")?.as_u64()?,
        start.get("character")?.as_u64()?,
        end.get("line")?.as_u64()?,
        end.get("character")?.as_u64()?
    ))
}

fn symbols_tool(args: &Value) -> Result<ToolOutput> {
    let file = required_string(args, "filePath")?;
    let scope = args
        .get("scope")
        .and_then(Value::as_str)
        .unwrap_or("document");
    let mut session = LspSession::for_file(file)?;
    session.initialize()?;
    let uri = session.open_file()?;
    let result = if scope == "workspace" {
        let query = args
            .get("query")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("workspace symbols require query"))?;
        session.request_legacy("workspace/symbol", json!({ "query": query }))?
    } else {
        session.request_legacy(
            "textDocument/documentSymbol",
            json!({ "textDocument": { "uri": uri } }),
        )?
    };
    session.shutdown();
    let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(200) as usize;
    Ok(ToolOutput {
        text: format_symbols(&result, limit),
        is_error: false,
        details: Some(result),
    })
}

fn rename_tool(args: &Value) -> Result<ToolOutput> {
    let file = required_string(args, "filePath")?;
    let line = required_u64(args, "line")?;
    let character = required_u64(args, "character")?;
    let new_name = required_string(args, "newName")?;
    let mut session = LspSession::for_file(file)?;
    session.initialize()?;
    let uri = session.open_file()?;
    let workspace_root = session.root.clone();
    let edit = session.request_legacy(
        "textDocument/rename",
        json!({
            "textDocument": { "uri": uri },
            "position": { "line": line.saturating_sub(1), "character": character },
            "newName": new_name
        }),
    )?;
    session.shutdown();

    let result = apply_workspace_edit(&edit, &workspace_root);
    Ok(ToolOutput {
        text: result.format(),
        is_error: !result.success,
        details: Some(result.to_json()),
    })
}

fn required_string<'a>(args: &'a Value, key: &str) -> Result<&'a str> {
    args.get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| anyhow!("missing required string argument: {key}"))
}

fn required_u64(args: &Value, key: &str) -> Result<u64> {
    args.get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| anyhow!("missing required number argument: {key}"))
}

#[derive(Default)]
struct ApplySummary {
    success: bool,
    files_modified: Vec<String>,
    total_edits: usize,
    errors: Vec<String>,
}

impl ApplySummary {
    fn ok() -> Self {
        Self {
            success: true,
            ..Self::default()
        }
    }

    fn record_error(&mut self, error: impl Into<String>) {
        self.success = false;
        self.errors.push(error.into());
    }

    fn format(&self) -> String {
        if self.success {
            format!(
                "Rename applied: {} edits across {} files.",
                self.total_edits,
                self.files_modified.len()
            )
        } else {
            format!("Rename failed:\n{}", self.errors.join("\n"))
        }
    }

    fn to_json(&self) -> Value {
        json!({
            "success": self.success,
            "filesModified": self.files_modified,
            "totalEdits": self.total_edits,
            "errors": self.errors
        })
    }
}

fn apply_workspace_edit(edit: &Value, workspace_root: &Path) -> ApplySummary {
    let mut summary = ApplySummary::ok();
    if edit.is_null() {
        summary.record_error("No workspace edit returned by language server");
        return summary;
    }

    let root = match workspace_root.canonicalize() {
        Ok(root) => root,
        Err(error) => {
            summary.record_error(format!("Cannot canonicalize workspace root: {error}"));
            return summary;
        }
    };

    if let Some(changes) = edit.get("changes").and_then(Value::as_object) {
        for (uri, edits) in changes {
            apply_uri_edits(uri, edits, &root, &mut summary);
        }
    }

    if let Some(document_changes) = edit.get("documentChanges").and_then(Value::as_array) {
        for change in document_changes {
            apply_document_change(change, &root, &mut summary);
        }
    }

    summary
}

fn apply_document_change(change: &Value, workspace_root: &Path, summary: &mut ApplySummary) {
    if let Some(kind) = change.get("kind").and_then(Value::as_str) {
        match kind {
            "create" => apply_create(change, workspace_root, summary),
            "rename" => apply_file_rename(change, workspace_root, summary),
            "delete" => apply_delete(change, workspace_root, summary),
            _ => summary.record_error(format!("Unsupported document change kind: {kind}")),
        }
        return;
    }

    let Some(uri) = change
        .get("textDocument")
        .and_then(|doc| doc.get("uri"))
        .and_then(Value::as_str)
    else {
        summary.record_error("Text document edit missing textDocument.uri");
        return;
    };
    let edits = change.get("edits").unwrap_or(&Value::Null);
    apply_uri_edits(uri, edits, workspace_root, summary);
}

fn apply_uri_edits(uri: &str, edits: &Value, workspace_root: &Path, summary: &mut ApplySummary) {
    let path = match uri_to_workspace_path(uri, workspace_root) {
        Ok(path) => path,
        Err(error) => {
            summary.record_error(error.to_string());
            return;
        }
    };
    let Some(edits) = edits.as_array() else {
        summary.record_error(format!("Edits for {uri} are not an array"));
        return;
    };
    match apply_text_edits_to_file(&path, edits) {
        Ok(count) => {
            summary.files_modified.push(path.display().to_string());
            summary.total_edits += count;
        }
        Err(error) => summary.record_error(format!("{}: {error}", path.display())),
    }
}

fn apply_create(change: &Value, workspace_root: &Path, summary: &mut ApplySummary) {
    let Some(uri) = change.get("uri").and_then(Value::as_str) else {
        summary.record_error("Create change missing uri");
        return;
    };
    match uri_to_workspace_path(uri, workspace_root).and_then(|path| {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, "")?;
        Ok(path)
    }) {
        Ok(path) => summary.files_modified.push(path.display().to_string()),
        Err(error) => summary.record_error(format!("Create {uri}: {error}")),
    }
}

fn apply_file_rename(change: &Value, workspace_root: &Path, summary: &mut ApplySummary) {
    let Some(old_uri) = change.get("oldUri").and_then(Value::as_str) else {
        summary.record_error("Rename change missing oldUri");
        return;
    };
    let Some(new_uri) = change.get("newUri").and_then(Value::as_str) else {
        summary.record_error("Rename change missing newUri");
        return;
    };
    let result = uri_to_workspace_path(old_uri, workspace_root).and_then(|old_path| {
        let new_path = uri_to_workspace_path(new_uri, workspace_root)?;
        if let Some(parent) = new_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&old_path, &new_path)?;
        Ok(new_path)
    });
    match result {
        Ok(path) => summary.files_modified.push(path.display().to_string()),
        Err(error) => summary.record_error(format!("Rename {old_uri}: {error}")),
    }
}

fn apply_delete(change: &Value, workspace_root: &Path, summary: &mut ApplySummary) {
    let Some(uri) = change.get("uri").and_then(Value::as_str) else {
        summary.record_error("Delete change missing uri");
        return;
    };
    match uri_to_workspace_path(uri, workspace_root).and_then(|path| {
        fs::remove_file(&path)?;
        Ok(path)
    }) {
        Ok(path) => summary.files_modified.push(path.display().to_string()),
        Err(error) => summary.record_error(format!("Delete {uri}: {error}")),
    }
}

fn apply_text_edits_to_file(path: &Path, edits: &[Value]) -> Result<usize> {
    let content = fs::read_to_string(path)?;
    let mut lines: Vec<String> = content.split('\n').map(ToString::to_string).collect();
    let mut parsed = Vec::new();
    for edit in edits {
        let range = edit
            .get("range")
            .ok_or_else(|| anyhow!("edit missing range"))?;
        let start = range
            .get("start")
            .ok_or_else(|| anyhow!("edit missing range.start"))?;
        let end = range
            .get("end")
            .ok_or_else(|| anyhow!("edit missing range.end"))?;
        parsed.push((
            start.get("line").and_then(Value::as_u64).unwrap_or(0) as usize,
            start.get("character").and_then(Value::as_u64).unwrap_or(0) as usize,
            end.get("line").and_then(Value::as_u64).unwrap_or(0) as usize,
            end.get("character").and_then(Value::as_u64).unwrap_or(0) as usize,
            edit.get("newText")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string(),
        ));
    }
    parsed.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1)));

    for (start_line, start_char, end_line, end_char, new_text) in &parsed {
        if *start_line >= lines.len() || *end_line >= lines.len() {
            bail!("edit range is outside file");
        }
        if start_line == end_line {
            let line = &lines[*start_line];
            lines[*start_line] = format!(
                "{}{}{}",
                take_chars(line, *start_char),
                new_text,
                skip_chars(line, *end_char)
            );
        } else {
            let first = lines[*start_line].clone();
            let last = lines[*end_line].clone();
            let replacement = format!(
                "{}{}{}",
                take_chars(&first, *start_char),
                new_text,
                skip_chars(&last, *end_char)
            );
            let replacement_lines: Vec<String> =
                replacement.split('\n').map(ToString::to_string).collect();
            lines.splice(*start_line..=*end_line, replacement_lines);
        }
    }

    fs::write(path, lines.join("\n"))?;
    Ok(parsed.len())
}

fn take_chars(value: &str, count: usize) -> String {
    value.chars().take(count).collect()
}

fn skip_chars(value: &str, count: usize) -> String {
    value.chars().skip(count).collect()
}

fn uri_to_workspace_path(uri: &str, workspace_root: &Path) -> Result<PathBuf> {
    let Some(raw_path) = uri.strip_prefix("file://") else {
        bail!("non-file URI: {uri}");
    };
    let decoded = percent_decode(raw_path)?;
    #[cfg(windows)]
    let decoded =
        if decoded.len() > 2 && decoded.as_bytes()[0] == b'/' && decoded.as_bytes()[2] == b':' {
            decoded[1..].to_string()
        } else {
            decoded
        };
    let path = PathBuf::from(decoded);
    let validation_path = if path.exists() {
        path.canonicalize()?
    } else {
        let parent = path
            .parent()
            .ok_or_else(|| anyhow!("path has no parent: {}", path.display()))?;
        parent.canonicalize()?.join(
            path.file_name()
                .ok_or_else(|| anyhow!("path has no file name"))?,
        )
    };
    if !validation_path.starts_with(workspace_root) {
        bail!(
            "{} is outside workspace {}",
            path.display(),
            workspace_root.display()
        );
    }
    Ok(path)
}

fn percent_decode(input: &str) -> Result<String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                bail!("invalid percent escape in URI");
            }
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3])?;
            out.push(u8::from_str_radix(hex, 16)?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    Ok(String::from_utf8(out)?)
}

fn merged_servers() -> Vec<LspServer> {
    let mut servers = Vec::new();
    let mut seen: HashMap<String, usize> = HashMap::new();
    for source in config_sources() {
        if let Ok(raw) = fs::read_to_string(&source.path) {
            if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
                if let Some(lsp) = parsed.get("lsp").and_then(Value::as_object) {
                    for (id, entry) in lsp {
                        if entry
                            .get("disabled")
                            .and_then(Value::as_bool)
                            .unwrap_or(false)
                        {
                            seen.insert(id.clone(), usize::MAX);
                            continue;
                        }
                        if seen.contains_key(id) {
                            continue;
                        }
                        if let Some(server) = server_from_config(id, entry, source.kind) {
                            seen.insert(id.clone(), servers.len());
                            servers.push(server);
                        }
                    }
                }
            }
        }
    }

    for server in builtin_servers() {
        if seen.contains_key(&server.id) {
            continue;
        }
        seen.insert(server.id.clone(), servers.len());
        servers.push(server);
    }

    servers.sort_by(|a, b| {
        source_order(a.source)
            .cmp(&source_order(b.source))
            .then_with(|| b.priority.cmp(&a.priority))
    });
    servers
}

struct ConfigSource {
    path: PathBuf,
    kind: &'static str,
}

fn config_sources() -> Vec<ConfigSource> {
    let cwd = env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut sources = Vec::new();
    let project_paths = env::var_os("OCMM_LSP_PROJECT_CONFIG")
        .map(split_paths)
        .unwrap_or_else(|| {
            vec![
                PathBuf::from(".opencode/ocmm-lsp.json"),
                PathBuf::from(".opencode/lsp.json"),
                PathBuf::from(".codex/lsp-client.json"),
            ]
        });
    for path in project_paths {
        sources.push(ConfigSource {
            path: if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            },
            kind: "project",
        });
    }
    if let Some(user_path) = user_config_path() {
        sources.push(ConfigSource {
            path: user_path,
            kind: "user",
        });
    }
    sources
}

fn split_paths(raw: OsString) -> Vec<PathBuf> {
    env::split_paths(&raw).collect()
}

fn user_config_path() -> Option<PathBuf> {
    if let Some(raw) = env::var_os("OCMM_LSP_USER_CONFIG") {
        let path = PathBuf::from(raw);
        return Some(if path.is_absolute() {
            path
        } else {
            home_dir()?.join(path)
        });
    }
    Some(
        home_dir()?
            .join(".config")
            .join("opencode")
            .join("ocmm-lsp.json"),
    )
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn source_order(source: &str) -> i32 {
    match source {
        "project" => 0,
        "user" => 1,
        _ => 2,
    }
}

fn server_from_config(id: &str, entry: &Value, source: &'static str) -> Option<LspServer> {
    let command = entry.get("command").and_then(string_array).or_else(|| {
        builtin_servers()
            .into_iter()
            .find(|server| server.id == id)
            .map(|server| server.command)
    })?;
    let extensions = entry.get("extensions").and_then(string_array).or_else(|| {
        builtin_servers()
            .into_iter()
            .find(|server| server.id == id)
            .map(|server| server.extensions)
    })?;
    let env = entry
        .get("env")
        .and_then(Value::as_object)
        .map(|object| {
            object
                .iter()
                .filter_map(|(key, value)| {
                    value.as_str().map(|value| (key.clone(), value.to_string()))
                })
                .collect()
        })
        .unwrap_or_default();
    Some(LspServer {
        id: id.to_string(),
        command,
        extensions,
        priority: entry.get("priority").and_then(Value::as_i64).unwrap_or(0),
        env,
        initialization: entry.get("initialization").cloned(),
        source,
    })
}

fn string_array(value: &Value) -> Option<Vec<String>> {
    let array = value.as_array()?;
    let mut result = Vec::new();
    for item in array {
        result.push(item.as_str()?.to_string());
    }
    Some(result)
}

fn builtin_servers() -> Vec<LspServer> {
    vec![
        server(
            "typescript",
            &["typescript-language-server", "--stdio"],
            &[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
        ),
        server(
            "deno",
            &["deno", "lsp"],
            &[".ts", ".tsx", ".js", ".jsx", ".mjs"],
        ),
        server("vue", &["vue-language-server", "--stdio"], &[".vue"]),
        server(
            "pyright",
            &["pyright-langserver", "--stdio"],
            &[".py", ".pyi"],
        ),
        server(
            "basedpyright",
            &["basedpyright-langserver", "--stdio"],
            &[".py", ".pyi"],
        ),
        server("ruff", &["ruff", "server"], &[".py", ".pyi"]),
        server("rust", &["rust-analyzer"], &[".rs"]),
        server("gopls", &["gopls"], &[".go"]),
        server(
            "clangd",
            &["clangd", "--background-index"],
            &[".c", ".cc", ".cpp", ".cxx", ".h", ".hpp"],
        ),
        server(
            "bash",
            &["bash-language-server", "start"],
            &[".sh", ".bash", ".zsh"],
        ),
        server(
            "yaml-ls",
            &["yaml-language-server", "--stdio"],
            &[".yaml", ".yml"],
        ),
        server("lua-ls", &["lua-language-server"], &[".lua"]),
        server("php", &["intelephense", "--stdio"], &[".php"]),
        server(
            "terraform-ls",
            &["terraform-ls", "serve"],
            &[".tf", ".tfvars"],
        ),
        server("prisma", &["prisma", "language-server"], &[".prisma"]),
    ]
}

fn server(id: &str, command: &[&str], extensions: &[&str]) -> LspServer {
    LspServer {
        id: id.to_string(),
        command: command.iter().map(|value| value.to_string()).collect(),
        extensions: extensions.iter().map(|value| value.to_string()).collect(),
        priority: -100,
        env: HashMap::new(),
        initialization: None,
        source: "builtin",
    }
}

fn command_installed(command: &[String]) -> bool {
    let Some(cmd) = command.first() else {
        return false;
    };
    if cmd.contains('/') || cmd.contains('\\') {
        return Path::new(cmd).exists();
    }
    if cmd == "node" {
        return true;
    }
    find_in_path(cmd).is_some()
}

fn find_in_path(command: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH").or_else(|| env::var_os("Path"))?;
    let dirs: Vec<PathBuf> = env::split_paths(&path).collect();
    #[cfg(windows)]
    let suffixes: Vec<String> = env::var("PATHEXT")
        .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string())
        .split(';')
        .map(|part| part.to_ascii_lowercase())
        .chain([
            "".to_string(),
            ".exe".to_string(),
            ".cmd".to_string(),
            ".bat".to_string(),
        ])
        .collect();
    #[cfg(not(windows))]
    let suffixes = vec!["".to_string()];

    for dir in dirs {
        for suffix in &suffixes {
            let candidate = dir.join(format!("{command}{suffix}"));
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }
    None
}

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

impl LspSession {
    fn for_file(file_path: &str) -> Result<Self> {
        let abs = env::current_dir()?
            .join(file_path)
            .canonicalize()
            .with_context(|| format!("cannot resolve source file path: {file_path}"))?;
        let ext = effective_extension(&abs)
            .ok_or_else(|| anyhow!("file has no extension: {}", abs.display()))?;
        let server = find_server_for_extension(&ext)?;
        if !command_installed(&server.command) {
            bail!(
                "LSP server '{}' for {} is not installed. Command not found: {}",
                server.id,
                ext,
                server.command.first().cloned().unwrap_or_default()
            );
        }
        let root = find_workspace_root(&abs);
        let (program, args) = prepared_command(&server.command)?;
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
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            let mut reader = stdout;
            let mut buffer = Vec::<u8>::new();
            let mut chunk = [0_u8; 8192];
            loop {
                match reader.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(read) => {
                        buffer.extend_from_slice(&chunk[..read]);
                        while let Ok(Some(message)) = try_parse_lsp_message(&mut buffer) {
                            if tx.send(message).is_err() {
                                return;
                            }
                        }
                    }
                }
            }
        });
        Ok(Self {
            child,
            stdin,
            receiver: rx,
            next_id: 1,
            file_path: abs,
            root,
            server,
            diagnostics: HashMap::new(),
            closed: false,
        })
    }

    fn initialize(&mut self) -> Result<()> {
        let root_uri = path_to_uri(&self.root);
        let mut params = json!({
            "processId": std::process::id(),
            "rootUri": root_uri,
            "workspaceFolders": [{ "uri": root_uri, "name": self.root.file_name().and_then(|s| s.to_str()).unwrap_or("workspace") }],
            "capabilities": {
                "textDocument": {
                    "definition": { "linkSupport": true },
                    "implementation": { "linkSupport": true },
                    "references": {},
                    "documentSymbol": { "hierarchicalDocumentSymbolSupport": true },
                    "rename": { "prepareSupport": true },
                    "publishDiagnostics": { "relatedInformation": true }
                },
                "workspace": {
                    "symbol": {},
                    "workspaceFolders": true,
                    "configuration": true
                }
            },
            "initializationOptions": self.server.initialization.clone().unwrap_or(Value::Null)
        });
        if self.server.initialization.is_none() {
            params
                .as_object_mut()
                .unwrap()
                .remove("initializationOptions");
        }
        self.request_legacy("initialize", params)?;
        self.notify("initialized", json!({}))?;
        Ok(())
    }

    fn open_file(&mut self) -> Result<String> {
        let text = fs::read_to_string(&self.file_path)?;
        let uri = path_to_uri(&self.file_path);
        self.notify(
            "textDocument/didOpen",
            json!({
                "textDocument": {
                    "uri": uri,
                    "languageId": language_id(&self.file_path),
                    "version": 1,
                    "text": text
                }
            }),
        )?;
        Ok(uri)
    }

    fn request(&mut self, method: &str, params: Value) -> LspRequestResult<Value> {
        let id = self.next_id;
        self.next_id += 1;
        self.write_json(&json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))
            .map_err(LspRequestError::Client)?;
        let deadline = Instant::now() + Duration::from_millis(DEFAULT_REQUEST_TIMEOUT_MS);
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(LspRequestError::Client(anyhow!(
                    "LSP request timed out: {method}"
                )));
            }
            let message = self
                .receiver
                .recv_timeout(remaining)
                .map_err(|error| LspRequestError::Client(error.into()))?;
            self.handle_server_message_side_effects(&message)
                .map_err(LspRequestError::Client)?;
            if message.get("id").and_then(Value::as_u64) == Some(id) {
                if message.get("error").is_some() {
                    return Err(LspRequestError::from_response(&message));
                }
                return Ok(message.get("result").cloned().unwrap_or(Value::Null));
            }
        }
    }

    fn request_legacy(&mut self, method: &str, params: Value) -> Result<Value> {
        self.request(method, params)
            .map_err(|error| error.into_legacy(method))
    }

    fn notify(&mut self, method: &str, params: Value) -> Result<()> {
        self.write_json(&json!({ "jsonrpc": "2.0", "method": method, "params": params }))
    }

    fn collect_diagnostics(&mut self, uri: &str, wait: Duration) -> Result<Vec<Value>> {
        let deadline = Instant::now() + wait;
        while Instant::now() < deadline {
            let remaining = deadline.saturating_duration_since(Instant::now());
            match self
                .receiver
                .recv_timeout(remaining.min(Duration::from_millis(100)))
            {
                Ok(message) => self.handle_server_message_side_effects(&message)?,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        Ok(self.diagnostics.remove(uri).unwrap_or_default())
    }

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

    fn handle_server_message_side_effects(&mut self, message: &Value) -> Result<()> {
        if message.get("method").and_then(Value::as_str) == Some("textDocument/publishDiagnostics")
        {
            if let Some(params) = message.get("params") {
                if let Some(uri) = params.get("uri").and_then(Value::as_str) {
                    let diagnostics = params
                        .get("diagnostics")
                        .and_then(Value::as_array)
                        .cloned()
                        .unwrap_or_default();
                    self.diagnostics.insert(uri.to_string(), diagnostics);
                }
            }
        }
        if message.get("id").is_some()
            && message.get("method").is_some()
            && message.get("result").is_none()
        {
            let id = message.get("id").cloned().unwrap_or(Value::Null);
            let method = message.get("method").and_then(Value::as_str).unwrap_or("");
            let result = match method {
                "workspace/configuration" => json!([]),
                "client/registerCapability" | "window/workDoneProgress/create" => Value::Null,
                _ => Value::Null,
            };
            self.write_json(&json!({ "jsonrpc": "2.0", "id": id, "result": result }))?;
        }
        Ok(())
    }

    fn write_json(&mut self, value: &Value) -> Result<()> {
        let body = serde_json::to_string(value)?;
        write!(
            self.stdin,
            "Content-Length: {}\r\n\r\n{body}",
            body.as_bytes().len()
        )?;
        self.stdin.flush()?;
        Ok(())
    }
}

impl Drop for LspSession {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn try_parse_lsp_message(buffer: &mut Vec<u8>) -> Result<Option<Value>> {
    let Some(header_end) = find_bytes(buffer, b"\r\n\r\n") else {
        return Ok(None);
    };
    let headers = std::str::from_utf8(&buffer[..header_end])?;
    let length = parse_content_length(headers)?;
    let body_start = header_end + 4;
    let body_end = body_start + length;
    if buffer.len() < body_end {
        return Ok(None);
    }
    let body = buffer[body_start..body_end].to_vec();
    buffer.drain(..body_end);
    Ok(Some(serde_json::from_slice(&body)?))
}

fn effective_extension(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_string_lossy().to_ascii_lowercase();
    if name == "dockerfile" {
        return Some(".dockerfile".to_string());
    }
    path.extension()
        .map(|ext| format!(".{}", ext.to_string_lossy().to_ascii_lowercase()))
}

fn find_server_for_extension(ext: &str) -> Result<LspServer> {
    let mut candidates: Vec<LspServer> = merged_servers()
        .into_iter()
        .filter(|server| server.extensions.iter().any(|candidate| candidate == ext))
        .collect();
    candidates.sort_by(|a, b| b.priority.cmp(&a.priority));
    candidates
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("No LSP server configured for extension: {ext}"))
}

fn find_workspace_root(path: &Path) -> PathBuf {
    let markers = [
        ".git",
        "package.json",
        "pyproject.toml",
        "Cargo.toml",
        "go.mod",
        "pom.xml",
        "build.gradle",
    ];
    let mut dir = path.parent().unwrap_or(path).to_path_buf();
    loop {
        if markers.iter().any(|marker| dir.join(marker).exists()) {
            return dir;
        }
        if !dir.pop() {
            return path.parent().unwrap_or(path).to_path_buf();
        }
    }
}

fn prepared_command(command: &[String]) -> Result<(OsString, Vec<OsString>)> {
    let Some(cmd) = command.first() else {
        bail!("empty LSP command");
    };
    let args: Vec<OsString> = command.iter().skip(1).map(OsString::from).collect();
    #[cfg(windows)]
    {
        let resolved = find_in_path(cmd).unwrap_or_else(|| PathBuf::from(cmd));
        let lower = resolved.to_string_lossy().to_ascii_lowercase();
        if lower.ends_with(".cmd") || lower.ends_with(".bat") {
            let mut shell_args = vec![
                OsString::from("/d"),
                OsString::from("/s"),
                OsString::from("/c"),
                resolved.into_os_string(),
            ];
            shell_args.extend(args);
            return Ok((OsString::from("cmd.exe"), shell_args));
        }
        return Ok((resolved.into_os_string(), args));
    }
    #[cfg(not(windows))]
    {
        Ok((OsString::from(cmd), args))
    }
}

fn path_to_uri(path: &Path) -> String {
    let mut text = path.to_string_lossy().replace('\\', "/");
    #[cfg(windows)]
    {
        if !text.starts_with('/') {
            text = format!("/{text}");
        }
    }
    format!("file://{}", percent_encode_path(&text))
}

fn percent_encode_path(input: &str) -> String {
    input
        .bytes()
        .flat_map(|byte| match byte {
            b' ' => "%20".bytes().collect::<Vec<_>>(),
            b'#' => "%23".bytes().collect::<Vec<_>>(),
            b'?' => "%3F".bytes().collect::<Vec<_>>(),
            _ => vec![byte],
        })
        .map(char::from)
        .collect()
}

fn language_id(path: &Path) -> &'static str {
    match effective_extension(path).as_deref() {
        Some(".ts") | Some(".tsx") => "typescript",
        Some(".js") | Some(".jsx") | Some(".mjs") | Some(".cjs") => "javascript",
        Some(".py") | Some(".pyi") => "python",
        Some(".rs") => "rust",
        Some(".go") => "go",
        Some(".lua") => "lua",
        Some(".php") => "php",
        Some(".yaml") | Some(".yml") => "yaml",
        Some(".sh") | Some(".bash") | Some(".zsh") => "shellscript",
        _ => "plaintext",
    }
}

fn severity_name(value: Option<&Value>) -> &'static str {
    match value.and_then(Value::as_u64).unwrap_or(0) {
        1 => "error",
        2 => "warning",
        3 => "information",
        4 => "hint",
        _ => "information",
    }
}

fn format_diagnostic(value: &Value) -> String {
    let range = value.get("range").unwrap_or(&Value::Null);
    let start = range.get("start").unwrap_or(&Value::Null);
    let line = start.get("line").and_then(Value::as_u64).unwrap_or(0) + 1;
    let character = start.get("character").and_then(Value::as_u64).unwrap_or(0);
    let message = value
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("<no message>");
    let severity = severity_name(value.get("severity"));
    format!("{line}:{character} [{severity}] {message}")
}

fn format_locations_or_value(value: &Value, label: &str) -> String {
    if value.is_null() {
        return format!("No {label} result.");
    }
    let mut lines = Vec::new();
    collect_locations(value, &mut lines);
    if lines.is_empty() {
        serde_json::to_string_pretty(value).unwrap_or_else(|_| format!("No {label} result."))
    } else {
        lines.join("\n")
    }
}

fn collect_locations(value: &Value, lines: &mut Vec<String>) {
    if let Some(array) = value.as_array() {
        for item in array {
            collect_locations(item, lines);
        }
        return;
    }
    let Some(object) = value.as_object() else {
        return;
    };
    if let Some(uri) = object
        .get("uri")
        .or_else(|| object.get("targetUri"))
        .and_then(Value::as_str)
    {
        let range = object
            .get("range")
            .or_else(|| object.get("targetSelectionRange"))
            .unwrap_or(&Value::Null);
        let start = range.get("start").unwrap_or(&Value::Null);
        let line = start.get("line").and_then(Value::as_u64).unwrap_or(0) + 1;
        let character = start.get("character").and_then(Value::as_u64).unwrap_or(0);
        lines.push(format!("{uri}:{line}:{character}"));
    }
}

fn format_symbols(value: &Value, limit: usize) -> String {
    let mut lines = Vec::new();
    collect_symbols(value, 0, &mut lines, limit);
    if lines.is_empty() {
        "No symbols returned.".to_string()
    } else {
        lines.join("\n")
    }
}

fn collect_symbols(value: &Value, depth: usize, lines: &mut Vec<String>, limit: usize) {
    if lines.len() >= limit {
        return;
    }
    if let Some(array) = value.as_array() {
        for item in array {
            collect_symbols(item, depth, lines, limit);
        }
        return;
    }
    let Some(object) = value.as_object() else {
        return;
    };
    if let Some(name) = object.get("name").and_then(Value::as_str) {
        lines.push(format!("{}{}", "  ".repeat(depth), name));
    }
    if let Some(children) = object.get("children") {
        collect_symbols(children, depth + 1, lines, limit);
    }
}

#[allow(dead_code)]
fn object_from_pairs(pairs: &[(&str, Value)]) -> Value {
    let mut object = Map::new();
    for (key, value) in pairs {
        object.insert((*key).to_string(), value.clone());
    }
    Value::Object(object)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader};
    #[cfg(windows)]
    use std::process::Child;
    use std::process::{Command, Stdio};
    #[cfg(windows)]
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    use std::time::{Instant, SystemTime, UNIX_EPOCH};

    #[test]
    fn lsp_response_error_preserves_code_message_and_data() {
        let details = LspErrorDetails::from_response(&json!({
            "code": -32601,
            "message": "Method not found",
            "data": { "method": "textDocument/implementation" }
        }));

        assert_eq!(details.code, -32601);
        assert_eq!(details.message, "Method not found");
        assert_eq!(
            details.data,
            Some(json!({ "method": "textDocument/implementation" }))
        );
        assert_eq!(
            details.to_json(),
            json!({
                "code": -32601,
                "message": "Method not found",
                "data": { "method": "textDocument/implementation" }
            })
        );
    }

    #[test]
    fn lsp_request_error_maps_client_and_malformed_errors() {
        let client =
            LspRequestError::Client(anyhow!("LSP request timed out: textDocument/definition"));
        let client_details = client.details();
        assert_eq!(client_details.code, LSP_CLIENT_ERROR_CODE);
        assert_eq!(client_details.data, None);
        assert!(!client.is_method_not_found());

        let malformed = json!({
            "jsonrpc": "2.0",
            "id": 7,
            "error": { "unexpected": true }
        });
        let response = LspRequestError::from_response(&malformed);
        let response_details = response.details();
        assert_eq!(response_details.code, -32603);
        assert!(response_details
            .message
            .contains("Malformed LSP JSON-RPC error response"));
        assert_eq!(response_details.data, Some(json!({ "unexpected": true })));

        let method_not_found = LspRequestError::from_response(&json!({
            "code": -32601,
            "message": "Method not found"
        }));
        assert!(method_not_found.is_method_not_found());
        assert_eq!(method_not_found.details().to_json()["data"], Value::Null);
    }

    #[test]
    fn legacy_request_error_preserves_valid_response_without_data() {
        let error = LspRequestError::from_response(&json!({
            "jsonrpc": "2.0",
            "id": 11,
            "error": {
                "code": -32601,
                "message": "Method not found"
            }
        }));

        assert_eq!(
            error
                .into_legacy("textDocument/definition")
                .to_string(),
            "LSP request textDocument/definition failed: {\"code\":-32601,\"message\":\"Method not found\"}"
        );
    }

    #[test]
    fn legacy_request_error_preserves_malformed_inner_response() {
        let error = LspRequestError::from_response(&json!({
            "jsonrpc": "2.0",
            "id": 12,
            "error": { "unexpected": true }
        }));

        assert_eq!(
            error.into_legacy("textDocument/definition").to_string(),
            "LSP request textDocument/definition failed: {\"unexpected\":true}"
        );
    }

    #[test]
    fn legacy_request_error_preserves_client_error_text() {
        let error = LspRequestError::Client(anyhow!("channel closed"));

        assert_eq!(
            error.into_legacy("textDocument/definition").to_string(),
            "channel closed"
        );
    }

    fn node_command(script: &str) -> Command {
        let mut command = Command::new("node");
        command
            .arg("-e")
            .arg(script)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        command
    }

    #[test]
    fn child_reaper_allows_natural_exit_before_deadline() {
        let mut command = Command::new("node");
        command
            .arg("-e")
            .arg(
                "process.stdout.write('ready\\n'); process.stdin.once('data', () => setTimeout(() => process.exit(0), 20));",
            )
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        let mut child = ManagedChild::spawn(&mut command)
            .expect("Node is required by this repository's test environment");
        let stdout = child
            .child
            .stdout
            .take()
            .expect("Node child stdout should be piped");
        let mut stdout = BufReader::new(stdout);
        let mut ready = String::new();
        stdout
            .read_line(&mut ready)
            .expect("Node child should report readiness");
        assert_eq!(ready, "ready\n");
        let stdin = child
            .child
            .stdin
            .as_mut()
            .expect("Node child stdin should be piped");
        stdin
            .write_all(b"go\n")
            .expect("Node child should accept the start signal");
        stdin
            .flush()
            .expect("Node child start signal should be flushed");

        let outcome = reap_child_after_exit(
            &mut child,
            Duration::from_millis(500),
            Duration::from_millis(10),
            Duration::from_millis(2_000),
        )
        .expect("natural child cleanup should succeed");

        assert_eq!(outcome, ChildReapOutcome::Exited);
        assert!(child
            .child
            .try_wait()
            .expect("reaped child should remain observable")
            .is_some());
    }

    #[test]
    fn child_reaper_kills_and_reaps_only_after_timeout() {
        let mut command = node_command("setInterval(() => {}, 1_000);");
        let mut child = ManagedChild::spawn(&mut command)
            .expect("Node is required by this repository's test environment");
        let started = Instant::now();

        let outcome = reap_child_after_exit(
            &mut child,
            Duration::from_millis(80),
            Duration::from_millis(10),
            Duration::from_millis(2_000),
        )
        .expect("timed-out child cleanup should succeed");
        let elapsed = started.elapsed();

        assert_eq!(outcome, ChildReapOutcome::KilledAfterTimeout);
        assert!(elapsed >= Duration::from_millis(70), "elapsed: {elapsed:?}");
        assert!(elapsed < Duration::from_secs(2), "elapsed: {elapsed:?}");
        assert!(child
            .child
            .try_wait()
            .expect("reaped child should remain observable")
            .is_some());
    }

    #[cfg(windows)]
    struct TestChildGuard(Child);

    #[cfg(windows)]
    impl TestChildGuard {
        fn terminate_and_reap(&mut self) -> bool {
            let _ = self.0.kill();
            let deadline = Instant::now() + Duration::from_secs(2);
            while Instant::now() < deadline {
                match self.0.try_wait() {
                    Ok(Some(_)) => return true,
                    Ok(None) => {}
                    Err(_) => return false,
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            false
        }
    }

    #[cfg(windows)]
    impl Drop for TestChildGuard {
        fn drop(&mut self) {
            let _ = self.terminate_and_reap();
        }
    }

    #[cfg(windows)]
    fn windows_test_dir(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should follow Unix epoch")
            .as_nanos();
        let root = env::temp_dir().join(format!("{prefix}-{}-{unique}", std::process::id()));
        fs::create_dir_all(&root).expect("create Windows lifecycle test directory");
        root
    }

    #[cfg(windows)]
    fn process_is_alive(pid: u32) -> bool {
        Command::new("node")
            .arg("-e")
            .arg(
                "try { process.kill(Number(process.argv[1]), 0); process.exit(0); } catch (error) { process.exit(error.code === 'ESRCH' ? 1 : 2); }",
            )
            .arg(pid.to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .expect("run Node process liveness probe")
            .success()
    }

    #[cfg(windows)]
    fn wait_for_process_gone(pid: u32, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        loop {
            if !process_is_alive(pid) {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    #[cfg(windows)]
    fn wait_for_pid_file(path: &Path, timeout: Duration) -> u32 {
        let deadline = Instant::now() + timeout;
        loop {
            if let Ok(contents) = fs::read_to_string(path) {
                if let Ok(pid) = contents.trim().parse() {
                    return pid;
                }
            }
            assert!(Instant::now() < deadline, "timed out waiting for {path:?}");
            std::thread::sleep(Duration::from_millis(10));
        }
    }

    #[cfg(windows)]
    #[test]
    fn windows_job_abi_matches_supported_64_bit_windows_layout() {
        use std::mem::{align_of, offset_of, size_of};

        assert_eq!(size_of::<JobObjectBasicLimitInformation>(), 64);
        assert_eq!(align_of::<JobObjectBasicLimitInformation>(), 8);
        assert_eq!(
            offset_of!(JobObjectBasicLimitInformation, minimum_working_set_size),
            24
        );
        assert_eq!(
            offset_of!(JobObjectBasicLimitInformation, maximum_working_set_size),
            32
        );
        assert_eq!(offset_of!(JobObjectBasicLimitInformation, affinity), 48);
        assert_eq!(
            offset_of!(JobObjectBasicLimitInformation, priority_class),
            56
        );
        assert_eq!(
            offset_of!(JobObjectBasicLimitInformation, scheduling_class),
            60
        );
        assert_eq!(size_of::<IoCounters>(), 48);
        assert_eq!(align_of::<IoCounters>(), 8);
        assert_eq!(size_of::<JobObjectExtendedLimitInformation>(), 144);
        assert_eq!(align_of::<JobObjectExtendedLimitInformation>(), 8);
        assert_eq!(offset_of!(JobObjectExtendedLimitInformation, io_info), 64);
        assert_eq!(
            offset_of!(JobObjectExtendedLimitInformation, process_memory_limit),
            112
        );
        assert_eq!(
            offset_of!(JobObjectExtendedLimitInformation, job_memory_limit),
            120
        );
        assert_eq!(
            offset_of!(JobObjectExtendedLimitInformation, peak_process_memory_used),
            128
        );
        assert_eq!(
            offset_of!(JobObjectExtendedLimitInformation, peak_job_memory_used),
            136
        );
        assert_eq!(size_of::<ThreadEntry32>(), 28);
        assert_eq!(align_of::<ThreadEntry32>(), 4);
        assert_eq!(offset_of!(ThreadEntry32, size), 0);
        assert_eq!(offset_of!(ThreadEntry32, usage_count), 4);
        assert_eq!(offset_of!(ThreadEntry32, thread_id), 8);
        assert_eq!(offset_of!(ThreadEntry32, owner_process_id), 12);
        assert_eq!(offset_of!(ThreadEntry32, base_priority), 16);
        assert_eq!(offset_of!(ThreadEntry32, delta_priority), 20);
        assert_eq!(offset_of!(ThreadEntry32, flags), 24);
        assert_eq!(CREATE_SUSPENDED, 0x0000_0004);
        assert_eq!(CREATE_NO_WINDOW, 0x0800_0000);
        assert_eq!(JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS, 9);
        assert_eq!(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, 0x0000_2000);
        assert_eq!(TH32CS_SNAPTHREAD, 0x0000_0004);
        assert_eq!(THREAD_SUSPEND_RESUME, 0x0002);
        assert_eq!(THREAD_QUERY_LIMITED_INFORMATION, 0x0800);
        assert_eq!(RESUME_THREAD_FAILED, u32::MAX);
    }

    #[cfg(windows)]
    struct BarrierObservingOps {
        real: RealWindowsLaunchOps,
        marker: PathBuf,
    }

    #[cfg(windows)]
    impl BarrierObservingOps {
        fn assert_child_has_not_executed(&self) {
            assert!(
                !self.marker.exists(),
                "suspended child executed before Job assignment and primary-thread resume"
            );
        }
    }

    #[cfg(windows)]
    impl WindowsLaunchOps for BarrierObservingOps {
        fn assign_process(&self, job: &WindowsJob, child: &Child) -> io::Result<()> {
            self.assert_child_has_not_executed();
            self.real.assign_process(job, child)
        }

        fn open_initial_thread(&self, child_pid: u32) -> io::Result<OwnedWindowsHandle> {
            self.assert_child_has_not_executed();
            self.real.open_initial_thread(child_pid)
        }

        fn thread_owner_pid(&self, thread: &OwnedWindowsHandle) -> io::Result<u32> {
            self.assert_child_has_not_executed();
            self.real.thread_owner_pid(thread)
        }

        fn resume_thread(&self, thread: &OwnedWindowsHandle) -> io::Result<u32> {
            self.assert_child_has_not_executed();
            self.real.resume_thread(thread)
        }
    }

    #[cfg(windows)]
    #[test]
    fn windows_job_suspended_launch_blocks_execution_until_assignment_and_resume() {
        let root = windows_test_dir("ocmm-lsp-launch-barrier");
        let marker = root.join("marker.txt");
        let mut command = Command::new("node");
        command
            .arg("-e")
            .arg(
                "require('node:fs').writeFileSync(process.env.OCMM_LSP_TEST_MARKER, 'ran'); process.stdout.write('ready\\n'); process.stdin.once('data', data => { process.stdout.write(`echo:${data}`); process.exit(0); });",
            )
            .env("OCMM_LSP_TEST_MARKER", &marker)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        let ops = BarrierObservingOps {
            real: RealWindowsLaunchOps,
            marker: marker.clone(),
        };

        let mut child = spawn_windows_managed_child_with_ops(&mut command, &ops)
            .expect("suspended Job launch should succeed");
        let marker_deadline = Instant::now() + Duration::from_secs(1);
        while !marker.exists() && Instant::now() < marker_deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(marker.exists(), "child marker should appear after resume");

        let stdout = child.child.stdout.take().expect("piped stdout");
        let mut stdout = BufReader::new(stdout);
        let mut line = String::new();
        stdout.read_line(&mut line).expect("read ready output");
        assert_eq!(line, "ready\n");
        child
            .child
            .stdin
            .as_mut()
            .expect("piped stdin")
            .write_all(b"ping\n")
            .expect("write child stdin");
        child
            .child
            .stdin
            .as_mut()
            .expect("piped stdin")
            .flush()
            .expect("flush child stdin");
        line.clear();
        stdout.read_line(&mut line).expect("read echoed output");
        assert_eq!(line, "echo:ping\n");
        assert_eq!(
            reap_child_after_exit(
                &mut child,
                Duration::from_millis(500),
                Duration::from_millis(10),
                Duration::from_secs(2),
            )
            .expect("reap resumed child"),
            ChildReapOutcome::Exited
        );
        fs::remove_dir_all(&root).expect("remove launch-barrier test directory");
        assert!(!root.exists());
    }

    #[cfg(windows)]
    #[derive(Clone, Copy, PartialEq, Eq)]
    enum InjectedLaunchFailure {
        Assignment,
        Enumeration,
        OwnerMismatch,
        Resume,
    }

    #[cfg(windows)]
    struct InjectedLaunchFailureOps {
        real: RealWindowsLaunchOps,
        failure: InjectedLaunchFailure,
        child_pid: AtomicU32,
        opened_thread: AtomicBool,
        called_resume: AtomicBool,
    }

    #[cfg(windows)]
    impl WindowsLaunchOps for InjectedLaunchFailureOps {
        fn assign_process(&self, job: &WindowsJob, child: &Child) -> io::Result<()> {
            self.child_pid.store(child.id(), Ordering::SeqCst);
            if self.failure == InjectedLaunchFailure::Assignment {
                return Err(io::Error::other("injected assignment failure"));
            }
            self.real.assign_process(job, child)
        }

        fn open_initial_thread(&self, child_pid: u32) -> io::Result<OwnedWindowsHandle> {
            self.opened_thread.store(true, Ordering::SeqCst);
            if self.failure == InjectedLaunchFailure::Enumeration {
                return Err(io::Error::other("injected thread enumeration failure"));
            }
            self.real.open_initial_thread(child_pid)
        }

        fn thread_owner_pid(&self, thread: &OwnedWindowsHandle) -> io::Result<u32> {
            let owner = self.real.thread_owner_pid(thread)?;
            if self.failure == InjectedLaunchFailure::OwnerMismatch {
                Ok(owner.wrapping_add(1))
            } else {
                Ok(owner)
            }
        }

        fn resume_thread(&self, thread: &OwnedWindowsHandle) -> io::Result<u32> {
            self.called_resume.store(true, Ordering::SeqCst);
            if self.failure == InjectedLaunchFailure::Resume {
                Err(io::Error::other("injected resume failure"))
            } else {
                self.real.resume_thread(thread)
            }
        }
    }

    #[cfg(windows)]
    fn assert_windows_launch_fails_closed(failure: InjectedLaunchFailure, expected_error: &str) {
        let root = windows_test_dir("ocmm-lsp-launch-failure");
        let marker = root.join("marker.txt");
        let mut command = Command::new("node");
        command
            .arg("-e")
            .arg(
                "require('node:fs').writeFileSync(process.env.OCMM_LSP_TEST_MARKER, 'ran'); setInterval(() => {}, 1000);",
            )
            .env("OCMM_LSP_TEST_MARKER", &marker)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let ops = InjectedLaunchFailureOps {
            real: RealWindowsLaunchOps,
            failure,
            child_pid: AtomicU32::new(0),
            opened_thread: AtomicBool::new(false),
            called_resume: AtomicBool::new(false),
        };
        let started = Instant::now();

        let error = spawn_windows_managed_child_with_ops(&mut command, &ops)
            .expect_err("injected launch step should fail");
        let elapsed = started.elapsed();
        let child_pid = ops.child_pid.load(Ordering::SeqCst);

        assert!(
            error.to_string().contains(expected_error),
            "error: {error:#}"
        );
        assert!(!marker.exists(), "failed launch executed the child marker");
        assert!(
            child_pid != 0,
            "test seam should observe the direct child PID"
        );
        assert!(
            wait_for_process_gone(child_pid, Duration::from_secs(1)),
            "failed launch left direct child {child_pid} alive"
        );
        assert!(elapsed < Duration::from_secs(3), "elapsed: {elapsed:?}");
        if failure == InjectedLaunchFailure::Assignment {
            assert!(!ops.opened_thread.load(Ordering::SeqCst));
            assert!(!ops.called_resume.load(Ordering::SeqCst));
        } else if matches!(
            failure,
            InjectedLaunchFailure::Enumeration | InjectedLaunchFailure::OwnerMismatch
        ) {
            assert!(ops.opened_thread.load(Ordering::SeqCst));
            assert!(!ops.called_resume.load(Ordering::SeqCst));
        } else {
            assert!(ops.opened_thread.load(Ordering::SeqCst));
            assert!(ops.called_resume.load(Ordering::SeqCst));
        }
        fs::remove_dir_all(&root).expect("remove launch-failure test directory");
        assert!(!root.exists());
    }

    #[cfg(windows)]
    #[test]
    fn windows_job_assignment_failure_never_resumes_unmanaged_child() {
        assert_windows_launch_fails_closed(
            InjectedLaunchFailure::Assignment,
            "assign suspended child to Job Object",
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_job_thread_enumeration_failure_never_resumes_child() {
        assert_windows_launch_fails_closed(
            InjectedLaunchFailure::Enumeration,
            "open suspended initial thread",
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_job_thread_enumeration_accepts_only_no_more_files_as_eof() {
        assert!(thread32_next_has_entry(1, io::Error::from_raw_os_error(5))
            .expect("successful Thread32Next ignores stale last error"));
        assert!(
            !thread32_next_has_entry(0, io::Error::from_raw_os_error(ERROR_NO_MORE_FILES),)
                .expect("ERROR_NO_MORE_FILES ends enumeration")
        );
        let error = thread32_next_has_entry(0, io::Error::from_raw_os_error(5))
            .expect_err("unexpected Thread32Next error must fail closed");
        assert_eq!(error.kind(), io::ErrorKind::PermissionDenied);
        assert!(error.to_string().contains("Thread32Next failed"));
    }

    #[cfg(windows)]
    #[test]
    fn windows_job_owner_mismatch_never_resumes_child() {
        assert_windows_launch_fails_closed(
            InjectedLaunchFailure::OwnerMismatch,
            "suspended initial thread owner mismatch",
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_job_resume_failure_never_executes_child_marker() {
        assert_windows_launch_fails_closed(
            InjectedLaunchFailure::Resume,
            "resume suspended initial thread",
        );
    }

    #[cfg(windows)]
    struct WindowsCommandTreeFixture {
        root: PathBuf,
        child: ManagedChild,
        descendant_pid: Option<u32>,
    }

    #[cfg(windows)]
    impl WindowsCommandTreeFixture {
        fn new(exit_wrapper_immediately: bool) -> Self {
            let root = windows_test_dir("ocmm-lsp-command-tree");
            let wrapper = root.join("mock-server.cmd");
            let descendant = root.join("descendant.mjs");
            let pid_file = root.join("descendant.pid");
            fs::write(
                &descendant,
                "import fs from 'node:fs'; fs.writeFileSync(process.env.OCMM_LSP_TEST_PID_FILE, String(process.pid)); setTimeout(() => process.exit(0), 3000); setInterval(() => {}, 1000);\n",
            )
            .expect("write command-tree descendant");
            let wrapper_body = if exit_wrapper_immediately {
                "@echo off\r\nstart \"\" /b node \"%OCMM_LSP_TEST_DESCENDANT_SCRIPT%\"\r\nexit /b 0\r\n"
            } else {
                "@echo off\r\nnode \"%OCMM_LSP_TEST_DESCENDANT_SCRIPT%\"\r\n"
            };
            fs::write(&wrapper, wrapper_body).expect("write command-tree wrapper");

            let mut command = Command::new("cmd.exe");
            command
                .args(["/D", "/S", "/C"])
                .arg(&wrapper)
                .env("OCMM_LSP_TEST_PID_FILE", &pid_file)
                .env("OCMM_LSP_TEST_DESCENDANT_SCRIPT", &descendant)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            let child = ManagedChild::spawn(&mut command).expect("spawn command-tree wrapper");

            Self {
                root,
                child,
                descendant_pid: None,
            }
        }

        fn wait_for_descendant_pid(&mut self) -> u32 {
            let pid_file = self.root.join("descendant.pid");
            let pid = wait_for_pid_file(&pid_file, Duration::from_secs(3));
            self.descendant_pid = Some(pid);
            pid
        }
    }

    #[cfg(windows)]
    impl Drop for WindowsCommandTreeFixture {
        fn drop(&mut self) {
            let _ = reap_child_after_exit(
                &mut self.child,
                Duration::ZERO,
                Duration::from_millis(10),
                Duration::from_secs(2),
            );
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[cfg(windows)]
    #[test]
    fn windows_job_timeout_kills_cmd_wrapper_and_descendant_but_not_sentinel() {
        let started = Instant::now();
        let mut fixture = WindowsCommandTreeFixture::new(false);
        let descendant_pid = fixture.wait_for_descendant_pid();
        let mut sentinel = TestChildGuard(
            node_command("setInterval(() => {}, 1000);")
                .spawn()
                .expect("spawn unrelated sentinel"),
        );

        let outcome = reap_child_after_exit(
            &mut fixture.child,
            Duration::from_millis(80),
            Duration::from_millis(10),
            Duration::from_secs(2),
        )
        .expect("command-tree timeout cleanup should succeed");

        assert_eq!(outcome, ChildReapOutcome::KilledAfterTimeout);
        assert!(fixture
            .child
            .child
            .try_wait()
            .expect("reaped command-tree wrapper should remain observable")
            .is_some());
        assert!(
            wait_for_process_gone(descendant_pid, Duration::from_millis(1_500)),
            "Node descendant {descendant_pid} survived command-tree cleanup"
        );
        assert!(
            sentinel
                .0
                .try_wait()
                .expect("query unrelated sentinel")
                .is_none(),
            "unrelated sentinel was terminated with the managed Job"
        );
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "command-tree cleanup took {:?}",
            started.elapsed()
        );
        assert!(
            sentinel.terminate_and_reap(),
            "unrelated sentinel did not reap during bounded test cleanup"
        );
        fixture.descendant_pid = None;
        fs::remove_dir_all(&fixture.root).expect("remove command-tree test directory");
        assert!(!fixture.root.exists());
    }

    #[cfg(windows)]
    #[test]
    fn windows_job_natural_wrapper_exit_closes_job_and_kills_descendant() {
        let mut fixture = WindowsCommandTreeFixture::new(true);
        let descendant_pid = fixture.wait_for_descendant_pid();

        let outcome = reap_child_after_exit(
            &mut fixture.child,
            Duration::from_millis(500),
            Duration::from_millis(10),
            Duration::from_secs(2),
        )
        .expect("natural wrapper cleanup should succeed");

        assert_eq!(outcome, ChildReapOutcome::Exited);
        assert!(fixture
            .child
            .child
            .try_wait()
            .expect("query reaped command wrapper")
            .is_some());
        assert!(
            wait_for_process_gone(descendant_pid, Duration::from_millis(1_500)),
            "Node descendant {descendant_pid} survived natural wrapper Job close"
        );
        fixture.descendant_pid = None;
        fs::remove_dir_all(&fixture.root).expect("remove natural-wrapper test directory");
        assert!(!fixture.root.exists());
    }

    #[test]
    fn normalize_locations_is_stable_and_group_local() {
        let location = json!({
            "uri": "file:///mock/a.rs",
            "range": {
                "start": { "line": 2, "character": 3 },
                "end": { "line": 2, "character": 8 }
            }
        });
        let link = json!({
            "targetUri": "file:///mock/link.rs",
            "targetRange": {
                "start": { "line": 4, "character": 1 },
                "end": { "line": 4, "character": 9 }
            },
            "targetSelectionRange": {
                "start": { "line": 7, "character": 2 },
                "end": { "line": 7, "character": 6 }
            }
        });

        let first_group = normalize_locations(&json!([location.clone(), location.clone(), link]));
        let second_group = normalize_locations(&location);

        assert_eq!(first_group.len(), 2);
        assert_eq!(first_group[0], location);
        assert_eq!(first_group[1]["uri"], "file:///mock/link.rs");
        assert_eq!(first_group[1]["range"]["start"]["line"], 7);
        assert_eq!(second_group, vec![location]);
    }

    #[test]
    fn parses_line_mcp_message() {
        let mut buffer = br#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#.to_vec();
        buffer.push(b'\n');
        let parsed = try_parse_message(&mut buffer).unwrap().unwrap();
        assert_eq!(parsed.0["method"], "ping");
        assert!(buffer.is_empty());
    }

    #[test]
    fn parses_framed_mcp_message() {
        let body = br#"{"jsonrpc":"2.0","id":1,"method":"ping"}"#;
        let mut buffer = format!("Content-Length: {}\r\n\r\n", body.len()).into_bytes();
        buffer.extend_from_slice(body);
        let parsed = try_parse_message(&mut buffer).unwrap().unwrap();
        assert_eq!(parsed.0["method"], "ping");
        assert!(buffer.is_empty());
    }

    #[test]
    fn tool_aliases_match_canonical_names() {
        assert_eq!(normalize_tool_name("lsp_status"), "status");
        assert_eq!(
            normalize_tool_name("lsp_goto_definition"),
            "goto_definition"
        );
        assert_eq!(normalize_tool_name("lsp_rename"), "rename");
        assert_eq!(
            normalize_tool_name("lsp_find_symbol_related"),
            "find_symbol_related"
        );
        assert_eq!(normalize_tool_name("symbols"), "symbols");
    }

    #[test]
    fn workspace_edit_applies_inside_workspace() {
        let root = temp_dir("ocmm-lsp-edit");
        fs::create_dir_all(&root).unwrap();
        let file = root.join("file.rs");
        fs::write(&file, "let old_name = 1;\n").unwrap();

        let edit = json!({
            "changes": {
                path_to_uri(&file): [{
                    "range": {
                        "start": { "line": 0, "character": 4 },
                        "end": { "line": 0, "character": 12 }
                    },
                    "newText": "new_name"
                }]
            }
        });

        let result = apply_workspace_edit(&edit, &root);
        assert!(result.success, "{:?}", result.errors);
        assert_eq!(fs::read_to_string(&file).unwrap(), "let new_name = 1;\n");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn workspace_edit_rejects_outside_workspace() {
        let root = temp_dir("ocmm-lsp-root");
        let outside = temp_dir("ocmm-lsp-outside");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        let file = outside.join("file.rs");
        fs::write(&file, "let old_name = 1;\n").unwrap();

        let edit = json!({
            "changes": {
                path_to_uri(&file): [{
                    "range": {
                        "start": { "line": 0, "character": 4 },
                        "end": { "line": 0, "character": 12 }
                    },
                    "newText": "new_name"
                }]
            }
        });

        let result = apply_workspace_edit(&edit, &root);
        assert!(!result.success);
        assert!(result
            .errors
            .iter()
            .any(|error| error.contains("outside workspace")));
        assert_eq!(fs::read_to_string(&file).unwrap(), "let old_name = 1;\n");
        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_dir_all(outside);
    }

    fn temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        env::temp_dir().join(format!("{prefix}-{nanos}"))
    }
}
