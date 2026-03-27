@echo off
:: Unblock files to bypass Windows Security [cite: 2]
powershell -Command "dir '%~dp0\*' | Unblock-File"

:: Request Administrative Privileges [cite: 2]
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

TITLE EMS Test v1.0 Setup
set "targetDir=C:\employee-management-system"
if not exist "%targetDir%" mkdir "%targetDir%"

echo Copying required project files...
:: تم إزالة run_v1.0.bat من هنا لكي يتم نسخه بنجاح
echo start_v1.0.bat > exclude.txt
echo cleanup_v1.0.bat >> exclude.txt
echo exclude.txt >> exclude.txt

xcopy /y /q /e /h /exclude:exclude.txt ".\*" "%targetDir%\"
del exclude.txt

cd /d "%targetDir%"
:: Unblock files in the target directory [cite: 4]
powershell -Command "dir '%targetDir%\*' | Unblock-File"

echo Loading Docker Images...
docker load -i postgres_15_alpine.tar
docker load -i staff_health_app_v1.tar

echo Starting Isolated Environment (v1-0)...
docker-compose -p staff_health_v1-0 up -d

timeout /t 15 /nobreak > nul
start http://localhost:5001
pause