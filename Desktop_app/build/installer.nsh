; installer.nsh - custom NSIS page (database password + backup folder) and
; the hook that runs setup-sqlserver.ps1. Included into electron-builder's
; generated NSIS script via package.json's build.nsis.include.
;
; *** UNVERIFIED ON REAL WINDOWS - see DECISIONS.md, "REVISED: adopt a
; proven bundled-SQL-Server release pipeline". Written against documented
; NSIS/electron-builder customization patterns and the three rules below
; (learned the hard way in the reference project this pattern comes from),
; but this project's dev environment has no NSIS compiler and no Windows to
; test against. Must be verified with a real build before shipping - see
; Task 26's rewritten verification checklist, and ideally add an NSIS lint
; CI gate (Task 23) before trusting this compiles cleanly at all. ***
;
; Three rules that matter more than anything else in this file:
;
; 1. electron-builder compiles this script TWICE - once for the installer,
;    once for the uninstaller - and the hooks referencing custom
;    Vars/Functions only exist in the installer pass. Anything declaring a
;    Var or defining a Function must be wrapped in !ifndef BUILD_UNINSTALLER
;    or the uninstaller compile fails on "unreferenced" warnings (fatal
;    under -WX).
;
; 2. Detecting "is this a fresh install or an update" must check BOTH a
;    marker of "was this app ever installed on this machine" AND the
;    app-config.json file, not either alone. Marker-only: deleting the
;    config while the app stays installed skips this page *and* leaves
;    setup-sqlserver.ps1 with no password - it exits 1 and nothing gets
;    configured. Config-only: an uninstall-then-reinstall silently skips
;    the page with no way to ever change the password again. Both
;    conditions must hold before skipping the page.
;
;    IMPLEMENTATION NOTE: electron-builder's own uninstall registry key
;    (${UNINSTALL_REGISTRY_KEY}, defined in its multiUser.nsh template)
;    would be the obvious choice for the "marker" here, but tracing
;    NsisTarget.js's build (computeCommonInstallerScriptHeader's output -
;    which is where this custom .nsh file's content lands - is textually
;    concatenated BEFORE computeFinalScript's output, which is where
;    multiUser.nsh actually gets !include'd) found a real risk that this
;    file could be compiled before that define exists, a compile-order bug
;    this project has no way to test against (no NSIS compiler, no
;    Windows). Sidestepped entirely by using a self-owned registry marker
;    instead (HKLM\Software\Starmans\Installed, written by customInstall
;    on every successful install) rather than depending on
;    electron-builder-internal define availability timing.
;
; 3. The password is passed to setup-sqlserver.ps1 through a file in
;    $PLUGINSDIR, never on the command line - it never reaches the process
;    list that way, and NSIS never has to escape quotes into a command
;    string. $PLUGINSDIR is wiped automatically when the installer exits.

; REQUIRED - same compile-ordering reason documented in rule 2's note above:
; this file is concatenated into the generated script BEFORE electron-builder
; includes these headers itself, so ${If}/${EndIf} (LogicLib) and ${NSD_*}
; (nsDialogs) are not yet defined at the point this file is parsed. Confirmed
; empirically by a real build: `Invalid command: "${If}"` at what was then
; line 74. Both headers carry their own include guards (!ifndef LOGICLIB /
; !ifndef NSDIALOGS_INCLUDED), so including them here is a safe no-op when
; electron-builder includes them again later.
!include LogicLib.nsh
!include nsDialogs.nsh

