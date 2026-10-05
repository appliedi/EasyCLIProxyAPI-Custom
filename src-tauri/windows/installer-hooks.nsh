; Extend Tauri's standard NSIS installer; never package or delete personal data.
!include nsDialogs.nsh
!include LogicLib.nsh

Var CPAExistingData

; A proxy needs a graceful exit to finish saving usage and stop its core.
!macroundef CheckIfAppIsRunning
!macro CheckIfAppIsRunning executableName productName
  nsis_tauri_utils::FindProcessCurrentUser "${executableName}"
  Pop $R0
  ${If} $R0 = 0
    IfSilent +2 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Please exit ${productName} from its tray menu, then run Setup again. Your data will be kept."
    SetErrorLevel 2
    Abort "The app is still running. Exit it before installing or uninstalling."
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
  StrCpy $CPAExistingData ""
  ; A saved profile always wins; upgrades must not replace its selection.
  ${IfNot} ${FileExists} "$LOCALAPPDATA\EasyCLIProxyAPI-Custom\storage.json"
    ${GetOptions} $CMDLINE "/PORTABLEDATA=" $CPAExistingData
    ${If} $CPAExistingData == ""
      ; Reinstalling before the first app launch must retain the earlier choice.
      IfFileExists "$INSTDIR\initial-data-directory.txt" cpa_data_done
      IfSilent cpa_data_done
      MessageBox MB_YESNO|MB_ICONQUESTION "Do you already use a portable copy of EasyCLIProxyAPI?$\r$\n$\r$\nYes: select its folder to keep your usage history, settings, and sign-ins.$\r$\nNo: start with a new data folder for your Windows account." IDNO cpa_data_done
      nsDialogs::SelectFolderDialog "Select the existing portable application or data folder" "$PROFILE\Apps"
      Pop $CPAExistingData
      ${If} $CPAExistingData == "error"
        Abort "No portable folder selected. Run Setup again to choose a folder or start fresh."
      ${EndIf}
    ${EndIf}
    ${If} ${FileExists} "$CPAExistingData\data\storage-profile.json"
      StrCpy $CPAExistingData "$CPAExistingData\data"
    ${EndIf}
    ${IfNot} ${FileExists} "$CPAExistingData\config.toml"
      IfSilent +2 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "That folder does not contain config.toml. Select the existing EasyCLIProxyAPI data folder."
      SetErrorLevel 3
      Abort "The selected portable data folder is invalid."
    ${EndIf}
    GetFullPathName $CPAExistingData "$CPAExistingData"
  ${EndIf}
  cpa_data_done:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $CPAExistingData != ""
    FileOpen $R0 "$INSTDIR\initial-data-directory.txt" w
    ${If} $R0 == ""
      Abort "Could not save the selected data folder. Do not launch the app until Setup succeeds."
    ${EndIf}
    ; Explicit UTF-16LE preserves Windows paths without JSON escaping or codepages.
    FileWriteUTF16LE $R0 "$CPAExistingData"
    FileClose $R0
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
  ; Autostart uses the compiled application name. Remove only our own entry.
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "EasyCLIProxyAPI"
  ${If} $R0 == '$\"$INSTDIR\EasyCLIProxyAPI.exe$\"'
  ${OrIf} $R0 == '$INSTDIR\EasyCLIProxyAPI.exe'
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "EasyCLIProxyAPI"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Only the initial path hint belongs to Setup. Keep storage.json, profiles,
  ; credentials, databases, backups, and any non-packaged files in $INSTDIR.
  Delete "$INSTDIR\initial-data-directory.txt"
  RMDir "$INSTDIR"
!macroend
