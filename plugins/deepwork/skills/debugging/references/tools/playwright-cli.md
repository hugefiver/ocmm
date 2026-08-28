# Playwright CLI — Browser QA That Actually Drives a Browser

**https://playwright.dev/ · https://github.com/microsoft/playwright**

For any browser-served web UI bug, this is the correct tool. Not curl. Not imagination. Not a headless HTTP library. A real browser with a real rendering engine, real JS execution, real cookies, real service workers, real viewport.

**In Phase 8 Manual QA for browser products, using Playwright is not optional.** Curl cannot catch: CSS that breaks at specific viewport widths, hydration mismatches, client-side router bugs, cookie/session interactions, service-worker caching, JS-triggered navigations. All of those are common bug classes. Drive a browser.

> Note: `microsoft/playwright-cli` is the legacy repo; the current tooling lives in `@playwright/test` (npm) and `playwright` (pip), which include the `playwright` CLI. Use those — the legacy `playwright-cli` package is deprecated.

---

## When to reach for Playwright

| Bug symptom | Use Playwright? |
|---|---|
| Form submit produces wrong result | ✅ — Playwright drives the form exactly as a user does |
| Page blank in prod, fine locally | ✅ — hydration/env differences need a real browser |
| CSS looks wrong at a specific width | ✅ — use `--viewport-size` |
| Click doesn't fire / wrong handler | ✅ — Playwright fires real DOM events |
| Flash of unstyled content / loading glitch | ✅ — use trace viewer to see frames |
| API returns wrong data | ❌ — use curl, this isn't a browser bug |
| Backend returns wrong status code | ❌ — use curl |
| Client hits a URL that returns 500 | ✅ but also ❌ — Playwright shows the call + response + failure effect on UI |

---

## Install (per-project)

Playwright installs browser binaries separately from the npm package.

```bash
# In the project
npm init playwright@latest             # interactive; picks TS/JS + browsers + config
# Or if Playwright is already a dep:
npx playwright install                 # downloads browsers
npx playwright install chromium        # just chromium
npx playwright install --with-deps     # also installs OS deps (Linux)
```

Python:
```bash
pip install playwright
playwright install
```

---

## The four things you'll actually use

### 1. `codegen` — record a session, generate the script

The fastest way to create a repro. Opens a real browser; your clicks / typing become a Playwright script you can paste into a test.

```bash
npx playwright codegen https://your-app.local
npx playwright codegen --viewport-size=375,667 https://your-app.local    # iPhone SE size
npx playwright codegen --device="iPhone 14" https://your-app.local
```

Click / type / navigate in the browser; watch the script build in the side panel. Copy the generated script into your journal as the repro for Phase 8.

### 2. A one-shot Playwright script — reproduce + capture

Usually the Phase 8 QA artifact. Save to `/tmp/debug-repro.spec.ts` (journal it):

```ts
// /tmp/debug-repro.spec.ts
import { test, expect } from '@playwright/test';

test('refinement chat shows non-empty response when env var set', async ({ page }) => {
  await page.goto('http://localhost:3000/chat');
  await page.fill('textarea[name="message"]', 'Add a logging step');
  await page.click('button[type=submit]');

  // Wait for the response to appear (not just the spinner to disappear)
  const response = page.locator('[data-testid="assistant-reply"]');
  await expect(response).toBeVisible({ timeout: 30_000 });
  await expect(response).not.toBeEmpty();

  // Capture evidence
  await page.screenshot({ path: '/tmp/debug-after-fix.png', fullPage: true });
  console.log(await response.textContent());
});
```

Run it with tracing enabled for rich post-mortem:

```bash
npx playwright test /tmp/debug-repro.spec.ts --trace on --headed
```

### 3. `PWDEBUG=1` — step through the script with Playwright Inspector

```bash
PWDEBUG=1 npx playwright test /tmp/debug-repro.spec.ts
```

Opens the Playwright Inspector alongside the browser. You can step through Playwright actions, see the DOM state at each step, and edit selectors on the fly.

Use this when the script doesn't reproduce cleanly and you need to watch it run.

### 4. `show-trace` — post-mortem on a failed run

```bash
npx playwright show-trace trace.zip
# or from the test-results dir:
npx playwright show-trace test-results/<test-name>/trace.zip
```

Scrubs through a recorded session: timeline, DOM snapshot at each action, network, console, source. When a test failed on CI but passed locally, this is the single best artifact.

---

## Headless vs headed during debugging

Always add `--headed` when debugging. Headless browsers sometimes behave subtly differently (font rendering, viewport, media permissions). For QA evidence, run headed and screenshot.

