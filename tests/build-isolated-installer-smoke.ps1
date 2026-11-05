[CmdletBinding()]
param([switch]$SkipBuild, [int]$BuildJobs = 8)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $Workspace
if (-not $SkipBuild) { & ./build.ps1 -SkipCopy -BuildJobs $BuildJobs }
$arch = (& node -p "({x64:'amd64',arm64:'aarch64'})[process.arch]").Trim()
if ($arch -notin @('amd64', 'aarch64')) { throw 'Unsupported smoke architecture.' }
$version = (& node scripts/version.mjs).Trim()
if ((Get-Item -LiteralPath src-tauri/target/release/cpa-gui.exe).VersionInfo.ProductVersion -ne $version) { throw 'Rebuild the current release executable first.' }
$smokeRoot = Join-Path $Workspace ".codex/installer-smoke-bundle/$arch"
New-Item -ItemType Directory -Force $smokeRoot | Out-Null
node scripts/portable.mjs --binary src-tauri/target/release/cpa-gui.exe --output "$smokeRoot/payload" --os windows --arch $arch --download true
if ($LASTEXITCODE -ne 0) { throw 'Portable staging failed.' }
node scripts/prepare-installer.mjs --portable "$smokeRoot/payload" --arch $arch --output "$smokeRoot/tauri.json"
if ($LASTEXITCODE -ne 0) { throw 'Installer staging failed.' }

# Change all three namespaces together: installed product, saved data locator,
# and Run key. This installer is a test artifact, never a release asset.
$product = 'EasyCLIProxyAPI Custom Release Smoke'
$binary = 'EasyCLIProxyAPI-Release-Smoke.exe'
$autostart = 'EasyCLIProxyAPI-Release-Smoke'
$registrySubkey = 'Software\EasyCLIProxyAPI-Release-Smoke\Run'
$runKey = "HKCU:\$registrySubkey"
$config = Get-Content -LiteralPath "$smokeRoot/tauri.json" -Raw | ConvertFrom-Json
$config.productName = $product
$config | Add-Member -NotePropertyName identifier -NotePropertyValue 'com.cpa.custom.release-smoke' -Force
$config.mainBinaryName = [IO.Path]::GetFileNameWithoutExtension($binary)
Copy-Item -LiteralPath src-tauri/target/release/cpa-gui.exe -Destination "src-tauri/target/release/$binary"
$hooks = [IO.File]::ReadAllText((Join-Path $Workspace 'src-tauri/windows/installer-hooks.nsh')).Replace('EasyCLIProxyAPI-Custom', 'EasyCLIProxyAPI-Custom-Release-Smoke').Replace('EasyCLIProxyAPI.exe', $binary).Replace('"EasyCLIProxyAPI"', '"' + $autostart + '"').Replace('Software\Microsoft\Windows\CurrentVersion\Run', $registrySubkey)
[IO.File]::WriteAllText("$smokeRoot/hooks.nsh", $hooks)
$config.bundle.windows.nsis.installerHooks = "$smokeRoot/hooks.nsh"
[IO.File]::WriteAllText("$smokeRoot/tauri.json", ($config | ConvertTo-Json -Depth 20))
bun tauri bundle --bundles nsis --config "$smokeRoot/tauri.json" --ci
if ($LASTEXITCODE -ne 0) { throw 'Smoke installer bundling failed.' }
$nsisArch = if ($arch -eq 'amd64') { 'x64' } else { 'arm64' }
$installer = Join-Path $Workspace "src-tauri/target/release/bundle/nsis/${product}_${version}_${nsisArch}-setup.exe"
$manifestPath = "$smokeRoot/smoke-manifest.json"
$manifest = @{ schemaVersion = 1; productName = $product; binaryName = $binary; autostartName = $autostart; runRegistryPath = $runKey; installerSha256 = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash }
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json))

$testRegistryRoot = 'HKCU:\Software\EasyCLIProxyAPI-Release-Smoke'
if (-not (Test-Path -LiteralPath $testRegistryRoot)) { New-Item -Path $testRegistryRoot | Out-Null }
if (-not (Test-Path -LiteralPath $runKey)) { New-Item -Path $runKey | Out-Null }
New-ItemProperty -LiteralPath $runKey -Name UnrelatedFixture -Value 'unrelated fixture remains unchanged' -PropertyType String -Force | Out-Null
& ./tests/windows-installer-smoke.ps1 -Installer $installer -ProductName $product -BinaryName $binary -AutostartName $autostart -RunRegistryPath $runKey -IsolationManifest $manifestPath
