@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title GoClassroom Preview - Prepare v0.9.21 Dependency Lock

echo ============================================================
echo   GoClassroom Preview v0.9.21 - Prepare Dependency Lock
echo ============================================================
echo.
echo This is a ONE-TIME release-candidate preparation step.
echo It needs internet access to resolve the pinned dependencies.
echo The normal release builder will NOT create or change the lockfile.
echo.
echo Preparing pinned Node.js v22.19.0 build runtime...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Get-PortableNode.ps1"
if errorlevel 1 goto :fail
set "PATH=%LOCALAPPDATA%\CATI-Build\node-v22.19.0;%PATH%"

echo Creating package-lock.json from exact declared versions...
call npm install --package-lock-only --ignore-scripts --no-audit --no-fund
if errorlevel 1 goto :fail

echo.
echo Verifying the locked dependency tree with a clean install...
call npm ci --no-audit --no-fund
if errorlevel 1 goto :fail

echo.
echo Running release-candidate checks...
call npm run check:deep
if errorlevel 1 goto :fail
node scripts\release-readiness-check.js
if errorlevel 1 goto :fail

echo.
echo Freezing the source manifest, including package-lock.json...
node scripts\create-source-manifest.js
if errorlevel 1 goto :fail
node scripts\verify-source-manifest.js
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo DEPENDENCY LOCK READY

echo Keep package-lock.json with this source folder.
echo From now on, use BUILD-SETUP-EXE.bat or BUILD-WINDOWS.bat.
echo ============================================================
pause
exit /b 0

:fail
echo.
echo Preparation failed. The release candidate is NOT ready to build.
echo Nothing was installed into Classroom or changed in teacher settings.
pause
exit /b 1
