; Windows installer hooks (auto-included by electron-builder from buildResources).
; Lets phone cameras through Windows Firewall at install time, behind one UAC prompt, so users never
; have to touch firewall settings. Updates skip the prompt when the rules are already there, and a
; declined prompt never fails the install (the Cameras screen offers the same fix later).

!macro customInstall
  ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --camera-firewall=allow'
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --camera-firewall=remove'
  ${endIf}
!macroend
