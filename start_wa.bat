@echo off
:: Unblock files to bypass Windows Security
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

TITLE WhatsApp Manager - Setup

set "installDir=C:\whatsapp-manager"
set "repoUrl=https://github.com/ibrahims78/WhatsApp-Bot"
set "envFile=%installDir%\.env"

echo ============================================
echo    WhatsApp Manager - Automated Setup
echo ============================================
echo.

:: ─── STEP 1: Check Git ──────────────────────────────────────────────────────
echo [1/5] Checking Git installation...
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Git is not installed on this machine.
    echo Please install Git from: https://git-scm.com/download/win
    echo Then re-run this file.
    pause
    exit /B 1
)
echo Git found. OK.

:: ─── STEP 2: Check Docker ───────────────────────────────────────────────────
echo.
echo [2/5] Checking Docker status...
docker info >nul 2>&1
if %errorlevel% equ 0 goto docker_ready

echo Docker Desktop is not running. Attempting to start...
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
echo Waiting for Docker to start (up to 90 seconds)...

:docker_wait_loop
timeout /t 5 /nobreak >nul
docker info >nul 2>&1
if %errorlevel% neq 0 goto docker_wait_loop
echo Docker is ready.
goto docker_done

:docker_ready
echo Docker is running. OK.

:docker_done

:: ─── STEP 3: Clone or Update Project from GitHub ────────────────────────────
echo.
echo [3/5] Setting up project from GitHub...

if exist "%installDir%\.git" (
    echo Project already exists. Pulling latest changes...
    cd /d "%installDir%"
    git pull origin main 2>nul || git pull origin master 2>nul
    echo Project updated.
    goto clone_done
)

if exist "%installDir%" rmdir /s /q "%installDir%"
echo Cloning from GitHub...
git clone "%repoUrl%" "%installDir%"
if %errorlevel% neq 0 (
    echo ERROR: Failed to clone repository.
    echo Check your internet connection and try again.
    pause
    exit /B 1
)
echo Project cloned successfully.

:clone_done

:: ─── STEP 4: Generate secure .env ───────────────────────────────────────────
echo.
echo [4/5] Generating secure configuration...

:: Generate a cryptographically random 96-character hex secret
for /f %%i in ('powershell -NoProfile -Command "[System.BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48)).Replace('-','').ToLower()"') do set "JWT_GENERATED=%%i"

:: Check if .env already has a real JWT_SECRET (not placeholder)
set "needsEnv=1"
if not exist "%envFile%" goto write_env

findstr /C:"GENERATED_AUTOMATICALLY" "%envFile%" >nul 2>&1
if %errorlevel% neq 0 (
    set "needsEnv=0"
    echo Configuration already exists with a real secret. Keeping it.
    goto env_done
)

:write_env
if "%needsEnv%"=="1" (
    echo Writing new configuration with generated JWT secret...
    (
        echo POSTGRES_USER=wauser
        echo POSTGRES_PASSWORD=wapassword123
        echo POSTGRES_DB=whatsapp_manager_db
        echo JWT_SECRET=%JWT_GENERATED%
        echo APP_PORT=5005
        echo NODE_ENV=production
    ) > "%envFile%"
    echo Configuration written successfully.
)

:env_done

:: ─── STEP 5: Build and Start Docker Containers ──────────────────────────────
echo.
echo [5/5] Building and starting containers (5-15 minutes on first run)...
cd /d "%installDir%"

docker-compose -p whatsapp_manager_v1 build --no-cache
if %errorlevel% neq 0 (
    echo ERROR: Docker build failed. See output above for details.
    pause
    exit /B 1
)

docker-compose -p whatsapp_manager_v1 up -d
if %errorlevel% neq 0 (
    echo ERROR: Failed to start containers.
    pause
    exit /B 1
)

:: Create Desktop Shortcut
set "shortcutPath=%USERPROFILE%\Desktop\WhatsApp_Manager.lnk"
if not exist "%shortcutPath%" (
    powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%shortcutPath%'); $s.TargetPath='%installDir%\run_wa.bat'; $s.WorkingDirectory='%installDir%'; $s.Description='WhatsApp Manager'; $s.Save()"
    echo Desktop shortcut created.
)

echo.
echo Waiting for services to be ready (30 seconds)...
timeout /t 30 /nobreak >nul

echo.
echo ============================================
echo   Setup complete!
echo ============================================
echo.
echo   Application URL:   http://localhost:5005
echo   Default Username:  admin
echo   Default Password:  123456
echo.
echo   *** Change your password immediately after first login! ***
echo.
echo   For daily use: double-click WhatsApp_Manager on the desktop.
echo.
start http://localhost:5005
pause
exit
