import { pathToFileURL } from "node:url"

import { syncLspPackageManifests } from "./lsp-package-manifest.ts"

export { syncLspPackageManifests } from "./lsp-package-manifest.ts"

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncLspPackageManifests()
}
