@echo off
rem ============================================================
rem  Journey System - one-click local test build
rem  Double-click this file. It will:
rem    1) check Node.js is installed
rem    2) install the app's libraries (first run only)
rem    3) start the app and open it in your browser
rem  Keep this window open while you use the app. Close it to stop.
rem ============================================================
cd /d "%~dp0"
echo.
echo  ============================================
echo    Journey System - Local Test Build
echo  ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js was not found on this computer.
  echo      Install it from https://nodejs.org  ^(LTS version^), then
  echo      double-click this file again.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo  [OK] Node.js %%v is installed

if not exist node_modules (
  echo.
  echo  Installing the app's libraries - first time only, takes a minute or two.
  echo  You'll see a lot of text scroll by. That's normal.
  echo.
  call npm ci
  if errorlevel 1 (
    echo.
    echo  [X] The install hit an error. Take a screenshot of this window
    echo      and show it to Claude - we'll sort it out.
    pause
    exit /b 1
  )
  echo.
  echo  [OK] Libraries installed.
)

if not exist firebase-applet-config.json (
  echo  Creating a placeholder Firebase config...
  node scripts\setup-firebase-config.cjs
)

echo.
echo  Starting the app. Your browser will open in about 10 seconds.
echo  The app lives at:  http://localhost:3000
echo.
echo  NOTE: until you finish steps 4-6 in DEV-SETUP.md (the free test
echo  Firebase project), the app will load but sign-in won't work yet.
echo.
start "" cmd /c "timeout /t 10 >nul & start http://localhost:3000"
call npm run dev
echo.
echo  The app has stopped. You can close this window.
pause
