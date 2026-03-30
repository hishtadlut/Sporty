@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "REPO_ROOT=%%~fI"
set "CARGO_HOME=%REPO_ROOT%\.cargo-home"
set "RUSTUP_HOME=%REPO_ROOT%\.rustup-home"
set "TEMP=%REPO_ROOT%\.tmp"
set "TMP=%REPO_ROOT%\.tmp"
set "PATH=%CARGO_HOME%\bin;%PATH%"

if "%~1"=="" (
  echo Expected a command to run with the local Rust environment.
  exit /b 1
)

pushd "%REPO_ROOT%"
call %*
set "EXIT_CODE=%ERRORLEVEL%"
popd

exit /b %EXIT_CODE%
