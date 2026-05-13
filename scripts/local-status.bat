@echo off
REM ============================================
REM Check Local Environment Status
REM ============================================

echo ============================================
echo Redirect Platform - Local Status
echo ============================================
echo.

REM Check Docker
echo [Docker] Checking...
docker ps --format "table {{.Names}}\t{{.Status}}" | findstr "postgres redis" >nul 2>&1
if %errorlevel%==0 (
    echo   PostgreSQL: running
    docker ps --format "table {{.Names}}\t{{.Status}}" | findstr "redis" >nul 2>&1
    if %errorlevel%==0 echo   Redis:      running
) else (
    echo   ERROR: Docker services not running
)
echo.

REM Check Node services
echo [Services] Checking...
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo   Dashboard (3000): running
) else (
    echo   Dashboard (3000): NOT running
)

netstat -ano | findstr ":4000" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo   Redirect Engine (4000): running
) else (
    echo   Redirect Engine (4000): NOT running
)
echo.

REM URLs
echo [URLs]
echo   Dashboard:     http://localhost:3000
echo   Redirect Test: http://localhost:4000/__test?host=example.test&path=/github
echo   Health:       http://localhost:4000/health
echo.
echo ============================================

pause