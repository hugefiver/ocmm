import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { zodToJsonSchema } from "./zod-to-json-schema.ts"
import { OcmmConfigSchema } from "../src/config/schema.ts"

const schema = zodToJsonSchema(OcmmConfigSchema, {
  name: "OcmmConfig",
  target: "draft-07",
})
const out = join(process.cwd(), "schema.json")
writeFileSync(out, JSON.stringify(schema, null, 2) + "\n")
console.log(`wrote ${out}`)
