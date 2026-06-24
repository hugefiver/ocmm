use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

struct McpProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl McpProcess {
    fn start() -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_ocmm-lsp"))
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
        }
    }

    fn request(&mut self, message: Value) -> Value {
        writeln!(self.stdin, "{}", serde_json::to_string(&message).unwrap()).unwrap();
        self.stdin.flush().unwrap();
        let mut line = String::new();
        self.stdout.read_line(&mut line).unwrap();
        serde_json::from_str(&line).unwrap()
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
    assert!(names.contains(&"symbols"));
    assert!(names.contains(&"prepare_rename"));
    assert!(names.contains(&"rename"));
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
