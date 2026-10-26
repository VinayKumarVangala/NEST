@echo off
REM NEST Clean Install Test Runner
REM Run as Administrator in Windows Sandbox or VM

echo ============================================================
echo NEST Clean Install Test Runner
REM ============================================================
echo.

REM Check for admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator
    echo Right-click PowerShell and select "Run as Administrator"
    pause
    exit /b 1
)

REM Check for installer
if "%~1"=="" (
    echo Usage: %~nx0 ^<path-to-NEST-Setup.exe^>
    echo Example: %~nx0 "C:\Downloads\NEST-Setup.exe"
    echo.
    echo Optional flags:
    echo   -testuninstall   Run uninstall test after other tests
    echo   -startup         Enable startup at login
    echo.
    pause
    exit /b 1
endif

set INSTALLER=%~1
shift

set TEST_UNINSTALL=false
set ENABLE_STARTUP=false

:parse_args
if "%~1"=="" goto :run_tests
if "%~1"=="-testuninstall" set TEST_UNINSTALL=true
if "%~1"=="-startup" set ENABLE_STARTUP=true
shift
goto :parse_args

:run_tests
echo Installer: %INSTALLER%
echo Test Uninstall: %TEST_UNINSTALL%
echo Enable Startup: %ENABLE_STARTUP%
echo.

if not exist "%INSTALLER%" (
    echo ERROR: Installer not found: %INSTALLER%
    pause
    exit /b 1
)

REM Check network profile
for /f "tokens=2 delims=:" %%a in ('powershell -command "Get-NetConnectionProfile ^| Where-Object { $_.IPv4Connectivity -eq 'Internet' } ^| Select-Object -First 1 -ExpandProperty NetworkCategory"') do set NET_PROFILE=%%a
if "%NET_PROFILE%" neq "Private" (
    echo WARNING: Network profile is %NET_PROFILE%, should be Private
    echo Please set network to Private in Settings > Network & Internet
    echo.
)

echo.
echo Starting PowerShell test script...
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0NEST-InstallTest.ps1" -InstallerPath "%INSTALLER%" %* 2>&1 | tee "%TEMP%\NEST-InstallTest.log"

echo.
echo Test completed. Log saved to %TEMP%\NEST-InstallTest.log
pause