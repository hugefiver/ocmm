import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { zodToJsonSchema } from "./zod-to-json-schema.ts"
import { AgentsConfigSchemaForJsonSchema, OcmmConfigSchema } from "../src/config/schema.ts"

const schema = zodToJsonSchema(OcmmConfigSchema, {
  name: "OcmmConfig",
  target: "draft-07",
})

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

  const object = node as Record<string, unknown>
  const properties = object.properties
  if (properties && typeof properties === "object") {
    const agents = (properties as Record<string, unknown>).agents
    if (agents && typeof agents === "object") {
      const agentsObject = agents as Record<string, unknown>
      const additional = agentsObject.additionalProperties
      const isEmpty = additional === undefined
        || (typeof additional === "object" && additional !== null && Object.keys(additional).length === 0)
      if (isEmpty) agentsObject.additionalProperties = agentAdditionalProperties
    }
  }

  for (const value of Object.values(object)) patchAgentsAdditionalProperties(value)
}

const out = join(process.cwd(), "schema.json")
writeFileSync(out, JSON.stringify(schema, null, 2) + "\n")
console.log(`wrote ${out}`)