!ifndef BUILD_UNINSTALLER
  Var Dialog
  Var Label
  Var PasswordInput
  Var PasswordConfirmInput
  Var BackupFolderInput
  Var BackupFolderBrowseButton
  Var BackupFolder
  Var IsUpdateInstall
  Var ProgramDataDir
  Var AppConfigPath

  ; Suggests a drive other than the one Windows/this app is installed on, so
  ; a single drive failure can't take out both the live database and every
  ; backup of it at once. Checks the common cases (D: through H:) rather than
  ; enumerating all 26 letters - NSIS has no easy string-building loop without
  ; the System plugin, and this is only ever a *suggested* default; the
  ; Browse button (below) lets the user pick anything else, including a USB
  ; drive plugged in after the installer starts. Falls back to
  ; $DOCUMENTS\Starmans Backup if no other drive is present (e.g. a
  ; single-drive machine).
  Function StarmansDefaultBackupPath
    StrCpy $0 "$DOCUMENTS\Starmans Backup"
    ${If} ${FileExists} "D:\*.*"
      StrCpy $0 "D:\Starmans Backup"
    ${ElseIf} ${FileExists} "E:\*.*"
      StrCpy $0 "E:\Starmans Backup"
    ${ElseIf} ${FileExists} "F:\*.*"
      StrCpy $0 "F:\Starmans Backup"
    ${ElseIf} ${FileExists} "G:\*.*"
      StrCpy $0 "G:\Starmans Backup"
    ${ElseIf} ${FileExists} "H:\*.*"
      StrCpy $0 "H:\Starmans Backup"
    ${EndIf}
  FunctionEnd

  Function StarmansDbPage
    ; NSIS has no built-in $COMMONPROGRAMDATA constant (unlike $APPDATA,
    ; which is per-user) - %ProgramData% must be read from the environment.
    ReadEnvStr $ProgramDataDir "ProgramData"
    StrCpy $AppConfigPath "$ProgramDataDir\Starmans\app-config.json"

    ; Rule 2: both conditions must hold to skip this page. Self-owned
    ; registry marker (see file header for why this isn't
    ; ${UNINSTALL_REGISTRY_KEY}) + the config file.
    StrCpy $IsUpdateInstall "0"
    ReadRegStr $0 HKLM "Software\Starmans" "Installed"
    ${If} $0 == "1"
    ${AndIf} ${FileExists} "$AppConfigPath"
      StrCpy $IsUpdateInstall "1"
      Return  ; skip the page entirely on a confirmed update
    ${EndIf}

    nsDialogs::Create 1018
    Pop $Dialog
    ${If} $Dialog == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 24u "Set a database password for Starmans. You'll need this if you ever reinstall on this machine - write it down somewhere safe."
    Pop $Label

    ${NSD_CreateLabel} 0 30u 100% 12u "Database Password:"
    Pop $Label
    ${NSD_CreatePassword} 0 42u 100% 14u ""
    Pop $PasswordInput

    ${NSD_CreateLabel} 0 60u 100% 12u "Confirm Password:"
    Pop $Label
    ${NSD_CreatePassword} 0 72u 100% 14u ""
    Pop $PasswordConfirmInput

    ${NSD_CreateLabel} 0 92u 100% 12u "Backup Folder:"
    Pop $Label
    Call StarmansDefaultBackupPath
    ${NSD_CreateText} 0 104u 80% 14u "$0"
    Pop $BackupFolderInput
    ${NSD_CreateBrowseButton} 82% 104u 18% 14u "Browse..."
    Pop $BackupFolderBrowseButton
    ${NSD_OnClick} $BackupFolderBrowseButton StarmansBrowseBackupFolder

    nsDialogs::Show
  FunctionEnd

  Function StarmansBrowseBackupFolder
    nsDialogs::SelectFolderDialog "Select Backup Folder" "$DOCUMENTS"
    Pop $0
    ${If} $0 != error
      ${NSD_SetText} $BackupFolderInput $0
    ${EndIf}
  FunctionEnd

  Function StarmansDbPageLeave
    ${If} $IsUpdateInstall == "1"
      Return
    ${EndIf}

    ${NSD_GetText} $PasswordInput $1
    ${NSD_GetText} $PasswordConfirmInput $2
    ${If} $1 == ""
      MessageBox MB_ICONEXCLAMATION "Please enter a database password."
      Abort
    ${EndIf}
    ${If} $1 != $2
      MessageBox MB_ICONEXCLAMATION "Passwords do not match."
      Abort
    ${EndIf}
    StrLen $3 $1
    ${If} $3 < 8
      MessageBox MB_ICONEXCLAMATION "Password must be at least 8 characters (SQL Server's password policy requires it)."
      Abort
    ${EndIf}

    ; Rule 3: write the password to a $PLUGINSDIR file, never the command line.
    FileOpen $4 "$PLUGINSDIR\db_password.txt" w
    FileWrite $4 "$1"
    FileClose $4

    ${NSD_GetText} $BackupFolderInput $5
    StrCpy $BackupFolder $5
  FunctionEnd