```bash
npx playwright test --headed
npx playwright test --headed --project=chromium     # pin the browser
```

---

## Catching the silent-failure patterns Playwright is good at

```ts
// Toast that flashes and disappears
page.on('console', msg => console.log('[browser console]', msg.type(), msg.text()));

// Unhandled page errors (uncaught exceptions in the page JS)
page.on('pageerror', err => console.error('[page error]', err));

// Network failures — e.g., backend returned 500 but UI shows nothing
page.on('response', async resp => {
  if (!resp.ok()) {
    console.warn(`[network ${resp.status()}] ${resp.url()} — ${await resp.text()}`);
  }
});

// Request that never came back
page.on('requestfailed', req => {
  console.error('[request failed]', req.url(), req.failure()?.errorText);
});
```

Add these listeners to the top of the debug script. They surface a lot of the "UI showed nothing" class of bug.

---

## Viewport and device emulation

CSS bugs that only appear at specific sizes, or layout bugs on mobile:

```ts
// At test level
test.use({ viewport: { width: 375, height: 667 } });

// Per-page
await page.setViewportSize({ width: 375, height: 667 });

// Predefined devices
import { devices } from '@playwright/test';
test.use({ ...devices['iPhone 14'] });
```

---

## Gotchas

- **Wait for state, not for time.** `await page.waitForTimeout(2000)` is flaky. Use `await expect(locator).toBeVisible()` or `page.waitForResponse(urlPattern)`.
- **Stale selectors re-resolve.** Playwright's locators re-find the element on each action, unlike Puppeteer's handles. Don't over-think it.
- **Service workers persist across test runs in headed mode.** Use a run-owned temporary profile for a clean state; never clear a real profile in place. See the profile-safety procedure below.
- **Installing on CI requires `--with-deps`** on Linux images that lack the browser's shared-library deps.
- **Parallel tests share a browser process by default**; if one test polls a debugger port, others may interfere. Use `workers: 1` for debugging.

---

## Profile safety — clone first, clear only the clone

**Never clear cookies, cache, or site data on a user's real browser profile.** This includes Playwright's `context.clearCookies()`, CDP `Network.clearBrowserCookies` and `Storage.clearCookies`, and browser APIs such as `chrome.browsingData.remove`. These operations can erase the user's authenticated state across unrelated sites.

If reproducing a bug needs the real profile's login state, first close the browser that owns the profile, copy its whole user-data directory into a unique temporary directory, and launch only that clone. Do not point `userDataDir`, `launchPersistentContext`, or a browser command-line profile flag at the original profile when any reset may occur.

PowerShell example for a Chrome profile on Windows (adapt the source path for another browser; it creates a run-owned clone only):

```powershell
$sourceUserData = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
if (-not (Test-Path -LiteralPath $sourceUserData)) { throw "Chrome user-data directory was not found" }
if (-not (Test-Path -LiteralPath $env:TEMP)) { throw "Temporary directory was not found" }

$runRoot = Join-Path $env:TEMP ("ocmm-playwright-" + [guid]::NewGuid().ToString("N"))
$cloneUserData = Join-Path $runRoot "User Data"
New-Item -ItemType Directory -Path $runRoot | Out-Null
Copy-Item -LiteralPath $sourceUserData -Destination $cloneUserData -Recurse -Force
$env:PW_USER_DATA_DIR = $cloneUserData
```

Use the clone for the persistent context. A clear is permitted only after `PW_USER_DATA_DIR` is the temporary clone:

```ts
const context = await chromium.launchPersistentContext(process.env.PW_USER_DATA_DIR!, {
  channel: 'chrome',
  headless: false,
});
await context.clearCookies(); // safe only because this is the run-owned clone
```

After closing the context, clean up only the directory created by this run. Resolve and validate the exact target before deleting it:

```powershell
$expectedPrefix = [IO.Path]::GetFullPath((Join-Path $env:TEMP "ocmm-playwright-"))
$resolvedRunRoot = [IO.Path]::GetFullPath($runRoot)
if (-not $resolvedRunRoot.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to remove a non-run-owned profile"
}
Remove-Item -LiteralPath $resolvedRunRoot -Recurse -Force
```

---

## Phase 9 cleanup specifics

```bash
# Remove trace files from debug runs
rm -rf playwright-report/ test-results/ trace.zip

# Remove debug spec files from /tmp
rm -f /tmp/debug-*.spec.ts

# Remove screenshot captures
rm -f /tmp/debug-*.png

# If you installed browsers just for this session (rare):
# Don't remove them — they're useful for future sessions. They live in ~/Library/Caches/ms-playwright (macOS) or ~/.cache/ms-playwright (Linux).
```
