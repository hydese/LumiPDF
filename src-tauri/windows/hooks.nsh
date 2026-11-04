; Extra steps for the NSIS installer (bundle.windows.nsis.installerHooks in tauri.conf.json).

; After installing or updating: Windows caches icons, so a new app icon wouldn't show on the
; desktop and Start menu shortcuts until the cache is rebuilt. Ask Explorer to refresh them.
!macro NSIS_HOOK_POSTINSTALL
  ; The shortcuts themselves (SHCNE_UPDATEITEM, SHCNF_PATHW).
  System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$DESKTOP\${PRODUCTNAME}.lnk", p 0)'
  System::Call 'shell32::SHChangeNotify(i 0x00002000, i 0x0005, w "$SMPROGRAMS\${PRODUCTNAME}.lnk", p 0)'
  ; Every icon (SHCNE_ASSOCCHANGED), then Windows' own icon cache refresh (Windows 10 and 11).
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
!macroend