!endif

; electron-builder's documented hook point for inserting a custom page
; right after the "choose install directory" page. This is the actual
; insertion into the page flow - StarmansDbPage/StarmansDbPageLeave above
; are just function definitions until this macro wires them in.
!macro customPageAfterChangeDir
  Page custom StarmansDbPage StarmansDbPageLeave
!macroend

; customInstall - electron-builder's documented hook, called after files
; are copied but still within the elevated installer process.
!macro customInstall
  ; Self-owned marker for rule 2's "was this app ever installed here"
  ; check - written on every successful install (fresh or update alike),
  ; read back by StarmansDbPage on any future reinstall.
  WriteRegStr HKLM "Software\Starmans" "Installed" "1"

  ; NSIS itself is a 32-bit process. A bare `powershell.exe` here would be
  ; silently redirected to 32-bit PowerShell, which sees WOW6432Node and
  ; cannot find a real (64-bit) SQL Server install in the registry at all.
  ; Sysnative bypasses the WOW64 redirector; fall back to the normal path
  ; on the (unlikely) chance Sysnative isn't available.
  StrCpy $6 "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  ${IfNot} ${FileExists} $6
    StrCpy $6 "powershell.exe"
  ${EndIf}

  ; Everything PowerShell writes (stdout AND stderr) is redirected to a file
  ; in ProgramData. The v1.0.3 Windows test produced NO log at all, which made
  ; the failure undiagnosable - if the script dies before its own first log
  ; line (bad path, execution policy, a parse error, a missing .NET type) it
  ; can never log that itself. cmd's redirection captures those cases because
  ; it wraps the interpreter rather than living inside it.
  ReadEnvStr $9 "ProgramData"
  CreateDirectory "$9\Starmans"

  ; Hiding the console window (below) removes the "looks frozen" symptom, but
  ; the wait itself is still several silent minutes with no console to watch.
  ; This line to the install page's details list is the only feedback a
  ; non-technical user gets that something is actually happening.
  DetailPrint "Setting up the database - this can take several minutes..."

  ; Plain ExecWait on cmd.exe shows a real, visible console window for the
  ; entire multi-minute SQL Server install - which sat there BLANK (all
  ; output goes to the log file, not the window) and looked exactly like a
  ; hang to a v1.0.7 tester. nsExec::Exec runs the same command with its
  ; window hidden while still returning the exit code on the stack (Pop).
  ; Silent background provisioning was the intended UX all along (see
  ; release_pipeline.md's original design) - this was never a deliberate
  ; choice, just an oversight in how ExecWait was used.
  ${If} $IsUpdateInstall == "1"
    ; Update path: no password argument - the script reads it back from
    ; the existing app-config.json itself.
    nsExec::Exec '"$SYSDIR\cmd.exe" /C ""$6" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\setup-sqlserver.ps1" > "$9\Starmans\installer-powershell.log" 2>&1"'
    Pop $7
  ${Else}
    FileOpen $4 "$PLUGINSDIR\db_password.txt" r
    FileRead $4 $8
    FileClose $4
    nsExec::Exec '"$SYSDIR\cmd.exe" /C ""$6" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\setup-sqlserver.ps1" -SaPassword "$8" -BackupFolder "$BackupFolder" > "$9\Starmans\installer-powershell.log" 2>&1"'
    Pop $7
  ${EndIf}

  ${If} $7 != 0
    MessageBox MB_ICONSTOP "Database setup did not complete (exit code $7).$\r$\n$\r$\nStarmans is installed but cannot reach its database yet.$\r$\n$\r$\nTwo log files in C:\ProgramData\Starmans explain why:$\r$\n  installer-powershell.log$\r$\n  sqlserver-setup.log"
  ${EndIf}
!macroend
