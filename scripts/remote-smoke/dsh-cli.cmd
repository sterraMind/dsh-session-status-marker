@echo off
rem ============================================================================
rem  dsh-cli.cmd - run the DSH CLI of a *packaged* (Electron) DSH install.
rem
rem  The desktop preview build ships no `dsh` shim (the scoop manifest has no
rem  `bin` entry): the CLI lives inside app.asar and must be driven through the
rem  Electron binary in "run as node" mode. This wrapper reproduces the official
rem  `dsh-desktop-host/lib/cli.js` entry so `--dump-config`, `plugin add`, etc.
rem  behave exactly as they do for the desktop app.
rem
rem  Usage:
rem    dsh-cli.cmd --version
rem    dsh-cli.cmd plugin --profile <name> add <path-to-tarball>
rem    dsh-cli.cmd --profile <name> --dump-config
rem
rem  Environment:
rem    DSH_APP_HOME    install root; defaults to %SCOOP%\apps\deepseek-harness-pre\current
rem                    (or %USERPROFILE%\scoop\... when SCOOP is unset)
rem    DSH_HOME        harness home; the isolated smoke home is recommended so a
rem                    test run never touches the real user profile
rem ============================================================================
setlocal

if "%DSH_APP_HOME%"=="" (
  if "%SCOOP%"=="" (
    set "DSH_APP_HOME=%USERPROFILE%\scoop\apps\deepseek-harness-pre\current"
  ) else (
    set "DSH_APP_HOME=%SCOOP%\apps\deepseek-harness-pre\current"
  )
)

set "DSH_EXE=%DSH_APP_HOME%\DeepSeek Harness.exe"
set "DSH_CLI=%DSH_APP_HOME%\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js"

if not exist "%DSH_EXE%" (
  echo dsh-cli: executable not found: "%DSH_EXE%" 1>&2
  exit /b 1
)
if not exist "%DSH_CLI%" (
  echo dsh-cli: CLI entry not found: "%DSH_CLI%" 1>&2
  exit /b 1
)

set "ELECTRON_RUN_AS_NODE=1"
set "DSH_DESKTOP_NODE_EXECUTABLE=%DSH_EXE%"
"%DSH_EXE%" --expose-internals "%DSH_CLI%" %*
exit /b %ERRORLEVEL%