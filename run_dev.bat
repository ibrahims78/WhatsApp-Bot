@echo off
powershell -Command "Unblock-File -Path '%~f0'"

TITLE WhatsApp Manager - Dev Launcher

set "installDir=C:\whatsapp-manager"

echo Checking Docker...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    :waiting_loop
    timeout /t 5 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 goto waiting_loop
)

cd /d "%installDir%"
docker-compose -f docker-compose.dev.yml -p whatsapp_manager_dev up -d

timeout /t 15 /nobreak >nul
start http://localhost:5005
exit
