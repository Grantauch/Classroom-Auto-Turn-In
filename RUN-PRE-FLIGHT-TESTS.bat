@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Classroom Auto Turn-In - v0.9.20 Pre-Flight Tests

echo ============================================================
echo   Classroom Auto Turn-In v0.9.20 - Pre-Flight Tests

echo ============================================================
echo.
echo Preparing pinned Node.js v22.19.0 build runtime...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Get-PortableNode.ps1"
if errorlevel 1 goto :fail
set "PATH=%LOCALAPPDATA%\CATI-Build\node-v22.19.0;%PATH%"

if not exist package-lock.json (
  echo.
  echo ============================================================
  echo PRE-FLIGHT SETUP IS INCOMPLETE
  echo ============================================================
  echo This source copy is missing its locked app components.
  echo Use the prepared source package, or run PREPARE-RC-LOCKFILE.bat once
  echo while this computer has internet access.
  echo.
  goto :fail
)

echo Installing or repairing the app's exact required components...
call npm ci --no-audit --no-fund
if errorlevel 1 goto :fail

echo.
echo Running the full offline/deep suite...
call npm run check:deep
if errorlevel 1 goto :fail

echo.
echo Running Chrome/Edge page-structure fixtures...
call npm run check:dom
if errorlevel 1 goto :fail

echo.
echo Testing silent persistent-browser mode...
call npm run check:browser
if errorlevel 1 goto :fail

echo.
echo Running end-to-end checks against the offline Classroom/Drive simulator...
set "CATI_E2E_HEADLESS=1"
call npm run check:e2e
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo PRE-FLIGHT TESTS PASSED

echo ============================================================
echo These tests did not submit anything to a real Classroom.
echo Continue with RC-FIELD-VALIDATION.md for live school testing.
pause
exit /b 0

:fail
echo.
echo ============================================================
echo PRE-FLIGHT TESTS FAILED

echo ============================================================
echo Stop here. Do not treat this build as ready for Classroom testing.
pause
exit /b 1
