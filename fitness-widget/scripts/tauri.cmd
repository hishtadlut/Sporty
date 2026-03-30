@echo off
call "%~dp0use-local-rust.cmd" npm run tauri -- %*
exit /b %ERRORLEVEL%
