@echo off
title Nakiwhiteware Ops HQ
echo ============================================
echo   Nakiwhiteware Ops HQ
echo   Starting on http://localhost:5555
echo ============================================
echo.

cd /d "%~dp0"

:: Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Python not found. Install Python first.
    pause
    exit /b 1
)

:: Check Flask
python -c "import flask" >nul 2>nul
if %errorlevel% neq 0 (
    echo Flask not installed. Installing now...
    pip install flask
    echo.
)

:: Google Geocoding API key (persisted via setx; this line is a fallback if env not loaded)
if "%GOOGLE_GEOCODING_KEY%"=="" set "GOOGLE_GEOCODING_KEY=REDACTED_KEY_2"

:: Start browser after 2 seconds
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:5555"

:: Run the app
python app.py

pause
