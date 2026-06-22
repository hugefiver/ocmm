# Hashline Technical Reference

> Source: `omo/packages/hashline-core/` + `omo/packages/omo-opencode/src/tools/hashline-edit/` + `omo/packages/omo-opencode/src/hooks/hashline-read-enhancer/`
> **Note**: `omo/` refers to the gitignored reference implementation at `C:\Users\hugefiver\source\ocmm\omo\` (omo monorepo, npm `oh-my-opencode`). Paths in this doc are relative to that location.

## 1. Package Identity

**`@oh-my-opencode/hashline-core`** (v0.1.0, private, ESM-only)
- **Entry**: `./src/index.ts` (types: `./index.d.ts`)
- **Single external dep**: `diff` ^9.0.0 (only for `createTwoFilesPatch` in `diff-utils.ts`)
- **Zero other npm deps**: xxHash32 is self-contained (Bun native → pure-JS fallback)

## 2. What It Does

Embeds `LINE#ID` markers into file content shown to LLMs, then validates those markers on edit to catch stale references. Improves edit reliability from 6.7% → 68.3%.

**Marker format**:
```
{line_number}#{hash_id}|{line_content}
```
- `hash_id` = exactly 2 chars from `ZPMQVRWSNKTXJBYH` (16-char nibble alphabet → 256 digraphs)
- `hash_id` = `HASHLINE_DICT[xxHash32(normalized_content, seed) % 256]`
- Seed = `0` for content matching `[\p{L}\p{N}]`, `lineNumber` for whitespace/punctuation-only lines
- Canonical normalization: `trimEnd()` + strip `\r`
- Legacy normalization: strip ALL whitespace (backward compat — both validate)

**Regex patterns**:
- `HASHLINE_REF_PATTERN`: `/^([0-9]+)#([ZPMQVRWSNKTXJBYH]{2})$/`
- `HASHLINE_OUTPUT_PATTERN`: `/^([0-9]+)#([ZPMQVRWSNKTXJBYH]{2})\|(.*)$/`

**Real examples**:
```
1#VK|const x = 1
2#XJ|const y = 2
42#VK| function hello() {
```

## 3. Public API (~26 functions, ~7 types)

### Types
```typescript
interface ReplaceEdit { op: "replace"; pos: string; end?: string; lines: string | string[] }
interface AppendEdit  { op: "append";  pos?: string; lines: string | string[] }
interface PrependEdit { op: "prepend"; pos?: string; lines: string | string[] }
type HashlineEdit = ReplaceEdit | AppendEdit | PrependEdit
```

### Hash Computation
- `computeLineHash(lineNumber, content): string` — canonical (trimEnd + strip \r)
- `computeLegacyLineHash(lineNumber, content): string` — legacy (strip ALL whitespace)
- `formatHashLine(lineNumber, content): string` — `"42#VK|content"`
- `formatHashLines(content): string` — full file → hashlined
- `streamHashLinesFromUtf8(source, options?): AsyncGenerator<string>`
- `streamHashLinesFromLines(lines, options?): AsyncGenerator<string>`

### Validation
- `parseLineRef(ref: string): LineRef` — `"42#VK"` → `{ line: 42, hash: "VK" }`
- `validateLineRef(lines, ref): void` — throws `HashlineMismatchError` on mismatch
- `validateLineRefs(lines, refs): void`
- `normalizeLineRef(ref): string`
- `class HashlineMismatchError extends Error { remaps: Map<string, string> }`

### Edit Application
- `applyHashlineEdits(content, edits): string`
- `applyHashlineEditsWithReport(content, edits): HashlineApplyReport`
- Primitives: `applySetLine`, `applyReplaceLines`, `applyInsertAfter`, `applyInsertBefore`, `applyAppend`, `applyPrepend`

### Normalization / Dedup / Ordering
- `normalizeHashlineEdits(rawEdits): HashlineEdit[]`
- `dedupeEdits(edits): { edits, deduplicatedEdits }`
- `collectLineRefs(edits): string[]`
- `detectOverlappingRanges(edits): string | null`
- `getEditLineNumber(edit): number`

