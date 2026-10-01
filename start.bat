@echo off
cd /d "%~dp0"

if not exist ".env" (
  echo No .env file found. Copy .env.example to .env and paste your Anthropic API key into it first.
  pause
  exit /b 1
)

call .venv\Scripts\activate.bat
start "Interiors Buddy server" cmd /k uvicorn app.main:app --port 8000
timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:8000
