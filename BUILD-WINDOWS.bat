@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo GoClassroom Preview v0.9.22 - Windows Builder
echo.
echo This entry point uses the same pinned toolchain and gates as BUILD-SETUP-EXE.bat.
call "%~dp0BUILD-SETUP-EXE.bat"
exit /b %ERRORLEVEL%
