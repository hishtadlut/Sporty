@echo off
call "%~dp0use-local-rust.cmd" cargo %*
exit /b %ERRORLEVEL%
