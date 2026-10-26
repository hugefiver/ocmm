import { generateCodexPlugin } from "../src/codex/plugin-generator.ts"
import { defaultConfig } from "../src/config/schema.ts"

const result = await generateCodexPlugin(process.argv.includes("--release") ? {
  config: { ...defaultConfig(), workflow: "codex" },
  includeProjectMcp: false,
} : {})

console.log(
  `wrote ${result.pluginRoot} (${result.agentCount} agents, ${result.skillCount} skills, ${result.mcpCount} MCP servers; config=${result.configHost})`,
)
if (result.projectAgentsRoot) {
  console.log(`wrote ${result.projectAgentsRoot} (${result.agentCount} Codex agent profiles)`)
}
console.log(`wrote ${result.marketplacePath}`)
