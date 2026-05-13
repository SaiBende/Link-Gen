@echo off
REM ============================================
REM Local Testing Startup Script for Windows
REM ============================================

echo Starting Redirect Platform - Local Testing
echo.

REM Check if Docker is running
echo [1/5] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running. Please start Docker Desktop.
    pause
    exit /b 1
)
echo Docker is running

REM Start infrastructure
echo.
echo [2/5] Starting PostgreSQL and Redis...
docker compose up -d
if errorlevel 1 (
    echo ERROR: Failed to start Docker services
    pause
    exit /b 1
)
echo Waiting for services to be ready...
timeout /t 5 /nobreak >nul

REM Run migrations
echo.
echo [3/5] Running database migrations...
call npm run prisma:migrate
if errorlevel 1 (
    echo ERROR: Migration failed
    pause
    exit /b 1
)

REM Seed database
echo.
echo [4/5] Seeding database...
call npm run db:seed
if errorlevel 1 (
    echo ERROR: Seeding failed
    pause
    exit /b 1
)

echo.
echo [5/5] Starting services...
echo.
echo ============================================
echo Services are starting...
echo.
echo Next.js Dashboard:    http://localhost:3000
echo Redirect Engine:      http://localhost:4000
echo.
echo To stop: press Ctrl+C or run scripts\local-stop.bat
echo ============================================
echo.
echo Starting Next.js in background...
start /b npm run dev

timeout /t 3 /nobreak >nul

echo Starting Redirect Engine in background...
start /b npm run dev:redirect

echo.
echo Both services are now running!
echo.
pause