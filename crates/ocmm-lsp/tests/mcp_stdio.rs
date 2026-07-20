use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

static NEXT_WORKSPACE_ID: AtomicU64 = AtomicU64::new(1);

struct MockWorkspace {
    root: PathBuf,
    subject_path: PathBuf,
    config_path: PathBuf,
    trace_path: PathBuf,
    missing_user_config: PathBuf,
}

impl MockWorkspace {
    fn new(scenario: &str) -> Self {
        let id = NEXT_WORKSPACE_ID.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!("ocmm-lsp-mock-{}-{id}", std::process::id()));
        fs::create_dir_all(&root).expect("create mock workspace");

        let subject_path = root.join("subject.rs");
        let config_path = root.join("ocmm-lsp.json");
        let trace_path = root.join("trace.jsonl");
        let missing_user_config = root.join("missing-user-config.json");
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("mock_lsp.mjs");

        fs::write(&subject_path, "fn subject() {}\n").expect("write subject");
        fs::write(&trace_path, "").expect("create trace");
        fs::write(
            &config_path,
            serde_json::to_vec_pretty(&json!({
                "lsp": {
                    "mock": {
                        "command": ["node", fixture.to_string_lossy()],
                        "extensions": [".rs"],
                        "priority": 10_000,
                        "env": {
                            "MOCK_LSP_SCENARIO": scenario,
                            "MOCK_LSP_TRACE": trace_path.to_string_lossy()
                        }
                    }
                }
            }))
            .unwrap(),
        )
        .expect("write mock config");

        Self {
            root,
            subject_path,
            config_path,
            trace_path,
            missing_user_config,
        }
    }

    fn trace(&self) -> Vec<Value> {
        fs::read_to_string(&self.trace_path)
            .expect("read mock trace")
            .lines()
            .filter(|line| !line.is_empty())
            .map(|line| serde_json::from_str(line).expect("parse trace entry"))
            .collect()
    }
}

impl Drop for MockWorkspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

struct McpProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    workspace: Option<MockWorkspace>,
}

impl McpProcess {
    fn start() -> Self {
        Self::spawn(Command::new(env!("CARGO_BIN_EXE_ocmm-lsp")), None)
    }

    fn start_with_mock(scenario: &str) -> Self {
        let workspace = MockWorkspace::new(scenario);
        let mut command = Command::new(env!("CARGO_BIN_EXE_ocmm-lsp"));
        command
            .current_dir(&workspace.root)
            .env("OCMM_LSP_PROJECT_CONFIG", &workspace.config_path)
            .env("OCMM_LSP_USER_CONFIG", &workspace.missing_user_config);
        Self::spawn(command, Some(workspace))
    }

    fn spawn(mut command: Command, workspace: Option<MockWorkspace>) -> Self {
        let mut child = command
            .arg("mcp")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("spawn ocmm-lsp");
        let stdin = child.stdin.take().expect("stdin");
        let stdout = BufReader::new(child.stdout.take().expect("stdout"));
        Self {
            child,
            stdin,
            stdout,
            workspace,
        }
    }

    fn request(&mut self, message: Value) -> Value {
        writeln!(self.stdin, "{}", serde_json::to_string(&message).unwrap()).unwrap();
        self.stdin.flush().unwrap();
        let mut line = String::new();
        self.stdout.read_line(&mut line).unwrap();
        serde_json::from_str(&line).unwrap()
    }

    fn workspace(&self) -> &MockWorkspace {
        self.workspace.as_ref().expect("mock workspace")
    }
}

impl Drop for McpProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn initialize_returns_server_info() {
    let mut proc = McpProcess::start();
    let response = proc.request(json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": { "protocolVersion": "2025-03-26" }
    }));

    assert_eq!(response["result"]["serverInfo"]["name"], "ocmm-lsp");
    assert_eq!(response["result"]["protocolVersion"], "2025-03-26");
}

#[test]
fn tools_list_exposes_lsp_tools() {
    let mut proc = McpProcess::start();
    let response = proc.request(json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }));
    let tools = response["result"]["tools"].as_array().expect("tools array");
    let names: Vec<_> = tools
        .iter()
        .filter_map(|tool| tool["name"].as_str())
        .collect();

    assert!(names.contains(&"status"));
    assert!(names.contains(&"diagnostics"));
    assert!(names.contains(&"goto_definition"));
    assert!(names.contains(&"find_references"));
    assert!(names.contains(&"find_symbol_related"));
    assert!(names.contains(&"symbols"));
    assert!(names.contains(&"prepare_rename"));
    assert!(names.contains(&"rename"));

    let related = tools
        .iter()
        .find(|tool| tool["name"] == "find_symbol_related")
        .expect("find_symbol_related descriptor");
    assert_eq!(related["title"], "LSP Find Symbol Related");
    assert_eq!(
        related["description"],
        "Find definitions, implementations, and references for a symbol in one language-server session."
    );
    assert_eq!(
        related["inputSchema"],
        json!({
            "type": "object",
            "properties": {
                "filePath": { "type": "string" },
                "line": { "type": "integer", "minimum": 1 },
                "character": { "type": "integer", "minimum": 0 }
            },
            "required": ["filePath", "line", "character"],
            "additionalProperties": false
        })
    );
}

