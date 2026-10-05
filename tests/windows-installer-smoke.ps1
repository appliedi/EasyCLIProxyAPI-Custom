[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Installer,
    [Parameter(Mandatory = $true)][string]$ProductName,
    [string]$BinaryName = 'EasyCLIProxyAPI.exe'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$Fixture = Join-Path $Workspace ('.codex/installer-smoke-' + [Guid]::NewGuid().ToString('N'))
$InstallDirectory = Join-Path $Fixture 'installed'
$DataDirectory = Join-Path $Fixture 'portable data'
New-Item -ItemType Directory -Force (Join-Path $DataDirectory 'usage-records'), (Join-Path $DataDirectory 'oauth') | Out-Null
[IO.File]::WriteAllText((Join-Path $DataDirectory 'config.toml'), "auth-dir = '../oauth'`n")
[IO.File]::WriteAllText((Join-Path $DataDirectory 'usage-records/usage.db'), 'fixture history and fees')
[IO.File]::WriteAllText((Join-Path $DataDirectory 'oauth/fixture.json'), '{"fixture":true}')
$Before = @{}
Get-ChildItem -LiteralPath $DataDirectory -Recurse -File | ForEach-Object { $Before[$_.FullName] = (Get-FileHash -LiteralPath $_.FullName).Hash }
$RegistryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$ProductName"
if (Test-Path -LiteralPath $RegistryPath) { throw "Refusing to overwrite an existing installed product: $ProductName" }
if (Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($BinaryName)) -ErrorAction SilentlyContinue) { throw 'The smoke test must not run against an active app. Use an isolated test bundle.' }

function Invoke-Setup {
    param([switch]$SelectPortableData)
    $arguments = if ($SelectPortableData) { "/S /PORTABLEDATA=`"$DataDirectory`" /D=$InstallDirectory" } else { "/S /D=$InstallDirectory" }
    $process = Start-Process -FilePath ([IO.Path]::GetFullPath($Installer)) -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Setup failed: $($process.ExitCode)" }
}
function Assert-PreservedData {
    foreach ($entry in $Before.GetEnumerator()) {
        if ((Get-FileHash -LiteralPath $entry.Key).Hash -ne $entry.Value) { throw "Data changed: $($entry.Key)" }
    }
}
Invoke-Setup -SelectPortableData
if (-not (Test-Path -LiteralPath (Join-Path $InstallDirectory $BinaryName))) { throw 'Installed app is missing.' }
if (-not (Test-Path -LiteralPath $RegistryPath)) { throw 'Uninstall registration is missing.' }
$Shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) "$ProductName.lnk"
if (-not (Test-Path -LiteralPath $Shortcut)) { throw 'Start Menu shortcut is missing.' }
$SelectedData = [IO.File]::ReadAllText((Join-Path $InstallDirectory 'initial-data-directory.txt'), [Text.Encoding]::Unicode).Trim([char]0xFEFF)
if ($SelectedData -ne $DataDirectory) { throw 'Setup did not preserve the selected portable data path.' }
$Marker = Get-Content -LiteralPath (Join-Path $InstallDirectory 'installation.json') -Raw | ConvertFrom-Json
if ($Marker.distribution -ne 'installer') { throw 'Installed distribution marker is missing.' }
Assert-PreservedData

# Existing files that were not shipped by Setup must survive reinstall/uninstall.
New-Item -ItemType Directory -Force (Join-Path $InstallDirectory 'data/usage-records') | Out-Null
$LocalHistory = Join-Path $InstallDirectory 'data/usage-records/usage.db'
[IO.File]::WriteAllText($LocalHistory, 'local retained history')
$Before[$LocalHistory] = (Get-FileHash -LiteralPath $LocalHistory).Hash
Invoke-Setup
Assert-PreservedData
$SelectedAgain = [IO.File]::ReadAllText((Join-Path $InstallDirectory 'initial-data-directory.txt'), [Text.Encoding]::Unicode).Trim([char]0xFEFF)
if ($SelectedAgain -ne $DataDirectory) { throw 'Reinstall lost the original portable data selection.' }
$Uninstaller = Join-Path $InstallDirectory 'uninstall.exe'
$process = Start-Process -FilePath $Uninstaller -ArgumentList "/S _?=$InstallDirectory" -WindowStyle Hidden -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "Uninstall failed: $($process.ExitCode)" }
if (Test-Path -LiteralPath (Join-Path $InstallDirectory $BinaryName)) { throw 'Uninstall left the shipped app binary behind.' }
if (Test-Path -LiteralPath $RegistryPath) { throw 'Uninstall registration was not removed.' }
if (Test-Path -LiteralPath $Shortcut) { throw 'Start Menu shortcut was not removed.' }
Assert-PreservedData
Write-Host "PASS: install, reinstall, portable-data selection, shortcuts, uninstall registration, and data preservation. Fixtures retained at $Fixture"
