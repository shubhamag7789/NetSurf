@echo off
cd /d "%~dp0"
title Netsurf FastAPI Backend Server
echo ======================================================================
echo Starting Netsurf FastAPI Backend with Gemini Agent Brain
echo ======================================================================
set "PY=python"
if exist "%~dp0.venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"
"%PY%" -c "import fastapi, uvicorn, jwt, google.genai, dotenv, httpx" >nul 2>&1
if errorlevel 1 (
    echo Installing missing dependencies...
    "%PY%" -m pip install -r requirements.txt
)
if not exist "%~dp0.env" echo [WARN] No .env file: set GEMINI_API_KEY in .env for full-quality planning.
if exist "%~dp0.venv\Scripts\python.exe" (
    "%~dp0.venv\Scripts\python.exe" -m uvicorn fastapi_backend.main:app --host 127.0.0.1 --port 8000 --reload
) else (
    python -m uvicorn fastapi_backend.main:app --host 127.0.0.1 --port 8000 --reload
)
pause
