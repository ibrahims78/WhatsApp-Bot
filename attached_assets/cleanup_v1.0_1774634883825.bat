@echo off
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
    pushd "%CD%"
    CD /D "%~dp0"

TITLE EMS Test v1.0 Cleanup
:: Clean containers and dynamic volumes
docker-compose -p staff_health_v1-0 down -v

echo Removing system images...
docker rmi staff_health_app_v1 postgres:15-alpine

if exist "%USERPROFILE%\Desktop\EMS_v1.lnk" del "%USERPROFILE%\Desktop\EMS_v1.lnk"

echo Deleting system directory...
if exist "C:\employee-management-system" rmdir /s /q "C:\employee-management-system"

echo Cleanup complete.
pause
exit