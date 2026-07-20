import fs from "node:fs";

const scenario = process.env.MOCK_LSP_SCENARIO ?? "success";
const tracePath = process.env.MOCK_LSP_TRACE;

if (!tracePath) {
  throw new Error("MOCK_LSP_TRACE is required");
}

const ranges = {
  definition: {
    start: { line: 1, character: 2 },
    end: { line: 1, character: 5 },
  },
  implementation: {
    start: { line: 3, character: 4 },
    end: { line: 3, character: 9 },
  },
  referenceA: {
    start: { line: 5, character: 0 },
    end: { line: 5, character: 4 },
  },
  referenceB: {
    start: { line: 6, character: 1 },
    end: { line: 6, character: 7 },
  },
};

const successResults = {
  "textDocument/definition": {
    uri: "file:///mock/definition.rs",
    range: ranges.definition,
  },
  "textDocument/implementation": {
    uri: "file:///mock/implementation.rs",
    range: ranges.implementation,
  },
  "textDocument/references": [
    { uri: "file:///mock/reference-a.rs", range: ranges.referenceA },
    { uri: "file:///mock/reference-b.rs", range: ranges.referenceB },
  ],
};

const locationA = {
  uri: "file:///mock/a.rs",
  range: {
    start: { line: 2, character: 3 },
    end: { line: 2, character: 8 },
  },
};

const normalizeResults = {
  "textDocument/definition": [
    locationA,
    locationA,
    {
      targetUri: "file:///mock/selection.rs",
      targetRange: {
        start: { line: 5, character: 1 },
        end: { line: 5, character: 9 },
      },
      targetSelectionRange: {
        start: { line: 7, character: 2 },
        end: { line: 7, character: 6 },
      },
    },
    {
      uri: "file:///mock/invalid.rs",
      range: {
        start: { line: "invalid", character: 0 },
        end: { line: 0, character: 1 },
      },
    },
  ],
  "textDocument/implementation": {
    targetUri: "file:///mock/fallback.rs",
    targetRange: {
      start: { line: 6, character: 4 },
      end: { line: 6, character: 9 },
    },
  },
  "textDocument/references": [locationA],
};

let buffer = Buffer.alloc(0);

function trace(message) {
  fs.appendFileSync(
    tracePath,
    `${JSON.stringify({ ...message, observedAtMs: Date.now() })}\n`,
  );
}

function respond(id, payload) {
  const message = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, ...payload }));
  process.stdout.write(`Content-Length: ${message.length}\r\n\r\n`);
  process.stdout.write(message);
}

function semanticResponse(message) {
  const method = message.method;

  if (scenario === "unsupported" && method === "textDocument/implementation") {
    respond(message.id, {
      error: {
        code: -32601,
        message: "Method not found",
        data: { method: "textDocument/implementation" },
      },
    });
    return;
  }

  if (scenario === "partial-error" && method === "textDocument/definition") {
    respond(message.id, {
      error: {
        code: -32001,
        message: "Definition temporarily unavailable",
        data: { retryable: true },
      },
    });
    return;
  }

  if (scenario === "malformed-error" && method === "textDocument/definition") {
    respond(message.id, { error: { unexpected: true } });
    return;
  }

  if (scenario === "all-error") {
    const errors = {
      "textDocument/definition": [-32010, "Definition failed"],
      "textDocument/implementation": [-32011, "Implementation failed"],
      "textDocument/references": [-32012, "References failed"],
    };
    const [code, messageText] = errors[method];
    respond(message.id, { error: { code, message: messageText } });
    return;
  }

  const results = scenario === "normalize" ? normalizeResults : successResults;
  respond(message.id, { result: results[method] });
}

function handle(message) {
  trace(message);

  if (message.method === "initialize") {
    respond(message.id, { result: { capabilities: {} } });
    return;
  }

  if (
    message.method === "textDocument/definition" ||
    message.method === "textDocument/implementation" ||
    message.method === "textDocument/references"
  ) {
    semanticResponse(message);
    return;
  }

  if (message.method === "shutdown") {
    respond(message.id, { result: null });
    return;
  }

  if (message.method === "exit") {
    if (scenario === "ignore-exit") {
      setInterval(() => {}, 1_000);
    } else {
      process.exit(0);
    }
  }
}

function drain() {
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;

    const headers = buffer.subarray(0, headerEnd).toString("utf8");
    const match = /(?:^|\r\n)Content-Length:\s*(\d+)/i.exec(headers);
    if (!match) throw new Error("missing Content-Length header");

    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) return;

    const message = JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString("utf8"));
    buffer = buffer.subarray(bodyEnd);
    handle(message);
  }
}

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  drain();
});
