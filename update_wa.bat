@echo off
powershell -Command "Unblock-File -Path '%~f0'"

TITLE WhatsApp Manager - Update

set "installDir=C:\whatsapp-manager"

echo ============================================
echo    WhatsApp Manager - Update from GitHub
echo ============================================
echo.

:: Ask which mode to update
echo Which mode do you want to run?
echo   [1] Production  (docker-compose.yml)
echo   [2] Development (docker-compose.dev.yml)
echo.
set /p mode=Enter choice (1/2): 

:: Pull latest code from GitHub
echo.
echo [1/4] Pulling latest code from GitHub...
cd /d "%installDir%"
git pull origin main 2>nul
if %errorlevel% neq 0 git pull origin master 2>nul
echo Code updated.

:: Stop the OTHER environment first to free port 5005
echo.
echo [2/4] Stopping the other environment to free port 5005...
if "%mode%"=="1" (
    docker-compose -f docker-compose.dev.yml -p whatsapp_manager_dev down 2>nul
)
if "%mode%"=="2" (
    docker-compose -p whatsapp_manager_v1 down 2>nul
)
echo Done.

:: Rebuild selected environment
echo.
echo [3/4] Rebuilding Docker image (no cache)...
if "%mode%"=="1" (
    docker-compose -p whatsapp_manager_v1 build --no-cache
)
if "%mode%"=="2" (
    docker-compose -f docker-compose.dev.yml -p whatsapp_manager_dev build --no-cache
)

:: Start selected environment
echo.
echo [4/4] Starting containers...
if "%mode%"=="1" (
    docker-compose -p whatsapp_manager_v1 up -d
)
if "%mode%"=="2" (
    docker-compose -f docker-compose.dev.yml -p whatsapp_manager_dev up -d
)

echo.
echo ============================================
echo   Update complete!
echo ============================================
echo.
echo   http://localhost:5005
echo.
timeout /t 5 /nobreak >nul
start http://localhost:5005
pause
exit
