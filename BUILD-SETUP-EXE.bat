@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Classroom Auto Turn-In - v0.9.20 Release Builder

echo ============================================================
echo   Classroom Auto Turn-In v0.9.20 - Controlled Windows Build
echo ============================================================
echo.
echo This builds the teacher installer and runs isolated install validation.
echo Validation refuses to overwrite an installed CATI copy or production CATI tasks.
echo.
echo [0/9] Confirming the Windows validation environment is isolated...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-validation-environment-check.ps1"
if errorlevel 1 goto :fail
echo.

echo Preparing pinned Node.js v22.19.0 build runtime...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Get-PortableNode.ps1"
if errorlevel 1 goto :fail
set "PATH=%LOCALAPPDATA%\CATI-Build\node-v22.19.0;%PATH%"

echo.
node --version
call npm --version
if errorlevel 1 goto :fail

if not exist package-lock.json (
  echo.
  echo ============================================================
  echo RELEASE CANDIDATE NOT READY TO BUILD
  echo ============================================================
  echo package-lock.json is missing.
  echo Run PREPARE-RC-LOCKFILE.bat once on an internet-connected build PC.
  pause
  exit /b 1
)

echo.
echo [1/9] Installing exact locked dependencies...
call npm ci --no-audit --no-fund
if errorlevel 1 goto :fail

echo.
echo [2/9] Running release-readiness checks...
call npm run check:release-ready
if errorlevel 1 goto :fail

echo.
echo [3/9] Running local Chrome/Edge page-structure checks...
call npm run check:dom
if errorlevel 1 goto :fail

echo.
echo [4/9] Verifying silent background browser mode...
call npm run check:browser
if errorlevel 1 goto :fail

echo.
echo [5/9] Running end-to-end checks against the offline Classroom/Drive simulator...
set "CATI_E2E_HEADLESS=1"
call npm run check:e2e
if errorlevel 1 goto :fail

echo.
echo [6/9] Cleaning old release output...
if exist dist rmdir /s /q dist

echo.
echo [7/9] Building Windows teacher installer...
rem Explicitly build unsigned. Resource metadata/icon are restored by scripts\after-pack-windows.js.
set "CSC_IDENTITY_AUTO_DISCOVERY=false"
set "CSC_LINK="
set "CSC_KEY_PASSWORD="
set "WIN_CSC_LINK="
set "WIN_CSC_KEY_PASSWORD="
call npm run dist:win
if errorlevel 1 goto :fail

echo.
echo [8/9] Installing, self-testing, uninstalling, and reinstalling the Setup EXE...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows-installed-validation.ps1"
if errorlevel 1 goto :fail

echo.
echo [9/9] Writing SHA-256 release hashes...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Write-ReleaseHashes.ps1"
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo RELEASE CANDIDATE BUILD AND INSTALL VALIDATION COMPLETE
echo ============================================================
echo Release files are in:
echo   %~dp0dist
for %%F in ("dist\*.exe") do echo   %%~nxF
if exist "dist\SHA256SUMS.txt" echo   SHA256SUMS.txt
echo.
echo The Setup EXE is the only file intended for the teacher PC.
echo This candidate is unsigned, so Windows may show Unknown Publisher.
start "" "%~dp0dist"
pause
exit /b 0

:fail
echo.
echo ============================================================
echo BUILD OR INSTALL VALIDATION FAILED
echo ============================================================
echo No release candidate should be distributed from this run.
pause
exit /b 1
