param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RustcArgs
)

$runner = Join-Path $PSScriptRoot "use-local-rust.ps1"
& $runner rustc @RustcArgs
exit $LASTEXITCODE
