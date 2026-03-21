@echo off
setlocal EnableDelayedExpansion
title DataForge

cls
echo.
echo  +=========================================================+
echo  ^|        DataForge  --  AutoML Platform                  ^|
echo  ^|  Regression ^& Classification  ^|  XGBoost ^|  EDA        ^|
echo  +=========================================================+
echo.

set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%backend"
set "VENV_DIR=%SCRIPT_DIR%.venv"
set "FRONTEND_PATH=%SCRIPT_DIR%frontend\index.html"

:: ---------------------------------------------------------------
:: Step 1 - Ensure uv is available
:: ---------------------------------------------------------------
echo [1/7] Checking for uv...
uv --version >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%v in ('uv --version 2^>^&1') do echo        Found: %%v
    goto :step2
)

echo        uv not found. Attempting to install...
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex" >nul 2>&1

:: Reload user PATH so uv is visible in this session
for /f "usebackq tokens=*" %%p in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('PATH','User')"`) do (
    set "PATH=%%p;%PATH%"
)

uv --version >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%v in ('uv --version 2^>^&1') do echo        Installed: %%v
    goto :step2
)

echo.
echo  [ERROR] Could not install uv automatically.
echo          Install it manually by opening PowerShell and running:
echo            irm https://astral.sh/uv/install.ps1 ^| iex
echo          Then close and reopen this window and try again.
echo.
pause & exit /b 1

:: ---------------------------------------------------------------
:: Step 2 - Python via uv
:: ---------------------------------------------------------------
:step2
echo.
echo [2/7] Setting up Python 3.11...
uv python install 3.11 >nul 2>&1
if not errorlevel 1 (
    echo        Python 3.11 ready
    goto :step3
)
echo        [WARN] uv could not install Python 3.11.
uv python find 3.11 >nul 2>&1
if not errorlevel 1 (
    echo        Python 3.11 already available
    goto :step3
)
echo.
echo  [ERROR] Python 3.11 is not available.
echo          Run this manually:  uv python install 3.11
echo.
pause & exit /b 1

:: ---------------------------------------------------------------
:: Step 3 - Virtual environment
:: ---------------------------------------------------------------
:step3
echo.
echo [3/7] Setting up virtual environment...
if not exist "%VENV_DIR%\Scripts\activate.bat" (
    uv venv "%VENV_DIR%" --python 3.11
    if errorlevel 1 (
        echo  [ERROR] Failed to create virtual environment.
        pause & exit /b 1
    )
    echo        Created .venv ^(Python 3.11^)
) else (
    echo        .venv already exists
)
call "%VENV_DIR%\Scripts\activate.bat"
if errorlevel 1 ( echo  [ERROR] Cannot activate .venv & pause & exit /b 1 )
echo        Activated

:: ---------------------------------------------------------------
:: Step 4 - Core packages
:: ---------------------------------------------------------------
echo.
echo [4/7] Installing core packages...
echo        fastapi  uvicorn  scikit-learn  pandas  numpy  scipy  joblib
uv pip install ^
    "fastapi>=0.100.0" ^
    "uvicorn[standard]>=0.20.0" ^
    "scikit-learn>=1.3.0" ^
    "pandas>=2.0.0" ^
    "numpy>=1.24.0" ^
    "scipy>=1.10.0" ^
    "joblib>=1.3.0" ^
    "aiofiles>=23.0.0" ^
    "python-multipart>=0.0.6" ^
    --quiet
if errorlevel 1 (
    echo  [ERROR] Core install failed. Check your internet connection.
    pause & exit /b 1
)
echo        Done

:: ---------------------------------------------------------------
:: Step 5 - Boosting libraries (optional, non-fatal)
:: ---------------------------------------------------------------
echo.
echo [5/7] Installing boosting libraries ^(optional^)...
uv pip install "xgboost>=2.0.0"  --quiet 2>nul && echo        [OK] XGBoost  || echo        [--] XGBoost unavailable
uv pip install "lightgbm>=4.0.0" --quiet 2>nul && echo        [OK] LightGBM || echo        [--] LightGBM unavailable
uv pip install "catboost>=1.2.0" --quiet 2>nul && echo        [OK] CatBoost || echo        [--] CatBoost unavailable

:: ---------------------------------------------------------------
:: Step 6 - Verify
:: ---------------------------------------------------------------
echo.
echo [6/7] Verifying...
python -c "import sklearn;  print('        sklearn  ' + sklearn.__version__)"  2>nul || echo        [WARN] sklearn missing
python -c "import xgboost;  print('        xgboost  ' + xgboost.__version__)"  2>nul || echo        [--]   xgboost not installed
python -c "import lightgbm; print('        lightgbm ' + lightgbm.__version__)" 2>nul || echo        [--]   lightgbm not installed
python -c "import catboost; print('        catboost ' + catboost.__version__)" 2>nul || echo        [--]   catboost not installed

:: ---------------------------------------------------------------
:: Step 7 - Launch
:: ---------------------------------------------------------------
echo.
echo [7/7] Starting DataForge...
echo.
echo  +=========================================================+
echo  ^|  Open in browser:  http://localhost:8000               ^|
echo  ^|  API docs:         http://localhost:8000/docs          ^|
echo  ^|  Press Ctrl+C to stop                                  ^|
echo  +=========================================================+
echo.

cd /d "%BACKEND_DIR%"

:: Open browser after 2-second delay (gives server time to start)
set "FP=%FRONTEND_PATH%"
start "" cmd /c "timeout /t 2 /nobreak >nul & start """" ""%FP%"""

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

echo.
echo  Server stopped.
pause
exit /b 0
