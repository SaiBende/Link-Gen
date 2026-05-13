@echo off
REM ============================================
REM Stop Local Services
REM ============================================

echo Stopping Redirect Platform services...
echo.

echo Stopping Node.js processes...
taskkill /F /IM node.exe >nul 2>&1

echo Stopping Docker services...
docker compose down

echo.
echo All services stopped.
pause