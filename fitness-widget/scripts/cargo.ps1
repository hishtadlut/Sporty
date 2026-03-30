param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$CargoArgs
)

$runner = Join-Path $PSScriptRoot "use-local-rust.ps1"
& $runner cargo @CargoArgs
exit $LASTEXITCODE
