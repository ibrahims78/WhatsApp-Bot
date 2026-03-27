@echo off
:: Unblock files to bypass Windows Security
powershell -Command "dir '%~dp0\*' | Unblock-File"

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
    pushd "%CD%"
    CD /D "%~dp0"

TITLE WhatsApp Manager - First-Time Setup

echo ============================================
echo    WhatsApp Manager - First-Time Setup
echo ============================================
echo.

:: Check Docker is installed and running
echo [1/3] Checking Docker status...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo Docker Desktop is not running. Attempting to start...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo Waiting for Docker to start (up to 90 seconds)...
    :docker_wait_loop
    timeout /t 5 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 goto docker_wait_loop
    echo Docker is now running.
) else (
    echo Docker is running. OK.
)

:: Build Docker images from source
echo.
echo [2/3] Building Docker images (may take 5-15 minutes on first run)...
echo       Building API Server image...
docker-compose -p whatsapp_manager_v1 build --no-cache
if %errorlevel% neq 0 (
    echo ERROR: Docker build failed. Check the error above.
    pause
    exit /B 1
)
echo Build complete.

:: Start all containers
echo.
echo [3/3] Starting all containers...
docker-compose -p whatsapp_manager_v1 up -d
if %errorlevel% neq 0 (
    echo ERROR: Failed to start containers. Check the error above.
    pause
    exit /B 1
)

echo.
echo Waiting for services to be ready (30 seconds)...
timeout /t 30 /nobreak >nul

echo.
echo ============================================
echo   Setup complete! Opening browser...
echo ============================================
echo.
echo Application URL:  http://localhost:5000
echo Default Username: admin
echo Default Password: 123456
echo.
echo *** IMPORTANT: Change your password immediately after first login! ***
echo.
echo For daily use, run: run_wa.bat
echo.
start http://localhost:5000
pause
exit
