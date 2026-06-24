import type { ZodTypeAny, ZodObject, ZodArray, ZodString, ZodNumber, ZodBoolean, ZodEnum, ZodOptional, ZodDefault, ZodUnion, ZodRecord, ZodLiteral } from "zod"

type JsonSchema = Record<string, unknown>

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
  const def = schema._def as Record<string, unknown>
  const typeName = def.typeName as string

  switch (typeName) {
    case "ZodObject": {
      const obj = schema as unknown as ZodObject<Record<string, ZodTypeAny>>
      const shape = obj._def.shape()
      const properties: Record<string, JsonSchema> = {}
      const required: string[] = []
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = convert(value as ZodTypeAny)
        const inner = unwrapOptional(value as ZodTypeAny)
        if (!isOptional(value as ZodTypeAny)) required.push(key)
        void inner
      }
      const result: JsonSchema = { type: "object", properties, additionalProperties: false }
      if (required.length) result["required"] = required
      return result
    }
    case "ZodArray": {
      const arr = schema as unknown as ZodArray<ZodTypeAny>
      return { type: "array", items: convert(arr._def.type) }
    }
    case "ZodString":
      return { type: "string" }
    case "ZodNumber": {
      const num = schema as unknown as ZodNumber
      const r: JsonSchema = { type: "number" }
      const min = num._def.minName?.value ?? num._def.minLength?.value
      const max = num._def.maxName?.value ?? num._def.maxLength?.value
      if (typeof min === "number") r["minimum"] = min
      if (typeof max === "number") r["maximum"] = max
      return r
    }
    case "ZodBoolean":
      return { type: "boolean" }
    case "ZodEnum": {
      const en = schema as unknown as ZodEnum<string[]>
      return { type: "string", enum: en._def.values }
    }
    case "ZodLiteral": {
      const lit = schema as unknown as ZodLiteral<unknown>
      const val = lit._def.value
      if (typeof val === "string") return { type: "string", const: val }
      if (typeof val === "number") return { type: "number", const: val }
      if (typeof val === "boolean") return { type: "boolean", const: val }
      return {}
    }
    case "ZodUnion": {
      const u = schema as unknown as ZodUnion<ZodTypeAny[]>
      const options = u._def.options.map((o: ZodTypeAny) => convert(o))
      return { oneOf: options }
    }
    case "ZodRecord": {
      const rec = schema as unknown as ZodRecord<ZodTypeAny, ZodTypeAny>
      return {
        type: "object",
        additionalProperties: convert(rec._def.valueType),
      }
    }
    case "ZodOptional": {
      const opt = schema as unknown as ZodOptional<ZodTypeAny>
      return convert(opt._def.innerType)
    }
    case "ZodDefault": {
      const def = schema as unknown as ZodDefault<ZodTypeAny>
      return convert(def._def.innerType)
    }
    case "ZodEffects": {
      const eff = schema as unknown as { _def: { schema: ZodTypeAny } }
      return convert(eff._def.schema)
    }
    case "ZodIntersection": {
      const inter = schema as unknown as { _def: { left: ZodTypeAny; right: ZodTypeAny } }
      const l = convert(inter._def.left)
      const r = convert(inter._def.right)
      return { allOf: [l, r] }
    }
    default:
      return {}
  }
}

function isOptional(schema: ZodTypeAny): boolean {
  const def = schema._def as Record<string, unknown>
  return def.typeName === "ZodOptional" || def.typeName === "ZodDefault"
}

function unwrapOptional(schema: ZodTypeAny): ZodTypeAny {
  const def = schema._def as Record<string, unknown>
  if (def.typeName === "ZodOptional") {
    return unwrapOptional((def as { innerType: ZodTypeAny }).innerType)
  }
  if (def.typeName === "ZodDefault") {
    return unwrapOptional((def as { innerType: ZodTypeAny }).innerType)
  }
  return schema
}
