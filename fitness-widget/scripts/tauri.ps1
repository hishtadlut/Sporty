param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$TauriArgs
)

$runner = Join-Path $PSScriptRoot "use-local-rust.ps1"
& $runner npm run tauri -- @TauriArgs
exit $LASTEXITCODE
