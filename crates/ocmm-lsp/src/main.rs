use anyhow::{anyhow, bail, Context, Result};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
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
    let result = session.request(
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
    let result = session.request(
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
        session.request("workspace/symbol", json!({ "query": query }))?
    } else {
        session.request(
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
    let edit = session.request(
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
    child: Child,
    stdin: ChildStdin,
    receiver: Receiver<Value>,
    next_id: u64,
    file_path: PathBuf,
    root: PathBuf,
    server: LspServer,
    diagnostics: HashMap<String, Vec<Value>>,
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
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command
            .spawn()
            .with_context(|| format!("failed to spawn {}", server.command.join(" ")))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| anyhow!("language server stdin unavailable"))?;
        let stdout = child
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
        self.request("initialize", params)?;
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

    fn request(&mut self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id;
        self.next_id += 1;
        self.write_json(
            &json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }),
        )?;
        let deadline = Instant::now() + Duration::from_millis(DEFAULT_REQUEST_TIMEOUT_MS);
        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                bail!("LSP request timed out: {method}");
            }
            let message = self.receiver.recv_timeout(remaining)?;
            self.handle_server_message_side_effects(&message)?;
            if message.get("id").and_then(Value::as_u64) == Some(id) {
                if let Some(error) = message.get("error") {
                    bail!("LSP request {method} failed: {error}");
                }
                return Ok(message.get("result").cloned().unwrap_or(Value::Null));
            }
        }
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
        let _ = self.request("shutdown", json!(null));
        let _ = self.notify("exit", json!(null));
        let _ = self.child.kill();
        let _ = self.child.wait();
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
    use std::time::{SystemTime, UNIX_EPOCH};

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
