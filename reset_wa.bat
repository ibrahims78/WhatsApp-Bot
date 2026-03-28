@echo off
setlocal EnableDelayedExpansion

powershell -Command "Unblock-File -Path '%~f0'"

TITLE WhatsApp Manager - Data Reset

set "installDir=C:\whatsapp-manager"
set "POSTGRES_USER=wauser"
set "POSTGRES_DB=whatsapp_manager_db"

echo.
echo ======================================================
echo         CRITICAL WARNING - ACTION REQUIRED
echo ======================================================
echo   This will PERMANENTLY delete:
echo     - All WhatsApp sessions and their data
echo     - All messages history
echo     - All users (except a new admin will be created)
echo     - All API keys
echo     - All audit logs
echo.
echo   An 'admin' account will be re-created (Pass: 123456)
echo   THIS OPERATION CANNOT BE UNDONE!
echo ======================================================
echo.

:: Double confirmation
set /p CONFIRM1="Are you sure? Type YES to continue: "
if /i not "%CONFIRM1%"=="YES" goto :CANCEL

set /p CONFIRM2="Final confirmation - Type RESET to proceed: "
if not "%CONFIRM2%"=="RESET" goto :CANCEL

:: Choose which environment to reset
echo.
echo Which environment do you want to reset?
echo   [1] Production
echo   [2] Development
echo.
set /p ENV_CHOICE="Enter choice (1/2): "

if "%ENV_CHOICE%"=="1" (
    set "DB_CONTAINER=whatsapp_manager_v1-db-1"
    set "API_CONTAINER=whatsapp_manager_v1-api-1"
)
if "%ENV_CHOICE%"=="2" (
    set "DB_CONTAINER=whatsapp_manager_dev-db-1"
    set "API_CONTAINER=whatsapp_manager_dev-api-1"
)
if not defined DB_CONTAINER (
    echo Invalid choice. Operation cancelled.
    pause
    exit /b 1
)

echo.
echo Starting Reset Process...
echo ------------------------------------------------------

:: [1/4] Stop API container
echo [1/4] Stopping API container...
docker stop %API_CONTAINER% >nul 2>&1
echo Done.

:: [2/4] Wipe all tables (order respects foreign key constraints)
echo.
echo [2/4] Clearing all data from database...
docker exec %DB_CONTAINER% psql -U %POSTGRES_USER% -d %POSTGRES_DB% -c ^
  "DELETE FROM audit_logs; DELETE FROM api_keys; DELETE FROM messages; DELETE FROM whatsapp_sessions; DELETE FROM users;"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Could not connect to database.
    echo Make sure the environment is running before attempting a reset.
    docker start %API_CONTAINER% >nul 2>&1
    pause
    exit /b 1
)
echo Data cleared.

:: [3/4] Remove WhatsApp session token files
echo.
echo [3/4] Clearing WhatsApp session token files...
docker exec %API_CONTAINER% sh -c "rm -rf /app/artifacts/api-server/tokens/* /app/artifacts/api-server/public/*" 2>nul
echo Done.

:: [4/4] Restart API (auto-seeds admin user on startup)
echo.
echo [4/4] Restarting API server (will re-create admin account)...
docker start %API_CONTAINER% >nul 2>&1
echo Done.

echo.
echo ======================================================
echo   Reset Complete!
echo   Login: admin  /  Password: 123456
echo   You will be prompted to change your password.
echo ======================================================
echo.
pause
exit /b 0

:CANCEL
echo.
echo   Operation cancelled. No changes were made.
echo.
pause
exit /b 0
