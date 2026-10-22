<#
Convyy MCP installer for Windows: uses the Node.js already on this computer, or downloads the official one once.

  .\install.ps1 -Client claude              install (codex, claude or open-webui)
  .\install.ps1 -Client claude -DryRun      show what would change, write nothing
  .\install.ps1 -Command status             is it installed and working

With Node.js 20 or newer on this computer this only starts app\installer.js. Without it, the official
Node.js v24.22.0 is downloaded from nodejs.org, its SHA-256 is checked against the value pinned below (from the
official SHASUMS256.txt) and it is kept in your user folder, so it is never downloaded twice. Nothing is installed
system-wide and no administrator rights are used.

If PowerShell refuses to run the script (a downloaded file is blocked by default), start it like this:
  powershell -ExecutionPolicy Bypass -File .\install.ps1 -Client claude
#>
param(
  [string]$Command = "install",
  [string]$Client = "",
  [switch]$DryRun,
  [Parameter(ValueFromRemainingArguments = $true)] [string[]]$Rest
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$MinMajor = 20
$NodeVersion = "v24.22.0"
$BaseUrl = "https://nodejs.org/dist"
$Sha256 = "f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3"

$installer = Join-Path $PSScriptRoot "app\installer.js"
if (-not (Test-Path -LiteralPath $installer)) { throw "app\installer.js was not found next to install.ps1." }

$installerArgs = @($installer, $Command)
if ($Client -ne "") { $installerArgs += @("--client", $Client) }
if ($DryRun) { $installerArgs += "--dry-run" }
if ($Rest) { $installerArgs += $Rest }

function Invoke-Installer([string]$node) {
  & $node @installerArgs
  exit $LASTEXITCODE
}

$existing = Get-Command node.exe -ErrorAction SilentlyContinue
if ($existing) {
  $major = 0
  try { $major = [int](& $existing.Source -p "process.versions.node.split('.')[0]") } catch { $major = 0 }
  if ($major -ge $MinMajor) { Invoke-Installer $existing.Source }
}

if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne [System.Runtime.InteropServices.Architecture]::X64) {
  throw "This script supports 64-bit Intel/AMD Windows. Install Node.js $MinMajor or newer from https://nodejs.org and run: node app\installer.js install --client <codex|claude|open-webui>"
}

if ($env:CONVYY_MCP_STATE_DIR -and [System.IO.Path]::IsPathRooted($env:CONVYY_MCP_STATE_DIR)) {
  $state = $env:CONVYY_MCP_STATE_DIR
} else {
  $localAppData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $env:USERPROFILE "AppData\Local" }
  $state = Join-Path $localAppData "Convyy\mcp"
}
$target = Join-Path $state "install\node\$NodeVersion"
$targetNode = Join-Path $target "node.exe"
if (Test-Path -LiteralPath $targetNode) {
  $reported = ""
  try { $reported = (& $targetNode --version).Trim() } catch { $reported = "" }
  if ($reported -eq $NodeVersion) { Invoke-Installer $targetNode }
}

$top = "node-$NodeVersion-win-x64"
$file = "$top.zip"
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("convyy-node-" + [System.Guid]::NewGuid().ToString("N"))
$part = "$target.part-" + [System.Guid]::NewGuid().ToString("N")
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Write-Host "No Node.js $MinMajor or newer found. Downloading the official Node.js $NodeVersion once ($BaseUrl/$NodeVersion/$file) ..."
  Invoke-WebRequest -Uri "$BaseUrl/$NodeVersion/$file" -OutFile (Join-Path $tmp $file) -UseBasicParsing
  $actual = (Get-FileHash -LiteralPath (Join-Path $tmp $file) -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $Sha256) { throw "The downloaded $file does not match the pinned SHA-256 (expected $Sha256, got $actual). It was discarded." }
  $tar = Join-Path $env:SystemRoot "System32\tar.exe"
  & $tar -xf (Join-Path $tmp $file) -C $tmp "$top/node.exe" "$top/LICENSE"
  if ($LASTEXITCODE -ne 0) { throw "Could not unpack $file." }
  New-Item -ItemType Directory -Path $part -Force | Out-Null
  Move-Item -LiteralPath (Join-Path $tmp "$top\node.exe") -Destination (Join-Path $part "node.exe")
  Move-Item -LiteralPath (Join-Path $tmp "$top\LICENSE") -Destination (Join-Path $part "LICENSE")
  if ((& (Join-Path $part "node.exe") --version).Trim() -ne $NodeVersion) { throw "The unpacked Node.js does not report $NodeVersion." }
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  Move-Item -LiteralPath $part -Destination $target
  Write-Host "Node.js $NodeVersion is in $target; later installs reuse it."
} finally {
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  if (Test-Path -LiteralPath $part) { Remove-Item -LiteralPath $part -Recurse -Force -ErrorAction SilentlyContinue }
}
Invoke-Installer $targetNode
