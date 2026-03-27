@echo off
:: Self-unblock for stability
powershell -Command "Unblock-File -Path '%~f0'"

TITLE WhatsApp Manager - Launcher

set "installDir=C:\whatsapp-manager"
set "shortcutPath=%USERPROFILE%\Desktop\WhatsApp_Manager.lnk"

:: Create Desktop Shortcut if it doesn't exist
if not exist "%shortcutPath%" (
    powershell -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%shortcutPath%'); $s.TargetPath='%installDir%\docker-setup\run_wa.bat'; $s.WorkingDirectory='%installDir%\docker-setup'; $s.Description='WhatsApp Manager'; $s.Save()"
    echo Desktop shortcut created.
)

:: Check Docker Status
echo Checking Docker status...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo Waiting for Docker (up to 60 seconds)...
    :waiting_loop
    timeout /t 5 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 goto waiting_loop
    echo Docker is ready.
)

:: Start containers
echo Starting WhatsApp Manager containers...
cd /d "%installDir%\docker-setup"
docker-compose -p whatsapp_manager_v1 up -d

:: Wait and open browser
echo Waiting for services to start...
timeout /t 10 /nobreak >nul
start http://localhost:5000
exit
