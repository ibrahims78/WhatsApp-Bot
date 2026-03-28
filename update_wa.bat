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

echo.
echo Which type of update do you want?
echo   [1] Fast update  - Pull code + restart containers only (no rebuild)
echo       Use this for: code changes only (src files, no new packages)
echo   [2] Full rebuild - Pull code + full Docker image rebuild (no-cache)
echo       Use this for: new packages added, Dockerfile changed, or first setup
echo.
set /p updateType=Enter choice (1/2): 

:: Pull latest code from GitHub
echo.
echo [1/3] Pulling latest code from GitHub...
cd /d "%installDir%"
git pull origin main 2>nul
if %errorlevel% neq 0 git pull origin master 2>nul
echo Code updated.

:: Stop the OTHER environment first to free port 5005
echo.
echo [2/3] Stopping the other environment to free port 5005...
if "%mode%"=="1" docker-compose -f docker-compose.dev.yml -p whatsapp_manager_dev down 2>nul
if "%mode%"=="2" docker-compose -p whatsapp_manager_v1 down 2>nul
echo Done.

:: Apply update based on chosen type
echo.
if "%updateType%"=="1" goto :fast_update
goto :full_rebuild

:fast_update
echo [3/3] Fast update: restarting containers only...
if "%mode%"=="1" docker-compose -p whatsapp_manager_v1 restart
if "%mode%"=="2" docker-compose -f docker-compose.dev.yml -p whatsapp_manager_dev restart
echo Containers restarted.
goto :done

:full_rebuild
echo [3/3] Full rebuild: rebuilding Docker image (no cache)...
if "%mode%"=="1" docker-compose -p whatsapp_manager_v1 build --no-cache
if "%mode%"=="1" docker-compose -p whatsapp_manager_v1 up -d
if "%mode%"=="2" docker-compose -f docker-compose.dev.yml -p whatsapp_manager_dev build --no-cache
if "%mode%"=="2" docker-compose -f docker-compose.dev.yml -p whatsapp_manager_dev up -d
echo Rebuild complete and containers started.
goto :done

:done
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
