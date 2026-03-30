@echo off
call "%~dp0use-local-rust.cmd" rustc %*
exit /b %ERRORLEVEL%
