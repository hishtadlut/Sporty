param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CommandArgs
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$cargoHome = Join-Path $repoRoot ".cargo-home"
$rustupHome = Join-Path $repoRoot ".rustup-home"
$tempDir = Join-Path $repoRoot ".tmp"
$binDir = Join-Path $cargoHome "bin"

if (-not (Test-Path $binDir)) {
    throw "Local Rust toolchain not found at $binDir"
}

$env:CARGO_HOME = $cargoHome
$env:RUSTUP_HOME = $rustupHome
$env:TEMP = $tempDir
$env:TMP = $tempDir
$env:PATH = "$binDir;$env:PATH"

Push-Location $repoRoot
try {
    & $Command @CommandArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
