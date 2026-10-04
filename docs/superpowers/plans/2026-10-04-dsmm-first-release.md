# Authorized DSMM first release

The user authorized publishing and explicitly selected `0.1.0`. Scope is DSMM only: keep ocmm 0.6.24 and its LSP pin unchanged. The previous migration plan and verification report cover implementation and real native Flash testing.

The remaining release work is bounded identity/metadata synchronization plus existing packaging and publication commands; no new behavior, permissions, API or CI lane is introduced. Narrow planner/critic skip applies to this release-only work. System desktop configuration is separately planned and reviewed because provider, credential and per-role migration has security/compatibility uncertainty.

Synchronize manifest, exact-version readiness/Docker checks, regression tests and installation docs. Historical migration reports retain their original pre-release identity. Run DSMM build/test/typechecks/readiness; use existing verified isolated root build because the original dist executable is held by pre-existing LSP processes, without terminating them. Before commit inspect all requested migration changes, exclude output_test, and verify root checks. Generated lib and presets stay with source.

Recheck registry identity and tag absence. Commit the reviewed DSMM migration and identity metadata, push master and immutable dsmm-v0.1.0. Pack once and retain its sha512 integrity and sha256. Bootstrap first publication using the now-authenticated maintainer npm account; there is no DSMM Trusted Publishing lane. Upload that exact tarball and checksum file to a non-latest DSMM GitHub Release. No in-place repair after partial publication.

Completion evidence must bind tag/peeled commit, exact public npm version and integrity, downloaded GitHub asset bytes/checksums and a fresh isolated DSH profile installed from registry. A workflow conclusion or local readiness receipt alone is insufficient. Report any authentication/OTP failure without inventing success; never move or recreate published identities.

Final preflight: DSMM 277/277 and readiness passed at 0.1.0. Its exact tarball passed real native-account Flash delegation, all 14 checks, input 8422/output 373, read-only child glob/grep/read, original credentials unchanged and temporary home removed. SHA256: bc497a0a3f925d0a25ace47081e5f909beeda9c38dc33513cd5a836a7aa75653.

Root typecheck and isolated full build passed. First root test run had an intermittent unchanged Rust mcp_stdio formatting lifecycle trace failure (20/21); unchanged full pnpm test rerun passed TS 1406/1406, Rust 28/28 + 21/21. Exact failing case alone passed and quiet affected suite passed 21/21. No Rust fix or confirmed cause is claimed: shutdown/log race, environment contention and fixture/interpreter axes remain unproven. No source instrumentation, user-process termination or assertion weakening was performed; transient debug journal was removed.
