; Classroom Auto Turn-In installer hooks.
; Teacher data under Electron userData is deliberately preserved on uninstall.
; Only Windows Task Scheduler entries owned by this app are removed, and only on
; a real uninstall. An upgrade runs the previous uninstaller with --updated; the
; automatic schedule must survive that so the new version keeps checking.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DetailPrint "Removing Classroom Auto Turn-In scheduled tasks..."
    nsExec::ExecToLog 'schtasks.exe /Delete /TN "Classroom Auto Turn-In" /F'
    Pop $0
    nsExec::ExecToLog 'schtasks.exe /Delete /TN "Classroom Auto Turn-In Retry 1" /F'
    Pop $0
    nsExec::ExecToLog 'schtasks.exe /Delete /TN "Classroom Auto Turn-In Retry 2" /F'
    Pop $0
    nsExec::ExecToLog 'schtasks.exe /Delete /TN "Classroom Auto Turn-In Retry 3" /F'
    Pop $0
    nsExec::ExecToLog 'schtasks.exe /Delete /TN "Classroom Auto Turn-In Retry 4" /F'
    Pop $0
  ${endIf}
!macroend
