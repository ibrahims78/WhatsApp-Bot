@echo off
powershell -Command "Unblock-File -Path '%~f0'"

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
    if exist "%temp%\getadmin.vbs" ( del "%temp%\getadmin.vbs" )

TITLE WhatsApp Manager - Full Cleanup

set "installDir=C:\whatsapp-manager"

echo ============================================
echo    WhatsApp Manager - Full Cleanup
echo ============================================
echo.
echo   WARNING: This will permanently remove:
echo     - All running containers (production + development)
echo     - All database data and WhatsApp sessions
echo     - All Docker images for this application
echo     - Desktop shortcuts
echo     - Installation folder: %installDir%
echo.
echo   THIS OPERATION CANNOT BE UNDONE!
echo ============================================
echo.

set /p CONFIRM="Are you sure? Type YES to continue: "
if /i not "%CONFIRM%"=="YES" goto :CANCEL

echo.
echo Starting cleanup...
echo.

:: [1/5] Stop and remove all containers and volumes
echo [1/5] Stopping and removing all containers and data volumes...
cd /d "%installDir%"
docker-compose -p whatsapp_manager_v1 down -v 2>nul
docker-compose -f docker-compose.dev.yml -p whatsapp_manager_dev down -v 2>nul
echo Done.

:: [2/5] Remove Docker images
echo.
echo [2/5] Removing Docker images...
docker rmi whatsapp-manager-api:latest 2>nul
docker rmi whatsapp-manager-dashboard:latest 2>nul
docker rmi whatsapp-manager-api-dev:latest 2>nul
docker rmi whatsapp-manager-dashboard-dev:latest 2>nul
docker rmi postgres:15-alpine 2>nul
echo Done.

:: [3/5] Clean up unused Docker resources
echo.
echo [3/5] Cleaning up unused Docker resources...
docker image prune -f 2>nul
echo Done.

:: [4/5] Remove desktop shortcuts
echo.
echo [4/5] Removing desktop shortcuts...
if exist "%USERPROFILE%\Desktop\WhatsApp_Manager.lnk"     del "%USERPROFILE%\Desktop\WhatsApp_Manager.lnk"
if exist "%USERPROFILE%\Desktop\WhatsApp_Manager_Dev.lnk" del "%USERPROFILE%\Desktop\WhatsApp_Manager_Dev.lnk"
echo Done.

:: [5/5] Remove installation folder
echo.
echo [5/5] Deleting installation folder...
cd /d "%TEMP%"
if exist "%installDir%" rmdir /s /q "%installDir%"
echo Done.

echo.
echo ============================================
echo   Cleanup complete.
echo   To reinstall, download and run start_wa.bat again.
echo ============================================
echo.
pause
exit /b 0

:CANCEL
echo.
echo   Operation cancelled. No changes were made.
echo.
pause
exit /b 0
