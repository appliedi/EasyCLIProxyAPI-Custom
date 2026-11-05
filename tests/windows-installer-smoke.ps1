[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Installer,
    [Parameter(Mandatory = $true)][string]$ProductName,
    [string]$BinaryName = 'EasyCLIProxyAPI.exe',
    [string]$AutostartName = 'EasyCLIProxyAPI',
    [string]$RunRegistryPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
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
function Invoke-Uninstall {
    param([switch]$Update)
    $uninstaller = Join-Path $InstallDirectory 'uninstall.exe'
    $updateArgument = if ($Update) { ' /UPDATE' } else { '' }
    $process = Start-Process -FilePath $uninstaller -ArgumentList "/S$updateArgument _?=$InstallDirectory" -WindowStyle Hidden -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "Uninstall failed: $($process.ExitCode)" }
}
function Get-AutostartValue {
    $entry = Get-ItemProperty -LiteralPath $RunRegistryPath -ErrorAction SilentlyContinue
    if ($entry -and $entry.PSObject.Properties[$AutostartName]) { $entry.PSObject.Properties[$AutostartName].Value }
}
$existingRun = Get-ItemProperty -LiteralPath $RunRegistryPath -ErrorAction SilentlyContinue
if ($existingRun -and $existingRun.PSObject.Properties[$AutostartName]) { throw 'Refusing to overwrite an existing autostart entry.' }
$RunSnapshot = @{}
if ($existingRun) {
    $existingRun.PSObject.Properties | Where-Object Name -NotLike 'PS*' | ForEach-Object { $RunSnapshot[$_.Name] = [Management.Automation.PSSerializer]::Serialize($_.Value) }
}
function Assert-PreservedData {
    $currentRun = Get-ItemProperty -LiteralPath $RunRegistryPath -ErrorAction SilentlyContinue
    foreach ($entry in $RunSnapshot.GetEnumerator()) {
        $property = if ($currentRun) { $currentRun.PSObject.Properties[$entry.Key] } else { $null }
        if (-not $property -or [Management.Automation.PSSerializer]::Serialize($property.Value) -ne $entry.Value) { throw "Unrelated startup entry changed: $($entry.Key)" }
    }
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
# Tauri's /UPDATE uninstaller must preserve the hint before first app launch.
$ForeignAutostart = (Join-Path $Fixture "other/$BinaryName") + ' --autostart'
if (-not (Test-Path -LiteralPath $RunRegistryPath)) { New-Item -Path $RunRegistryPath | Out-Null }
New-ItemProperty -LiteralPath $RunRegistryPath -Name $AutostartName -Value $ForeignAutostart -PropertyType String -Force | Out-Null
Invoke-Uninstall -Update
if (-not (Test-Path -LiteralPath (Join-Path $InstallDirectory 'initial-data-directory.txt'))) { throw 'Update uninstall lost the selected portable data hint.' }
if ((Get-AutostartValue) -ne $ForeignAutostart) { throw 'Update uninstall modified another installation autostart entry.' }
Assert-PreservedData
Invoke-Setup
Assert-PreservedData
$SelectedAgain = [IO.File]::ReadAllText((Join-Path $InstallDirectory 'initial-data-directory.txt'), [Text.Encoding]::Unicode).Trim([char]0xFEFF)
if ($SelectedAgain -ne $DataDirectory) { throw 'Reinstall lost the original portable data selection.' }
$OwnedAutostart = (Join-Path $InstallDirectory $BinaryName) + ' --autostart'
Set-ItemProperty -LiteralPath $RunRegistryPath -Name $AutostartName -Value $OwnedAutostart
Invoke-Uninstall -Update
if ((Get-AutostartValue) -ne $OwnedAutostart) { throw 'Update uninstall removed its autostart entry.' }
if (-not (Test-Path -LiteralPath (Join-Path $InstallDirectory 'initial-data-directory.txt'))) { throw 'Owned-autostart update lost the portable selection hint.' }
Invoke-Setup
Assert-PreservedData
Invoke-Uninstall
if (Get-AutostartValue) { throw 'Uninstall left its --autostart entry behind.' }
if (Test-Path -LiteralPath (Join-Path $InstallDirectory 'initial-data-directory.txt')) { throw 'Normal uninstall left the initial selection hint behind.' }
if (Test-Path -LiteralPath (Join-Path $InstallDirectory $BinaryName)) { throw 'Uninstall left the shipped app binary behind.' }
if (Test-Path -LiteralPath $RegistryPath) { throw 'Uninstall registration was not removed.' }
if (Test-Path -LiteralPath $Shortcut) { throw 'Start Menu shortcut was not removed.' }
Assert-PreservedData
Write-Host "PASS: install, reinstall, portable-data selection across /UPDATE, owned/foreign autostart entries, shortcuts, uninstall registration, and data preservation. Fixtures retained at $Fixture"
