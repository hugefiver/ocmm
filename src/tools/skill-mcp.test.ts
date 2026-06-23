import { test } from "node:test"
import assert from "node:assert/strict"

import type { McpManager, McpOperationRequest, McpServerMap } from "../mcp/index.ts"
import { createSkillMcpTool, executeSkillMcpTool } from "./skill-mcp.ts"

function fakeManager(invoke: (request: McpOperationRequest) => Promise<string>): McpManager {
  const servers: McpServerMap = { docs: { type: "remote", url: "https://docs.example/mcp", enabled: true } }
  return {
    servers: () => servers,
    async invoke(request) {
      return { content: await invoke(request) }
    },
  }
}

test("executeSkillMcpTool requires exactly one MCP operation target", async () => {
  const manager = fakeManager(async () => "unused")

  assert.equal(
    await executeSkillMcpTool({ mcp_name: "docs" }, manager),
    "Error: provide exactly one of tool_name, resource_name, or prompt_name",
  )
  assert.equal(
    await executeSkillMcpTool({ mcp_name: "docs", tool_name: "search", prompt_name: "ask" }, manager),
    "Error: provide exactly one of tool_name, resource_name, or prompt_name",
  )
})

test("executeSkillMcpTool parses JSON arguments and dispatches to manager", async () => {
  let seen: McpOperationRequest | undefined
  const manager = fakeManager(async (request) => {
    seen = request
    return "ok"
  })

  const result = await executeSkillMcpTool(
    { mcp_name: "docs", tool_name: "search", arguments: '{"q":"zod"}', cdp_url: "http://localhost:9222" },
    manager,
  )

  assert.equal(result, "ok")
  assert.deepEqual(seen, {
    mcpName: "docs",
    toolName: "search",
    arguments: { q: "zod" },
    cdpUrl: "http://localhost:9222",
  })
})

test("executeSkillMcpTool filters returned content with grep", async () => {
  const manager = fakeManager(async () => "alpha\nbeta\ngamma")

  assert.equal(
    await executeSkillMcpTool({ mcp_name: "docs", resource_name: "readme", grep: "a$" }, manager),
    "alpha\nbeta\ngamma",
  )
  assert.equal(
    await executeSkillMcpTool({ mcp_name: "docs", resource_name: "readme", grep: "^b" }, manager),
    "beta",
  )
})

test("createSkillMcpTool returns structural OpenCode tool definition", async () => {
  const tool = createSkillMcpTool(fakeManager(async () => "configured"))

  assert.equal(typeof tool.description, "string")
  assert.equal(typeof tool.args.mcp_name.parse, "function")
  assert.equal(await tool.execute({ mcp_name: "docs", prompt_name: "summarize" }, {}), "configured")
})
