import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { join } from "node:path"

const root = process.cwd()
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8")

function countExact(text: string, needle: string): number {
  return text.split(needle).length - 1
}

test("planning records extrinsic constraints and local executor recommendations", () => {
  const planning = read("skills", "v1", "writing-plans", "SKILL.md")
  const execution = read("skills", "v1", "subagent-driven-development", "SKILL.md")
  const maintenance = read("docs", "v1-maintenance.md")

  assert.match(planning, /## Extrinsic Constraints Pass/)
  assert.match(planning, /before finalizing.*Global Constraints/i)
  assert.match(planning, /budget.*paid services/i)
  assert.match(planning, /mandated.*prohibited.*stack/i)
  assert.match(planning, /scale.*capacity/i)
  assert.match(planning, /audience.*privacy.*compliance.*accessibility/i)
  assert.match(planning, /repository and request evidence first/i)
  assert.match(planning, /do not invent/i)
  assert.match(planning, /safe, reversible default/i)
  assert.match(planning, /material unresolved.*approval gate/i)

  assert.equal(countExact(planning, "**Recommended executor:**"), 1)
  const interfaces = planning.indexOf("**Interfaces:**")
  const executor = planning.indexOf("**Recommended executor:**")
  const firstCheckbox = planning.indexOf("- [ ] **Step 1:")
  assert.ok(interfaces < executor && executor < firstCheckbox)
  assert.match(planning, /\*\*Recommended executor:\*\* `coding`/)
  assert.match(planning, /only: `quick`, `coding`, `normal-task`, `complex`, `deep`, `frontend`, `documenting`/)
  assert.match(planning, /`hard-reasoning`.*genuinely difficult decision.*not.*code/is)
  assert.match(planning, /planner.*plan-critic.*Reviewer.*Oracle.*not.*implementer/is)
  assert.match(planning, /one recommendation per task.*not per step/i)

  assert.match(execution, /before dispatching.*recommended.*profile/i)
  assert.match(execution, /callable/i)
  assert.match(execution, /active task file ownership conflict/i)
  assert.match(execution, /dependencies/i)
  assert.match(execution, /security.*runtime rigor/is)
  assert.match(execution, /direct execution.*smaller/i)
  assert.match(execution, /recommendation.*never overrides.*routing policy.*explicit configuration/is)
  assert.match(execution, /do not create.*goal\/assumption ledger/i)

  assert.match(maintenance, /\.\/omo@ef1c392f10eafb28913eb7815143c328d88aad47/)
  assert.match(maintenance, /local executor allowlist/i)
  assert.match(maintenance, /extrinsic constraints pass/i)
  assert.match(maintenance, /routing authority/i)
  assert.match(maintenance, /does not add persistent ledgers or automatic Git actions/i)
})
