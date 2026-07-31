import type { ZodTypeAny } from "zod"

type JsonSchema = Record<string, unknown>

type ZodArrayCheck = {
  _zod?: {
    def?: {
      check?: unknown
      minimum?: unknown
    }
  }
}

type ZodDefinition = {
  typeName?: unknown
  type?: unknown
  shape?: unknown
  element?: unknown
  checks?: readonly ZodArrayCheck[]
  minName?: { value?: unknown }
  minLength?: { value?: unknown }
  maxName?: { value?: unknown }
  maxLength?: { value?: unknown }
  values?: readonly unknown[]
  entries?: Record<string, string>
  value?: unknown
  options?: readonly unknown[]
  valueType?: unknown
  innerType?: unknown
  schema?: unknown
  in?: unknown
  left?: unknown
  right?: unknown
}

export function zodToJsonSchema(
  schema: ZodTypeAny,
  opts: { name?: string; target?: string } = {},
): JsonSchema {
  const root = convert(schema)
  if (opts.name) {
    root["$schema"] = "http://json-schema.org/draft-07/schema#"
    root["title"] = opts.name
  }
  return root
}

function convert(schema: ZodTypeAny): JsonSchema {
  const def = zodDefinition(schema)
  const typeName = getTypeName(def)

  switch (typeName) {
    case "ZodObject": {
      const shapeDef = def.shape
      const shape =
        typeof shapeDef === "function"
          ? (shapeDef() as Record<string, ZodTypeAny>)
          : (shapeDef as Record<string, ZodTypeAny>)
      const properties: Record<string, JsonSchema> = {}
      const required: string[] = []
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = convert(value as ZodTypeAny)
        if (!isOptional(value as ZodTypeAny)) required.push(key)
      }
      const result: JsonSchema = { type: "object", properties, additionalProperties: false }
      if (required.length) result["required"] = required
      return result
    }
    case "ZodArray": {
      const element = def.element ?? def.type
      const result: JsonSchema = { type: "array", items: convert(element as ZodTypeAny) }
      const checks = def.checks ?? []
      for (const check of checks) {
        const checkDef = check._zod?.def
        if (checkDef?.check === "min_length" && typeof checkDef.minimum === "number") {
          result["minItems"] = checkDef.minimum
        }
      }
      return result
    }
    case "ZodString":
      return { type: "string" }
    case "ZodNumber": {
      const r: JsonSchema = { type: "number" }
      const min = def.minName?.value ?? def.minLength?.value
      const max = def.maxName?.value ?? def.maxLength?.value
      if (typeof min === "number") r["minimum"] = min
      if (typeof max === "number") r["maximum"] = max
      return r
    }
    case "ZodBoolean":
      return { type: "boolean" }
    case "ZodEnum": {
      const values = def.values ?? Object.values(def.entries ?? {})
      return { type: "string", enum: values }
    }
    case "ZodLiteral": {
      const val = def.value ?? def.values?.[0]
      if (typeof val === "string") return { type: "string", const: val }
      if (typeof val === "number") return { type: "number", const: val }
      if (typeof val === "boolean") return { type: "boolean", const: val }
      return {}
    }
    case "ZodUnion": {
      const options = (def.options as readonly ZodTypeAny[]).map((option) => convert(option))
      return { oneOf: options }
    }
    case "ZodRecord": {
      return {
        type: "object",
        additionalProperties: convert(def.valueType as ZodTypeAny),
      }
    }
    case "ZodOptional": {
      return convert(def.innerType as ZodTypeAny)
    }
    case "ZodDefault": {
      return convert(def.innerType as ZodTypeAny)
    }
    case "ZodEffects": {
      return convert((def.schema ?? def.in) as ZodTypeAny)
    }
    case "ZodIntersection": {
      const l = convert(def.left as ZodTypeAny)
      const r = convert(def.right as ZodTypeAny)
      return { allOf: [l, r] }
    }
    default:
      return {}
  }
}

function zodDefinition(schema: ZodTypeAny): ZodDefinition {
  return schema._def as unknown as ZodDefinition
}

function getTypeName(def: ZodDefinition): string {
  if (typeof def.typeName === "string") return def.typeName
  switch (def.type) {
    case "object":
      return "ZodObject"
    case "array":
      return "ZodArray"
    case "string":
      return "ZodString"
    case "number":
      return "ZodNumber"
    case "boolean":
      return "ZodBoolean"
    case "enum":
      return "ZodEnum"
    case "literal":
      return "ZodLiteral"
    case "union":
      return "ZodUnion"
    case "record":
      return "ZodRecord"
    case "optional":
      return "ZodOptional"
    case "default":
      return "ZodDefault"
    case "pipe":
    case "transform":
      return "ZodEffects"
    case "intersection":
      return "ZodIntersection"
    default:
      return ""
  }
}

function isOptional(schema: ZodTypeAny): boolean {
  const typeName = getTypeName(zodDefinition(schema))
  return typeName === "ZodOptional" || typeName === "ZodDefault"
}
