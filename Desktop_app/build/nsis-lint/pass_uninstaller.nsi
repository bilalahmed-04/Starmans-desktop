; Simulates electron-builder's UNINSTALLER compile pass for installer.nsh —
; BUILD_UNINSTALLER IS defined, so everything inside installer.nsh's
; `!ifndef BUILD_UNINSTALLER` guard (the custom page's Vars/Functions) must
; be skipped entirely. This is the pass that catches "declared a Var/Function
; outside the guard" bugs — those become fatal "unreferenced" warnings here
; even though the installer pass compiles fine. See ../lint-nsis.sh and
; release_pipeline.md §2 for why this exact failure mode is worth a
; dedicated CI gate.
!define BUILD_UNINSTALLER
; Deliberately does NOT include MUI2.nsh — this harness inserts no MUI pages,
; and MUI2 declares vars (mui.Header.Text etc.) that then trip "not referenced
; or never set" warnings, fatal under -WX. installer.nsh itself pulls in the
; only headers it actually needs (LogicLib, nsDialogs) directly.

Name "Starmans Lint Harness (Uninstall)"
OutFile "starmans-lint-uninstaller.exe"
Unicode true

; Forward slash — see the same note in pass_installer.nsi.
!include "../installer.nsh"

; Deliberately does NOT insert customPageAfterChangeDir or customInstall —
; electron-builder's real uninstaller pass never calls these hooks either
; (they live in installSection.nsh/assistedInstaller.nsh, which are only
; part of the installer-pass template, not uninstaller.nsh). If this file
; compiles clean, it proves nothing inside installer.nsh's guarded section
; leaks into the uninstaller pass.

; NSIS requires at least one regular Section even in a script whose point is
; the Uninstall section, and requires WriteUninstaller to be called somewhere
; if an Uninstall section exists (warning 6020, fatal under -WX) — harness
; scaffolding only, no bearing on what's actually being linted.
Section "Dummy"
  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
SectionEnd
