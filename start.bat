@echo off
setlocal EnableDelayedExpansion
title DataForge

cls
echo.
echo  +=========================================================+
echo  ^|          DataForge   --  AutoML Platform           ^|
echo  ^|   Regression ^& Classification  ^|  XGBoost  ^|  EDA      ^|
echo  +=========================================================+
echo.

set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%backend"
set "VENV_DIR=%SCRIPT_DIR%.venv"
set "FRONTEND_PATH=%SCRIPT_DIR%frontend\index.html"

:: ---------------------------------------------------------------
:: Step 1 - Check for uv
:: ---------------------------------------------------------------
echo [1/8] Checking for uv package manager...
set "USE_UV=0"
uv --version >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%v in ('uv --version 2^>^&1') do echo        Found: %%v
    set "USE_UV=1"
    goto :step2
)
echo        Not found. Using pip instead.
echo        TIP: Install uv for 10x faster setup:
echo        powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

:: ---------------------------------------------------------------
:: Step 2 - Python
:: ---------------------------------------------------------------
:step2
echo.
echo [2/8] Locating Python...
if "!USE_UV!"=="1" (
    uv python install 3.11 >nul 2>&1
    if not errorlevel 1 ( echo        Python 3.11 ready via uv & goto :step3 )
    echo        uv python install failed, trying system Python
    set "USE_UV=0"
)

set "PYTHON_CMD="
for %%c in (python3.11 python3.10 python3.9 python3.8 python3 python) do (
    if "!PYTHON_CMD!"=="" (
        %%c --version >nul 2>&1
        if not errorlevel 1 (
            for /f "tokens=2" %%v in ('%%c --version 2^>^&1') do (
                for /f "tokens=1,2 delims=." %%a in ("%%v") do (
                    if %%a GEQ 3 if %%b GEQ 8 ( set "PYTHON_CMD=%%c" & set "PY_VER=%%v" )
                )
            )
        )
    )
)
if "!PYTHON_CMD!"=="" (
    echo.
    echo  [ERROR] Python 3.8+ not found.
    echo          Install uv: powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
    echo          OR Python:  https://www.python.org/downloads/release/python-3119/
    pause & exit /b 1
)
echo        Found Python !PY_VER! via !PYTHON_CMD!

:: ---------------------------------------------------------------
:: Step 3 - Virtual environment
:: ---------------------------------------------------------------
:step3
echo.
echo [3/8] Setting up virtual environment...
if "!USE_UV!"=="1" (
    if not exist "%VENV_DIR%\Scripts\activate.bat" (
        uv venv "%VENV_DIR%" --python 3.11 >nul 2>&1
        if errorlevel 1 ( uv venv "%VENV_DIR%" >nul 2>&1 )
        echo        Created .venv with uv
    ) else ( echo        .venv already exists )
) else (
    if not exist "%VENV_DIR%\Scripts\activate.bat" (
        !PYTHON_CMD! -m venv "%VENV_DIR%"
        if errorlevel 1 ( echo  [ERROR] venv failed & pause & exit /b 1 )
        echo        Created .venv
    ) else ( echo        .venv already exists )
)
call "%VENV_DIR%\Scripts\activate.bat"
if errorlevel 1 ( echo  [ERROR] Cannot activate venv & pause & exit /b 1 )
echo        Activated

:: ---------------------------------------------------------------
:: Step 4 - Upgrade pip
:: ---------------------------------------------------------------
echo.
echo [4/8] Upgrading pip...
if "!USE_UV!"=="1" ( uv pip install --upgrade pip >nul 2>&1 ) else ( python -m pip install --upgrade pip --quiet 2>nul )
echo        Done

:: ---------------------------------------------------------------
:: Step 5 - Core packages
:: ---------------------------------------------------------------
echo.
echo [5/8] Installing core packages...
echo        fastapi  uvicorn  scikit-learn  pandas  numpy  scipy  joblib
if "!USE_UV!"=="1" (
    uv pip install "fastapi>=0.100.0" "uvicorn[standard]>=0.20.0" "scikit-learn>=1.1.0" "pandas>=1.5.0" "numpy>=1.23.0" "scipy>=1.9.0" "joblib>=1.2.0" "python-multipart>=0.0.6" --quiet
) else (
    python -m pip install "fastapi>=0.100.0" "uvicorn[standard]>=0.20.0" "scikit-learn>=1.1.0" "pandas>=1.5.0" "numpy>=1.23.0" "scipy>=1.9.0" "joblib>=1.2.0" "python-multipart>=0.0.6" --quiet
)
if errorlevel 1 ( echo  [ERROR] Core install failed & pause & exit /b 1 )
echo        Installed

:: ---------------------------------------------------------------
:: Step 6 - Boosting libraries (optional, non-fatal)
:: ---------------------------------------------------------------
echo.
echo [6/8] Installing boosting libraries (optional)...
if "!USE_UV!"=="1" (
    uv pip install "xgboost>=1.7.0"  --quiet 2>nul && echo        [OK] XGBoost  || echo        [--] XGBoost skipped
    uv pip install "lightgbm>=3.3.0" --quiet 2>nul && echo        [OK] LightGBM || echo        [--] LightGBM skipped
    uv pip install "catboost>=1.1.0" --quiet 2>nul && echo        [OK] CatBoost || echo        [--] CatBoost skipped
) else (
    python -m pip install "xgboost>=1.7.0"  --quiet 2>nul && echo        [OK] XGBoost  || echo        [--] XGBoost skipped
    python -m pip install "lightgbm>=3.3.0" --quiet 2>nul && echo        [OK] LightGBM || echo        [--] LightGBM skipped
    python -m pip install "catboost>=1.1.0" --quiet 2>nul && echo        [OK] CatBoost || echo        [--] CatBoost skipped
)

:: ---------------------------------------------------------------
:: Step 7 - Verify
:: ---------------------------------------------------------------
echo.
echo [7/8] Verifying installation...
python -c "import sklearn; print('        sklearn  ' + sklearn.__version__)" 2>nul || echo        [WARN] sklearn missing
python -c "import xgboost; print('        xgboost  ' + xgboost.__version__)" 2>nul || echo        [--] xgboost not available
python -c "import lightgbm; print('        lightgbm ' + lightgbm.__version__)" 2>nul || echo        [--] lightgbm not available
python -c "import catboost; print('        catboost ' + catboost.__version__)" 2>nul || echo        [--] catboost not available

:: ---------------------------------------------------------------
:: Step 8 - Launch
:: ---------------------------------------------------------------
echo.
echo [8/8] Starting DataForge...
echo.
echo  +=========================================================+
echo  ^|  API    :  http://localhost:8000                       ^|
echo  ^|  Docs   :  http://localhost:8000/docs                  ^|
echo  ^|  Ctrl+C to stop                                        ^|
echo  +=========================================================+
echo.

cd /d "%BACKEND_DIR%"

set "FP=%FRONTEND_PATH%"
start "" cmd /c "timeout /t 2 /nobreak >nul & start """" ""%FP%"""

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

echo. & echo  Server stopped. & pause
exit /b 0
