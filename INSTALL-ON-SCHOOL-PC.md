# Installing v0.9.22 on the school PC

> Do not use this source folder as the school-PC release. Use these instructions only after the Windows distribution gate has produced and verified a v0.9.22 Setup EXE.

## Before installing

1. Obtain `Classroom-Auto-Turn-In-Setup-0.9.22-x64.exe` and the release SHA-256 list from the same verified build.
2. In PowerShell, verify the hash:

```powershell
Get-FileHash .\Classroom-Auto-Turn-In-Setup-0.9.22-x64.exe
```

3. Compare it with the published build hash before running the installer.

## Install

Run the installer for the current Windows user. Existing CATI teacher data is preserved by the installer/uninstaller rules unless the release instructions explicitly say otherwise.

## Local grading prerequisites

- Install/start Ollama on the same PC.
- Install the intended local model (default `qwen3.6:latest`).
- Confirm district policy permits the intended local processing of student work.

## First grading validation

Use preview-only mode first. Before enabling Classroom draft writing, use a controlled test assignment and complete the draft-write section of `TEST-TEACHER-CHECKLIST.md`.

CATI never clicks Return; the teacher remains responsible for reviewing and returning work.