#[test]
fn lsp_status_alias_returns_text_content() {
    let mut proc = McpProcess::start();
    let response = proc.request(json!({
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": { "name": "lsp_status", "arguments": {} }
    }));

    assert_eq!(response["result"]["isError"], false);
    assert!(response["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Configured LSP servers"));
}

#[test]
fn unknown_tool_is_reported_as_tool_error() {
    let mut proc = McpProcess::start();
    let response = proc.request(json!({
        "jsonrpc": "2.0",
        "id": 4,
        "method": "tools/call",
        "params": { "name": "nope", "arguments": {} }
    }));

    assert_eq!(response["result"]["isError"], true);
    assert!(response["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Unknown LSP tool"));
}

fn details(response: &Value) -> &Value {
    response["result"]
        .get("details")
        .expect("tool response details")
}

fn trace_methods(proc: &McpProcess) -> Vec<String> {
    proc.workspace()
        .trace()
        .iter()
        .filter_map(|entry| entry["method"].as_str().map(str::to_string))
        .collect()
}

fn call_symbol_related(proc: &mut McpProcess, name: &str) -> Value {
    let file_path = proc.workspace().subject_path.to_string_lossy().to_string();
    proc.request(json!({
        "jsonrpc": "2.0",
        "id": 100,
        "method": "tools/call",
        "params": {
            "name": name,
            "arguments": { "filePath": file_path, "line": 1, "character": 0 }
        }
    }))
}

