@echo off
chcp 65001 >nul
title Pickleball Booking System

echo ============================================
echo   PICKLEBALL COURT BOOKING SYSTEM v2.0
echo ============================================
echo.

:: ---- Auto-detect PostgreSQL path ----
set "PG_BIN="
for /d %%D in ("C:\Program Files\PostgreSQL\*") do set "PG_BIN=%%D\bin"
if not defined PG_BIN (
    echo [ERROR] Khong tim thay PostgreSQL trong Program Files!
    echo   Tai tai: https://www.postgresql.org/download/windows/
    pause
    exit /b 1
)

:: ---- Check PostgreSQL ----
echo [1/3] Kiem tra PostgreSQL...
"%PG_BIN%\pg_isready.exe" -h localhost -p 5432 >nul 2>&1
if errorlevel 1 (
    echo     PostgreSQL chua chay. Dang khoi dong...
    net start postgresql-x64-17 >nul 2>&1 || net start postgresql-x64-16 >nul 2>&1 || (
        echo     [WARN] Khong khoi dong duoc service. Thu pg_ctl...
        for /d %%D in ("C:\Program Files\PostgreSQL\*") do (
            "%PG_BIN%\pg_ctl.exe" start -D "%%D\data" -w >nul 2>&1
        )
    )
    timeout /t 3 /nobreak >nul
    "%PG_BIN%\pg_isready.exe" -h localhost -p 5432 >nul 2>&1
    if errorlevel 1 (
        echo     [ERROR] PostgreSQL van chua san sang!
        pause
        exit /b 1
    )
)
echo     [OK] PostgreSQL dang chay.

:: ---- Install dependencies if missing ----
echo [2/3] Kiem tra dependencies...
if not exist "%~dp0server\node_modules" (
    echo     Cai dat npm packages...
    cd /d "%~dp0server"
    npm install --production
    cd /d "%~dp0"
)
echo     [OK] Dependencies san sang.

:: ---- Start Node.js server ----
echo [3/3] Khoi dong Server...
cd /d "%~dp0server"
start "Pickleball Server" cmd /k "node src/index.js"
timeout /t 2 /nobreak >nul

:: ---- Open browser ----
echo.
echo ============================================
echo   Server: http://localhost:3000
echo ============================================
echo.
echo   Admin : admin@pickleball.vn / admin123
echo   User  : user1@gmail.com / 123456
echo   VIP   : vip@gmail.com / 123456
echo.
echo   * Nhan Ctrl+C trong cua so Server de dung
echo   * Hoac dong cua so "Pickleball Server"
echo ============================================
echo.
start "" http://localhost:3000

pause
