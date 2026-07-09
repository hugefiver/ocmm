import { generateCodexPlugin } from "../src/codex/plugin-generator.ts"

const result = await generateCodexPlugin()

console.log(
  `wrote ${result.pluginRoot} (${result.agentCount} agents, ${result.skillCount} skills, ${result.mcpCount} MCP servers; config=${result.configHost})`,
)
if (result.projectAgentsRoot) {
  console.log(`wrote ${result.projectAgentsRoot} (${result.agentCount} Codex agent profiles)`)
}
console.log(`wrote ${result.marketplacePath}`)
