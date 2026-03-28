@echo off
powershell -Command "Unblock-File -Path '%~f0'"

TITLE WhatsApp Manager - Dev Launcher

set "installDir=C:\whatsapp-manager"

echo Checking Docker...
docker info >nul 2>&1
if %errorlevel% equ 0 goto docker_ready

start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo Waiting for Docker (up to 90 seconds)...

:waiting_loop
timeout /t 5 /nobreak >nul
docker info >nul 2>&1
if %errorlevel% neq 0 goto waiting_loop

:docker_ready

:: Stop production containers to free port 5005
echo Stopping production containers (if running)...
cd /d "%installDir%"
docker-compose -p whatsapp_manager_v1 down 2>nul

:: Start dev containers
docker-compose -f docker-compose.dev.yml -p whatsapp_manager_dev up -d

timeout /t 15 /nobreak >nul
start http://localhost:5005
exit
