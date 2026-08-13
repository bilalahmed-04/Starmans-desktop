; Simulates electron-builder's INSTALLER compile pass for installer.nsh —
; BUILD_UNINSTALLER is NOT defined, so the custom page Vars/Functions and
; the customInstall/customPageAfterChangeDir hooks are all active, same as
; a real installer build. See ../lint-nsis.sh and release_pipeline.md §2.
!include "MUI2.nsh"
!include "nsDialogs.nsh"

Name "Starmans Lint Harness"
OutFile "starmans-lint-installer.exe"
Unicode true

; Forward slash so this harness compiles under both the Linux makensis used
; by the CI lint job and the Windows one used by a real build — NSIS accepts
; either separator, but Linux makensis cannot resolve a backslash path.
!include "../installer.nsh"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro customPageAfterChangeDir
!insertmacro MUI_PAGE_INSTFILES

; MUI requires a language table for its page title/subtitle LangStrings —
; without it, MUI_PAGE_DIRECTORY emits "LangString ... is not set in language
; table" warnings, which -WX turns fatal. electron-builder's real build sets
; this up itself; the harness has to do it explicitly. Purely a harness
; concern — nothing to do with installer.nsh's own correctness.
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  !insertmacro customInstall
SectionEnd
