# Alpha Agro V1 primary-PC update

Deployment-free update instructions for `C:\Users\Alejandra\Documents\ChatGPT\Alpha Agro Preview`. These commands update the checkout, copy the already transferred Phase 8 artifact locally, and run Vite for local review. They do not publish or deploy anything.

## 1. Update the integration branch

Open PowerShell. First make sure the checkout has no uncommitted work; stop and commit or back it up if `git status` reports changes. Do not reset or clean it.

```powershell
$repo = 'C:\Users\Alejandra\Documents\ChatGPT\Alpha Agro Preview'
Set-Location $repo
git status --short --branch
if ((git status --porcelain).Length -gt 0) { throw 'Working tree is not clean. Preserve or back up local work before updating.' }
git fetch origin --prune

# If this local branch already exists:
git switch feature/alpha-agro-v1-integration
git pull --ff-only origin feature/alpha-agro-v1-integration

# If it does not exist locally, use this command instead of the switch/pull above:
# git switch --track -c feature/alpha-agro-v1-integration origin/feature/alpha-agro-v1-integration
```

## 2. Copy and verify the ignored scientific bundle

Transfer the validated bundle from the scientific computer to `C:\Users\Alejandra\Downloads\phase8_forecast_bundle_v1.json` (or change `$bundleSource` to the actual transfer path). Git intentionally does not download or track this file.

```powershell
$bundleSource = 'C:\Users\Alejandra\Downloads\phase8_forecast_bundle_v1.json'
$bundleDestination = Join-Path $repo 'frontend\public\data\phase8_forecast_bundle_v1.json'
$expectedSha256 = '07FEDCF23B8C62284ED84073C79E8CD3E6826809D372813E377FFD33A28F48A7'

if (-not (Test-Path -LiteralPath $bundleSource)) { throw "Bundle not found: $bundleSource" }
if (-not (Test-Path -LiteralPath $bundleDestination)) {
    Copy-Item -LiteralPath $bundleSource -Destination $bundleDestination
}
$actualSha256 = (Get-FileHash -LiteralPath $bundleDestination -Algorithm SHA256).Hash
if ($actualSha256 -ne $expectedSha256) { throw "Bundle SHA-256 mismatch: $actualSha256" }
Get-Item -LiteralPath $bundleDestination | Select-Object FullName, Length
"SHA-256: $actualSha256"
```

If a destination file already exists with a different hash, stop and preserve it before deciding how to replace it. The expected bundle size is 1,906,111 bytes.

## 3. Install and run locally

```powershell
Set-Location (Join-Path $repo 'frontend')
if (-not (Test-Path -LiteralPath 'node_modules')) { npm ci }
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

Open <http://127.0.0.1:5174/>. Stop the local server with `Ctrl+C`. To rerun checks from another PowerShell window:

```powershell
Set-Location (Join-Path $repo 'frontend')
npm run lint
npm test
npm run build
```

## 4. Review the farmer-to-research workflow

1. In Forecast, select a field on the map or enter coordinates; verify that its location marker remains visible and that unsupported locations are clearly ineligible.
2. Select a crop, crop growth stage, and rainfed/irrigated management context. Review the evidence limitation in crop comparison; no suitability score or recommendation should appear.
3. Generate the existing analysis request and inspect the selected field/crop summary and historical GLDAS context.
4. In Research / Experimental Outlook, check the regional view and, for a supported selected location, the matching GLDAS cell. Confirm the displayed issue date, July 2026 latest observation, December 2026–February 2027 horizons, uncertainty, method, and provenance.
5. Confirm the outlook remains explicitly experimental, `operationally_eligible: false`, and separate from operational forecasts. Try a masked or unsupported location and confirm its value remains unavailable.
6. Switch EN/ES and resize to a mobile-width window. Map attribution should remain visible; satellite and hybrid controls remain unavailable until an approved imagery provider is configured.

This is a local preview only. Do not publish the bundle or deploy the site from this procedure.
