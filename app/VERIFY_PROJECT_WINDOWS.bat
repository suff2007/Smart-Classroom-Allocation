@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set BACKEND_OK=0
set FRONTEND_OK=0

echo ==================================================
echo Smart Classroom - Dependency, Test and Build Check
echo ==================================================
echo This script installs platform-correct dependencies, runs backend tests, and builds the frontend.
echo It requires an internet connection for npm install.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed. Install Node.js LTS and rerun this script.
  pause
  exit /b 1
)
node -v
npm -v

echo.
echo [1/4] Installing backend dependencies...
cd backend
call npm ci --no-audit --no-fund
if errorlevel 1 (
  echo FAIL: backend npm ci
) else (
  echo PASS: backend dependencies installed
  echo.
  echo [2/4] Running backend tests...
  call npm test
  if errorlevel 1 (echo FAIL: backend tests) else (set BACKEND_OK=1 & echo PASS: backend tests)
)
cd ..

echo.
echo [3/4] Installing frontend dependencies...
cd frontend
call npm ci --no-audit --no-fund
if errorlevel 1 (
  echo FAIL: frontend npm ci
) else (
  echo PASS: frontend dependencies installed
  echo.
  echo [4/4] Building frontend for production...
  call npm run build
  if errorlevel 1 (
    echo FAIL: frontend production build
  ) else if not exist dist\index.html (
    echo FAIL: frontend build did not create dist\index.html
  ) else (
    set FRONTEND_OK=1
    echo PASS: frontend production build
  )
)
cd ..

echo.
echo ================= RESULTS =================
if "%BACKEND_OK%"=="1" (echo Backend tests: PASS) else (echo Backend tests: FAIL or not run)
if "%FRONTEND_OK%"=="1" (echo Frontend build: PASS) else (echo Frontend build: FAIL or not run)
if not "%BACKEND_OK%%FRONTEND_OK%"=="11" (
  echo See the first error above. Do not use the project as fully verified until both pass.
  pause
  exit /b 1
)
echo Build and automated checks passed. Live MongoDB/login/browser workflow still needs to be checked with your configured database.
pause
exit /b 0
