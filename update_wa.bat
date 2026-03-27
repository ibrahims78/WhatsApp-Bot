@echo off
powershell -Command "Unblock-File -Path '%~f0'"

TITLE WhatsApp Manager - Update

set "installDir=C:\whatsapp-manager"

echo ============================================
echo    WhatsApp Manager - Update from GitHub
echo ============================================
echo.

:: Ask which mode to update
echo Which mode do you want to update?
echo   [1] Production  (docker-compose.yml)
echo   [2] Development (docker-compose.dev.yml)
echo   [3] Both
echo.
set /p mode=Enter choice (1/2/3): 

:: Pull latest code from GitHub
echo.
echo [1/3] Pulling latest code from GitHub...
cd /d "%installDir%"
git pull origin main 2>nul || git pull origin master 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Failed to pull from GitHub. Check your connection.
    pause
    exit /B 1
)
echo Code updated.

:: Rebuild and restart based on mode
echo.
echo [2/3] Rebuilding Docker images...

if "%mode%"=="1" (
    docker-compose -p whatsapp_manager_v1 build --no-cache
)
if "%mode%"=="2" (
    docker-compose -f docker-compose.dev.yml -p whatsapp_manager_dev build --no-cache
)
if "%mode%"=="3" (
    docker-compose -p whatsapp_manager_v1 build --no-cache
    docker-compose -f docker-compose.dev.yml -p whatsapp_manager_dev build --no-cache
)

echo.
echo [3/3] Restarting containers...

if "%mode%"=="1" (
    docker-compose -p whatsapp_manager_v1 up -d
)
if "%mode%"=="2" (
    docker-compose -f docker-compose.dev.yml -p whatsapp_manager_dev up -d
)
if "%mode%"=="3" (
    docker-compose -p whatsapp_manager_v1 up -d
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
