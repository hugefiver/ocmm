import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { zodToJsonSchema } from "./zod-to-json-schema.ts"
import { OcmmConfigSchema, AgentsConfigSchemaForJsonSchema } from "../src/config/schema.ts"

const schema = zodToJsonSchema(OcmmConfigSchema, {
  name: "OcmmConfig",
  target: "draft-07",
})

// `OcmmConfigSchema.agents` and `ProfileEntrySchema.agents` both use the
// tolerant runtime schema `z.record(z.string(), z.unknown()).transform(...)`,
// which serializes to `additionalProperties: {}` and loses per-field
// autocomplete in IDEs. Replace those empty `additionalProperties` with the
// full declarative `AgentEntrySchema` description (mirrored via
// `AgentsConfigSchemaForJsonSchema`) so consumers keep field-level hints
// while the runtime still tolerates per-entry validation errors.
const agentsEntrySchema = zodToJsonSchema(AgentsConfigSchemaForJsonSchema, {
  target: "draft-07",
})
const agentAdditionalProperties =
  (agentsEntrySchema as Record<string, unknown>).additionalProperties ?? {}
patchAgentsAdditionalProperties(schema)

function patchAgentsAdditionalProperties(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) patchAgentsAdditionalProperties(item)
    return
  }
  if (node === null || typeof node !== "object") return
  const obj = node as Record<string, unknown>
  // If this node is an object schema whose `properties` contain an `agents`
  // entry that is itself an object schema with empty `additionalProperties`,
  // replace the empty object with the full agent-entry description.
  const properties = obj.properties
  if (properties && typeof properties === "object") {
    const agentsProp = (properties as Record<string, unknown>).agents
    if (
      agentsProp
      && typeof agentsProp === "object"
      && ((agentsProp as Record<string, unknown>).type === "object"
        || (agentsProp as Record<string, unknown>).type === undefined)
    ) {
      const agentsObj = agentsProp as Record<string, unknown>
      const isEmptyAdditional =
        agentsObj.additionalProperties === undefined
        || (typeof agentsObj.additionalProperties === "object"
          && Object.keys(agentsObj.additionalProperties as object).length === 0)
      if (isEmptyAdditional) {
        agentsObj.additionalProperties = agentAdditionalProperties
      }
    }
  }
  // Recurse into all child nodes.
  for (const value of Object.values(obj)) {
    patchAgentsAdditionalProperties(value)
  }
}

const out = join(process.cwd(), "schema.json")
writeFileSync(out, JSON.stringify(schema, null, 2) + "\n")
console.log(`wrote ${out}`)
