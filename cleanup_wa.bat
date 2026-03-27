@echo off
:: Request Administrative Privileges
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    exit /B

:gotAdmin
    pushd "%CD%"
    CD /D "%~dp0"

TITLE WhatsApp Manager - Cleanup

echo ============================================
echo    WhatsApp Manager - Full Cleanup
echo ============================================
echo.
echo WARNING: This will remove all containers, images,
echo and stored data (WhatsApp sessions, messages, etc.)
echo.
set /p confirm=Are you sure? Type YES to continue: 
if /i not "%confirm%"=="YES" (
    echo Cleanup cancelled.
    pause
    exit
)

echo.
echo Stopping and removing containers and volumes...
cd /d "C:\whatsapp-manager"
docker-compose -p whatsapp_manager_v1 down -v

echo.
echo Removing Docker images...
docker rmi whatsapp-manager-api:latest whatsapp-manager-dashboard:latest 2>nul

echo.
echo Removing desktop shortcut...
if exist "%USERPROFILE%\Desktop\WhatsApp_Manager.lnk" (
    del "%USERPROFILE%\Desktop\WhatsApp_Manager.lnk"
)

echo.
echo Removing installation directory...
if exist "C:\whatsapp-manager" (
    rmdir /s /q "C:\whatsapp-manager"
)

echo.
echo ============================================
echo   Cleanup complete. All data has been removed.
echo ============================================
pause
exit