#[test]
fn find_symbol_related_uses_one_session_and_returns_all_groups() {
    let mut proc = McpProcess::start_with_mock("success");
    let response = call_symbol_related(&mut proc, "find_symbol_related");

    assert_eq!(response["result"]["isError"], false);
    assert_eq!(
        details(&response)["definition"]["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        details(&response)["implementation"]["items"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        details(&response)["references"]["items"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(
        response["result"]["content"][0]["text"],
        "definition: ok (1 items)\nfile:///mock/definition.rs:2:2\nimplementation: ok (1 items)\nfile:///mock/implementation.rs:4:4\nreferences: ok (2 items)\nfile:///mock/reference-a.rs:6:0\nfile:///mock/reference-b.rs:7:1"
    );

    let trace = proc.workspace().trace();
    assert_eq!(
        trace_methods(&proc),
        [
            "initialize",
            "initialized",
            "textDocument/didOpen",
            "textDocument/definition",
            "textDocument/implementation",
            "textDocument/references",
            "shutdown",
            "exit"
        ]
    );
    assert_eq!(
        trace[0]["params"]["capabilities"]["textDocument"]["implementation"]["linkSupport"],
        true
    );
    for request in &trace[3..6] {
        assert_eq!(request["params"]["position"]["line"], 0);
        assert_eq!(request["params"]["position"]["character"], 0);
    }
    assert_eq!(trace[5]["params"]["context"]["includeDeclaration"], true);
}

#[test]
fn find_symbol_related_alias_dispatches_to_grouped_tool() {
    let mut proc = McpProcess::start_with_mock("success");
    let response = call_symbol_related(&mut proc, "lsp_find_symbol_related");

    assert_eq!(response["result"]["isError"], false);
    assert_eq!(details(&response)["definition"]["status"], "ok");
    assert_eq!(details(&response)["implementation"]["status"], "ok");
    assert_eq!(details(&response)["references"]["status"], "ok");
    assert!(trace_methods(&proc).contains(&"textDocument/implementation".to_string()));
}

#[test]
fn find_symbol_related_deduplicates_and_normalizes_location_links() {
    let mut proc = McpProcess::start_with_mock("normalize");
    let response = call_symbol_related(&mut proc, "find_symbol_related");
    let related = details(&response);

    assert_eq!(related["definition"]["items"].as_array().unwrap().len(), 2);
    assert_eq!(
        related["definition"]["items"][0],
        json!({
            "uri": "file:///mock/a.rs",
            "range": {
                "start": { "line": 2, "character": 3 },
                "end": { "line": 2, "character": 8 }
            }
        })
    );
    assert_eq!(
        related["definition"]["items"][1]["range"]["start"]["line"],
        7
    );
    assert_eq!(
        related["implementation"]["items"].as_array().unwrap().len(),
        1
    );
    assert_eq!(
        related["implementation"]["items"][0]["range"]["start"]["line"],
        6
    );
    assert_eq!(related["references"]["items"].as_array().unwrap().len(), 1);
    assert_eq!(
        related["references"]["items"][0],
        related["definition"]["items"][0]
    );
}

#[test]
fn find_symbol_related_classifies_method_not_found_as_unsupported() {
    let mut proc = McpProcess::start_with_mock("unsupported");
    let response = call_symbol_related(&mut proc, "find_symbol_related");

    assert_eq!(response["result"]["isError"], false);
    assert_eq!(
        details(&response)["implementation"],
        json!({
            "status": "unsupported",
            "items": [],
            "error": {
                "code": -32601,
                "message": "Method not found",
                "data": { "method": "textDocument/implementation" }
            }
        })
    );
}

#[test]
fn find_symbol_related_keeps_partial_errors_below_top_level() {
    let mut proc = McpProcess::start_with_mock("partial-error");
    let response = call_symbol_related(&mut proc, "find_symbol_related");

    assert_eq!(response["result"]["isError"], false);
    assert_eq!(
        details(&response)["definition"],
        json!({
            "status": "error",
            "items": [],
            "error": {
                "code": -32001,
                "message": "Definition temporarily unavailable",
                "data": { "retryable": true }
            }
        })
    );
    assert_eq!(details(&response)["implementation"]["status"], "ok");
    assert_eq!(details(&response)["references"]["status"], "ok");
}

#[test]
fn find_symbol_related_keeps_only_inner_malformed_error_data() {
    let mut proc = McpProcess::start_with_mock("malformed-error");
    let response = call_symbol_related(&mut proc, "find_symbol_related");

    assert_eq!(response["result"]["isError"], false);
    assert_eq!(details(&response)["definition"]["status"], "error");
    assert_eq!(details(&response)["definition"]["error"]["code"], -32603);
    let data = &details(&response)["definition"]["error"]["data"];
    assert_eq!(data, &json!({ "unexpected": true }));
    assert!(data.get("jsonrpc").is_none());
    assert!(data.get("id").is_none());
    assert!(data.get("error").is_none());
    assert_eq!(details(&response)["implementation"]["status"], "ok");
    assert_eq!(details(&response)["references"]["status"], "ok");
}

#[test]
fn find_symbol_related_marks_three_errors_as_top_level_error() {
    let mut proc = McpProcess::start_with_mock("all-error");
    let response = call_symbol_related(&mut proc, "find_symbol_related");

    assert_eq!(response["result"]["isError"], true);
    assert_eq!(details(&response)["definition"]["error"]["code"], -32010);
    assert_eq!(
        details(&response)["implementation"]["error"]["code"],
        -32011
    );
    assert_eq!(details(&response)["references"]["error"]["code"], -32012);
}

#[test]
fn find_symbol_related_shuts_down_after_group_error() {
    let mut proc = McpProcess::start_with_mock("partial-error");
    let response = call_symbol_related(&mut proc, "find_symbol_related");

    assert_eq!(response["result"]["isError"], false);
    let methods = trace_methods(&proc);
    assert_eq!(
        &methods[methods.len() - 2..],
        ["shutdown".to_string(), "exit".to_string()]
    );
    assert_eq!(
        methods
            .iter()
            .filter(|method| *method == "shutdown")
            .count(),
        1
    );
    assert_eq!(methods.iter().filter(|method| *method == "exit").count(), 1);
}

#[test]
fn find_symbol_related_kills_server_that_ignores_exit_after_grace_period() {
    let mut proc = McpProcess::start_with_mock("ignore-exit");
    let started = Instant::now();
    let response = call_symbol_related(&mut proc, "find_symbol_related");
    let total_elapsed = started.elapsed();
    let returned_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock after Unix epoch")
        .as_millis() as u64;
    let trace = proc.workspace().trace();
    let exit_at_ms = trace
        .iter()
        .find(|entry| entry["method"] == "exit")
        .and_then(|entry| entry["observedAtMs"].as_u64())
        .expect("timestamped exit trace entry");
    let cleanup_elapsed = Duration::from_millis(returned_at_ms.saturating_sub(exit_at_ms));

    assert_eq!(response["result"]["isError"], false);
    assert!(
        cleanup_elapsed >= Duration::from_millis(400),
        "cleanup elapsed: {cleanup_elapsed:?}"
    );
    assert!(
        cleanup_elapsed < Duration::from_secs(5),
        "cleanup elapsed: {cleanup_elapsed:?}"
    );
    assert!(
        total_elapsed < Duration::from_secs(20),
        "total elapsed: {total_elapsed:?}"
    );
    let methods = trace
        .iter()
        .filter_map(|entry| entry["method"].as_str().map(str::to_string))
        .collect::<Vec<_>>();
    assert_eq!(
        &methods[methods.len() - 2..],
        ["shutdown".to_string(), "exit".to_string()]
    );
}