### Autocorrect
- `autocorrectReplacementLines(originalLines, replacementLines): string[]`
- Sub-ops: `stripLinePrefixes`, `toNewLines`, `restoreLeadingIndent`, `stripInsertAnchorEcho`, `stripInsertBeforeEcho`, `stripInsertBoundaryEcho`, `stripRangeBoundaryEcho`, `stripTrailingContinuationTokens`, `stripMergeOperatorChars`, `restoreOldWrappedLines`, `maybeExpandSingleLineMerge`, `restoreIndentForPairedReplacement`

### Diff / Display
- `toHashlineContent(content): string`
- `generateUnifiedDiff(oldContent, newContent, filePath): string` — uses `diff` library
- `countLineDiffs(oldContent, newContent): { additions, deletions }`
- `generateHashlineDiff(oldContent, newContent, filePath): string`

### Canonicalization / Chunking
- `canonicalizeFileText(content): FileTextEnvelope` — strips BOM, normalizes to LF
- `restoreFileText(content, envelope): string` — restores BOM + CRLF
- `createHashlineChunkFormatter(options): HashlineChunkFormatter`

## 4. Execution Pipeline

`hashline-edit-executor.ts` (omo-opencode tool layer):

```
Input: { filePath, edits: RawHashlineEdit[], delete?, rename? }
  ↓
1. normalizeHashlineEdits(args.edits)
2. Check file exists
3. If delete mode: delete file, return
4. Read raw content via Buffer
5. canonicalizeFileText(rawContent)       # strip BOM, CRLF→LF
6. applyHashlineEditsWithReport(content, edits)
   a. dedupeEdits(edits)
   b. sort bottom-up (descending line number)
   c. validateLineRefs(lines, refs)       # throw on stale hash
   d. detectOverlappingRanges(edits)      # throw on overlap
   e. apply each edit with autocorrect
7. restoreFileText(canonicalNew, envelope)  # restore BOM + CRLF
8. Write file
9. Run formatters (optional)
10. Generate diff metadata
11. Return success message
```

**Sorting**: Bottom-up (descending line number) so earlier edits don't shift line numbers for later edits.

**Overlap detection**: Range replaces (pos+end) must not overlap. Throws: `"Overlapping range edits detected: edit N (lines X-Y) overlaps with edit M (lines A-B)"`.

## 5. Autocorrect Behaviors (6 built-in)

1. **Single-line merge expansion** — model collapses multi-line into one line → auto-expand back via semicolon splitting or substring matching
2. **Wrapped line restoration** — model wraps single line into multiple → collapse back
3. **Indent restoration** (paired) — restore leading whitespace from original
4. **First-line indent restoration** — for single-line replaces
5. **Echo stripping** — remove anchor line echoes from append/prepend/replace payloads
6. **Hashline prefix stripping** — if >50% lines have `LINE#ID|` prefixes, auto-strip; same for diff `+` markers

## 6. Stale Hash Detection

```typescript
class HashlineMismatchError extends Error {
  readonly remaps: ReadonlyMap<string, string>  // "1#ZZ" → "1#VK"
}
```

Error message format:
```
N lines have changed since last read. Use updated {line_number}#{hash_id} references below (>>> marks changed lines).

    1#VK|function hello() {
>>> 2#XJ|return 42           // hash doesn't match
    3#MB|}
```

`.remaps` lets callers auto-correct stale references.

## 7. Hook Contracts

### Read Enhancer (ACTIVE)
- **Hook point**: `tool.execute.after`
- **Gate**: `config.hashline_edit?.enabled ?? false`
- **What**: Intercepts `Read` tool output, transforms `{lineNumber}: {content}` → `{lineNumber}#{hash}|{content}`
- Detects content in `<content>...</content>`, `<file>...</file>`, or raw `N: ` / `N| ` formats
- Skips truncated lines (`"... (line truncated to 2000 chars)"`)
- For `Write` tool: replaces output with `"File written successfully. N lines written."`

### Edit Diff Enhancer (UNWIRED / WIP)
- **File exists**: `omo-opencode/src/hooks/hashline-edit-diff-enhancer/hook.ts`
- **Status**: NOT registered in any hook composer. Orphaned/WIP.
- **What it would do**: Capture content before Write, generate unified diff + countLineDiffs after.

## 8. Tool Gating

- **Config key**: `hashline_edit: boolean` (optional, default `false`)
- **Tool name**: `edit` (NOT `hashline_edit` or `edit_file`)
- **Registration**: `pluginConfig.hashline_edit ? { edit: factories.createHashlineEditTool(ctx) } : {}`
- **Legacy migration**: `experimental.hashline_edit` → top-level `hashline_edit` (auto-migrated, top-level wins)

