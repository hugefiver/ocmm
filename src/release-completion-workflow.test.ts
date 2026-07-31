import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

const releaseWorkflowSource = readFileSync(join(process.cwd(), ".github", "workflows", "release.yml"), "utf8")

function exactUniqueJobBoundary(jobName: string): number {
  const boundaries = [...releaseWorkflowSource.matchAll(new RegExp(`^  ${jobName}:$`, "gm"))]
  assert.equal(boundaries.length, 1, `expected one exact ${jobName} job boundary`)
  return boundaries[0]!.index
}

function sliceReleaseWorkflowJobs(startJob: string, endJob: string): string {
  const start = exactUniqueJobBoundary(startJob)
  const end = exactUniqueJobBoundary(endJob)
  assert.ok(start < end, `${startJob} must precede ${endJob}`)
  return releaseWorkflowSource.slice(start, end)
}

function exactUniqueIndex(source: string, marker: string): number {
  const first = source.indexOf(marker)
  assert.notEqual(first, -1, `missing ${JSON.stringify(marker)}`)
  assert.equal(source.indexOf(marker, first + marker.length), -1, `duplicate ${JSON.stringify(marker)}`)
  return first
}

test("release workflow validates LSP assets before publish and upload", () => {
  const lspPackage = sliceReleaseWorkflowJobs("lsp-package", "stage-pinned-lsp")
  const checksums = exactUniqueIndex(lspPackage, "- name: Generate checksums")
  const validate = exactUniqueIndex(lspPackage, "- name: Validate staged release assets")
  const npmPublish = exactUniqueIndex(lspPackage, "npm publish --registry=https://registry.npmjs.org --access public")
  const releaseUpload = exactUniqueIndex(lspPackage, "name: github-release-assets")

  assert.ok(checksums < validate, "checksums must precede staged validation")
  assert.ok(validate < npmPublish, "staged validation must precede npm publish")
  assert.ok(validate < releaseUpload, "staged validation must precede release asset upload")
  assert.match(lspPackage, /pnpm --silent run check:release-completion -- --mode staged --tag "\$\{\{ env\.RELEASE_TAG \}\}" --assets-dir release-assets/)
  assert.doesNotMatch(lspPackage, /pnpm run check:release-completion/)
})

test("release workflow validates main assets before npm GitHub Packages and upload", () => {
  const ocmmPackage = sliceReleaseWorkflowJobs("ocmm-package", "github-release")
  const checksums = exactUniqueIndex(ocmmPackage, "- name: Generate checksums")
  const validate = exactUniqueIndex(ocmmPackage, "- name: Validate staged release assets")
  const npmPublish = exactUniqueIndex(ocmmPackage, "- name: Publish ocmm to npmjs.org")
  const githubPackages = exactUniqueIndex(ocmmPackage, "- name: Publish scoped package to GitHub Packages")
  const releaseUpload = exactUniqueIndex(ocmmPackage, "name: github-release-assets")

  assert.ok(checksums < validate, "checksums must precede staged validation")
  assert.ok(validate < npmPublish, "staged validation must precede npmjs.org publication")
  assert.ok(validate < githubPackages, "staged validation must precede GitHub Packages publication")
  assert.ok(validate < releaseUpload, "staged validation must precede release asset upload")
  assert.match(ocmmPackage, /pnpm --silent run check:release-completion -- --mode staged --tag "\$\{\{ env\.RELEASE_TAG \}\}" --assets-dir release-assets/)
  assert.doesNotMatch(ocmmPackage, /pnpm run check:release-completion/)
})

test("release workflow publishes a GitHub Release only for one exact lane pair", () => {
  const githubRelease = releaseWorkflowSource.slice(exactUniqueJobBoundary("github-release"))
  const condition = /if: \$\{\{ ([^\n]+) \}\}/.exec(githubRelease)?.[1]
  assert.ok(condition, "missing GitHub Release condition")

  assert.match(condition, /always\(\) && !cancelled\(\)/)
  assert.match(condition, /github\.event_name == 'workflow_dispatch' && inputs\.release_kind == 'ocmm-lsp'/)
  assert.match(condition, /github\.event_name != 'workflow_dispatch' && startsWith\(github\.ref_name, 'ocmm-lsp-v'\)/)
  assert.match(condition, /github\.event_name == 'workflow_dispatch' && inputs\.release_kind == 'ocmm'/)
  assert.match(condition, /github\.event_name != 'workflow_dispatch' && startsWith\(github\.ref_name, 'v'\) && !startsWith\(github\.ref_name, 'ocmm-lsp-v'\)/)
  assert.match(condition, /needs\.lsp-package\.result == 'success' && needs\.ocmm-package\.result == 'skipped'/)
  assert.match(condition, /needs\.lsp-package\.result == 'skipped' && needs\.ocmm-package\.result == 'success'/)
  assert.doesNotMatch(condition, /needs\.lsp-package\.result == 'success' \|\| needs\.ocmm-package\.result == 'success'/)
})

test("release workflow aligns GitHub Packages with receipt events and refuses existing Releases", () => {
  const ocmmPackage = sliceReleaseWorkflowJobs("ocmm-package", "github-release")
  const githubRelease = releaseWorkflowSource.slice(exactUniqueJobBoundary("github-release"))

  assert.doesNotMatch(releaseWorkflowSource, /publish_github_package/)
  assert.doesNotMatch(releaseWorkflowSource, /inputs\.publish_github_package/)
  assert.match(
    ocmmPackage,
    /- name: Publish scoped package to GitHub Packages\r?\n\s+if: \$\{\{ github\.event_name == 'push' \}\}/,
  )
  assert.match(githubRelease, /if gh release view "\$RELEASE_TAG" >\/dev\/null 2>&1; then/)
  assert.match(githubRelease, /GitHub Release \$RELEASE_TAG already exists; refusing to modify it\./)
  assert.match(githubRelease, /GitHub Release \$RELEASE_TAG already exists; refusing to modify it\." >&2\r?\n\s+exit 1/)
  assert.doesNotMatch(githubRelease, /gh release delete-asset/)
  assert.doesNotMatch(githubRelease, /gh api --method PATCH/)
  assert.doesNotMatch(githubRelease, /gh release upload[^\n]*--clobber/)
  assert.match(githubRelease, /gh release upload "\$RELEASE_TAG" release-assets\/\*/)
})

test("release workflow preserves publication invariants", () => {
  for (const marker of [
    "id-token: write",
    '- "v*.*.*"',
    '- "ocmm-lsp-v*"',
    "linux-x64-gnu",
    "linux-arm64-gnu",
    "linux-x64-musl",
    "linux-arm64-musl",
    "win32-x64",
    "win32-arm64",
    "darwin-x64",
    "darwin-arm64",
    "https://registry.npmjs.org",
    "https://npm.pkg.github.com",
  ]) {
    assert.ok(releaseWorkflowSource.includes(marker), `missing ${marker}`)
  }

  for (const [action, version] of [
    ["actions/checkout", "v7"],
    ["actions/setup-node", "v6"],
    ["goto-bus-stop/setup-zig", "v2"],
    ["actions/download-artifact", "v8"],
    ["actions/upload-artifact", "v7"],
  ] as const) {
    assert.match(releaseWorkflowSource, new RegExp(`${action}@${version}`))
    assert.doesNotMatch(releaseWorkflowSource, new RegExp(`${action}@(?!${version}(?:\\s|$))`))
  }
})
