[CmdletBinding()]
param(
    [int]$BuildJobs = 8,
    [switch]$SkipBuild
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not $SkipBuild) { & ./build.ps1 -SkipCopy -BuildJobs $BuildJobs }
$InstallerArch = (& node -p "({x64:'amd64',arm64:'aarch64'})[process.arch]").Trim()
if ($InstallerArch -notin @('amd64', 'aarch64')) { throw 'Unsupported Windows architecture.' }
$InstallerVersion = (& node scripts/version.mjs).Trim()
$BinaryVersion = (Get-Item -LiteralPath src-tauri/target/release/cpa-gui.exe).VersionInfo.ProductVersion
if ($BinaryVersion -ne $InstallerVersion) { throw "Release executable version $BinaryVersion does not match $InstallerVersion. Rebuild without -SkipBuild." }
$InstallerStage = Join-Path $PSScriptRoot ".codex/installer/$InstallerArch"
$InstallerPayload = Join-Path $InstallerStage 'payload'
$InstallerConfig = Join-Path $InstallerStage 'tauri.generated.json'
New-Item -ItemType Directory -Force $InstallerStage | Out-Null

& node scripts/portable.mjs --binary src-tauri/target/release/cpa-gui.exe --output $InstallerPayload --os windows --arch $InstallerArch --download true
if ($LASTEXITCODE -ne 0) { throw 'Failed to prepare the clean installer payload.' }
& node scripts/prepare-installer.mjs --portable $InstallerPayload --arch $InstallerArch --output $InstallerConfig
if ($LASTEXITCODE -ne 0) { throw 'Failed to validate the installer payload.' }
& bun tauri bundle --bundles nsis --config $InstallerConfig --ci
if ($LASTEXITCODE -ne 0) { throw 'Failed to build Setup.exe.' }

$NsisArch = if ($InstallerArch -eq 'amd64') { 'x64' } else { 'arm64' }
$BuiltInstaller = Join-Path $PSScriptRoot "src-tauri/target/release/bundle/nsis/EasyCLIProxyAPI Custom_${InstallerVersion}_${NsisArch}-setup.exe"
if (-not (Test-Path -LiteralPath $BuiltInstaller -PathType Leaf)) { throw "Installer missing: $BuiltInstaller" }
$OutputFolder = Join-Path $PSScriptRoot '.codex/builds'
New-Item -ItemType Directory -Force $OutputFolder | Out-Null
$OutputInstaller = Join-Path $OutputFolder "EasyCLIProxyAPI-v${InstallerVersion}-Windows-${InstallerArch}-setup.exe"
Copy-Item -LiteralPath $BuiltInstaller -Destination $OutputInstaller
$InstallerHash = (Get-FileHash -LiteralPath $OutputInstaller -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$OutputInstaller.sha256", "$InstallerHash  $([IO.Path]::GetFileName($OutputInstaller))`n", [Text.UTF8Encoding]::new($false))
Write-Host "Built installer: $OutputInstaller"