## 9. Tool Schema

```typescript
interface HashlineEditArgs {
  filePath: string
  edits: RawHashlineEdit[]
  delete?: boolean
  rename?: string
}
// Per-edit:
{ op: "replace"|"append"|"prepend", pos?: string, end?: string, lines?: string|string[]|null }
```

LLM-facing tool description is ~95 lines of markdown documenting LINE#ID format, operation choice, examples, recovery from `>>>` mismatch errors.

## 10. Dependencies

### Production
| Package | Version | Usage |
|---------|---------|-------|
| `diff` | ^9.0.0 | `createTwoFilesPatch` for unified diff only |

### Integration tests
| Package | Version | Usage |
|---------|---------|-------|
| `@ai-sdk/openai-compatible` | ^2.0.47 | OpenAI-compatible provider |
| `ai` | ^6.0.184 | Vercel AI SDK |
| `zod` | ^4.4.3 | Input validation |

## 11. Test Coverage

### Core (6 files, `bun test src/*.test.ts`):
| File | Tests | Coverage |
|------|-------|----------|
| `hash-computation.test.ts` | 11 | Deterministic hashes, legacy compat, trailing whitespace, CRLF, streaming parity |
| `validation.test.ts` | 15 | parseLineRef variants, validateLineRef mismatch, legacy acceptance, batched validation |
| `edit-operations.test.ts` | ~22 | All 6 apply ops, mixed edits, dedup, ordering, autocorrect, overlap, BOM/CRLF, edge cases |
| `normalize-edits.test.ts` | 5 | Raw→typed, anchor fallback, legacy rejection |
| `diff-utils.test.ts` | 10 | Unified diff format, hunk separation, context lines, no-newline markers |
| `smoke-untested-modules.test.ts` | 1 (7 assertions) | Constants, toNewLines, autocorrect, canonicalization, chunk formatter |

### omo-opencode integration:
| File | Tests | Coverage |
|------|-------|----------|
| `tools.test.ts` | ~22 | Real file I/O: replace single/anchor/range, append/prepend, rename, delete, BOM/CRLF, missing file, stale anchor, invalid format |
| `index.test.ts` (read-enhancer) | 10 | Read output tagging, truncation skip, write summary, error preservation, disabled skip |
| `formatter-trigger.test.ts` | ~398 lines | Formatter config, `$FILE` substitution, caching, hooks |

### Real-model integration (headless):
| File | Cases | Coverage |
|------|-------|----------|
| `test-edit-ops.ts` | 21 | Replace single/range, append/prepend, batch, expansion, EOF, special chars, adjacent edits, indent, whitespace, blanks |
| `test-edge-cases.ts` | 25 | Single-line file, large file, full-file replace, mixed ops, Unicode/emoji, template literals, regex, HTML, long lines, SQL, mixed indent, hashline-like content |

## 12. Migration Verdict: PORT with minimal adaptation

**Rationale**: Core logic is clean, well-tested, dependency-minimal (only `diff` for unified diffs). Package boundary already clean — `@oh-my-opencode/hashline-core` has zero OpenCode dependencies.

### Migration steps:
1. **Port**: `src/hashline/` — copy all 17 `.ts` files from `hashline-core/src/`
   - Keep `xxhash32.ts` (self-contained, Bun native → pure-JS fallback)
   - Keep `diff-utils.ts` (or inline minimal unified-diff if we want to drop `diff` dep)
2. **Adapt**: `hashline-edit-executor.ts` — replace `bunFile`/`bunWrite` with `node:fs`
3. **Adapt**: `tool-description.ts` — adjust for ocmm's `edit` tool name
4. **Implement**: Read enhancer as `tool.execute.after` hook in ocmm
5. **Port tests**: All core tests translate directly (`bun:test` → `node:test`)
6. **Skip**: formatter-trigger (ocmm doesn't have OpenCode's formatter config), edit-diff-enhancer (unwired WIP)

### Categorization
- **Type**: omo-own toolchain → **REIMPLEMENT** (port the code, own the maintenance)
- **Priority**: HIGH (biggest single-feature reliability gain)
- **Effort**: MEDIUM (clean boundary, well-tested, ~17 source files + ~6 test files)
- **Dependencies**: `diff` ^9.0.0 (optional — can inline)
