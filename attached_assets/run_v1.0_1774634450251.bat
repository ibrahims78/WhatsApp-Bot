@echo off
:: Self-unblock for stability
powershell -Command "Unblock-File -Path '%~f0'"
TITLE EMS Test v1.0 Launcher
set "targetDir=C:\employee-management-system"
set "shortcutPath=%USERPROFILE%\Desktop\EMS_v1.lnk"

:: 1 - Create Shortcut
if not exist "%shortcutPath%" (
    powershell -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%shortcutPath%'); $s.TargetPath='%targetDir%\run_v1.0.bat'; $s.WorkingDirectory='%targetDir%'; $s.IconLocation='%targetDir%\Employee Management System.ico'; $s.Save()"
)

:: 2 - Check Docker Status
docker info >nul 2>&1
if %errorlevel% neq 0 (
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    :waiting_loop
    timeout /t 5 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% neq 0 goto waiting_loop
)

:: 3 - Launch Containers with Project Name
cd /d "%targetDir%"
docker-compose -p staff_health_v1-0 up -d

:: 4 - Open Browser
timeout /t 10 /nobreak >nul
start http://localhost:5001
exit