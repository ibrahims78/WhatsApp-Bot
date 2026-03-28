@echo off
setlocal EnableDelayedExpansion

title System Reset Utility - Staff Health 2026

echo.
echo ======================================================
echo           CRITICAL WARNING - ACTION REQUIRED
echo ======================================================
echo   This command will PERMANENTLY delete:
echo     - All Employee records and User accounts
echo     - All Audit logs and Active sessions
echo     - All Uploaded files and System backups
echo.
echo   An 'admin' user will be created (Pass: 123456)
echo   THIS OPERATION CANNOT BE UNDONE!
echo ======================================================
echo.

set /p CONFIRM1="Are you sure? Type YES to continue: "
if /i not "%CONFIRM1%"=="YES" goto :CANCEL

set /p CONFIRM2="Final confirmation - Type RESET to proceed: "
if not "%CONFIRM2%"=="RESET" goto :CANCEL

echo.
echo Starting Reset Process...
echo ------------------------------------------------------

REM -- Database Credentials --
set POSTGRES_USER=hruser
set POSTGRES_DB=hr_db

REM -- 1. Stop App --
echo [1/5] Stopping application container...
docker stop staff-health-app >nul 2>&1
echo       Done.

REM -- 2. Wipe DB --
echo [2/5] Wiping database tables...
docker exec staff-health-db psql -U %POSTGRES_USER% -d %POSTGRES_DB% -c "DELETE FROM audit_logs; DELETE FROM session; DELETE FROM employees; DELETE FROM users;"

if %errorlevel% neq 0 (
    echo [ERROR] Database connection failed.
    pause
    exit /b 1
)
echo       Data cleared.

REM -- 3. Clear Uploads --
echo [3/5] Deleting uploaded files...
if exist "storage\uploads" (
    del /s /q "storage\uploads\*.*" >nul 2>&1
    for /d %%p in ("storage\uploads\*") do rd /s /q "%%p" >nul 2>&1
)
echo       Done.

REM -- 4. Clear Backups --
echo [4/5] Deleting backups...
if exist "storage\backups" del /q "storage\backups\*.*" >nul 2>&1
if exist "storage\temp_uploads" del /q "storage\temp_uploads\*.*" >nul 2>&1
echo       Done.

REM -- 5. Restart --
echo [5/5] Restarting application...
docker start staff-health-app >nul 2>&1
echo       Done.

echo.
echo ======================================================
echo  System Reset Completed!
echo  Login: admin / Pass: 123456
echo ======================================================
pause
exit /b 0

:CANCEL
echo Operation cancelled.
pause
exit /b 0