/**
 * Hashline core public API.
 *
 * Hash dependency choice: Option 2.
 * This package embeds a runtime-aware xxHash32 implementation (`xxhash32.ts`)
 * that prefers the host runtime's native xxHash32 binding when available and
 * falls back to a pure-JS implementation otherwise. No package-level dependency
 * on any specific runtime; the binding is detected via globalThis at call time.
 */
export { NIBBLE_STR, HASHLINE_DICT, HASHLINE_REF_PATTERN, HASHLINE_OUTPUT_PATTERN } from "./constants.ts"
export type { ReplaceEdit, AppendEdit, PrependEdit, HashlineEdit } from "./types.ts"
export {
  computeLineHash,
  computeLegacyLineHash,
  formatHashLine,
  formatHashLines,
  streamHashLinesFromUtf8,
  streamHashLinesFromLines,
} from "./hash-computation.ts"
export { parseLineRef, validateLineRef, validateLineRefs, HashlineMismatchError, normalizeLineRef } from "./validation.ts"
export type { LineRef } from "./validation.ts"
export { applyHashlineEdits, applyHashlineEditsWithReport } from "./edit-operations.ts"
export type { HashlineApplyReport } from "./edit-operations.ts"
export {
  applySetLine,
  applyReplaceLines,
  applyInsertAfter,
  applyInsertBefore,
  applyAppend,
  applyPrepend,
} from "./edit-operation-primitives.ts"
export { getEditLineNumber, collectLineRefs, detectOverlappingRanges } from "./edit-ordering.ts"
export { dedupeEdits } from "./edit-deduplication.ts"
export {
  stripLinePrefixes,
  toNewLines,
  restoreLeadingIndent,
  stripInsertAnchorEcho,
  stripInsertBeforeEcho,
  stripInsertBoundaryEcho,
  stripRangeBoundaryEcho,
} from "./edit-text-normalization.ts"
export { canonicalizeFileText, restoreFileText } from "./file-text-canonicalization.ts"
export type { FileTextEnvelope } from "./file-text-canonicalization.ts"
export {
  stripTrailingContinuationTokens,
  stripMergeOperatorChars,
  restoreOldWrappedLines,
  maybeExpandSingleLineMerge,
  restoreIndentForPairedReplacement,
  autocorrectReplacementLines,
} from "./autocorrect-replacement-lines.ts"
export { normalizeHashlineEdits } from "./normalize-edits.ts"
export type { RawHashlineEdit } from "./normalize-edits.ts"
export { createHashlineChunkFormatter } from "./hashline-chunk-formatter.ts"
export type { HashlineChunkFormatter } from "./hashline-chunk-formatter.ts"
export type { HashlineStreamOptions } from "./hash-computation.ts"
export { toHashlineContent, generateUnifiedDiff, countLineDiffs } from "./diff-utils.ts"
export { generateHashlineDiff } from "./hashline-edit-diff.ts"
