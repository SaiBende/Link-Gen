@echo off
REM ============================================
REM Test Redirects Locally
REM ============================================

echo Testing Redirects - Local Environment
echo.

set PASS=0
set FAIL=0

echo [Test 1] Root path redirect - example.test/github
echo ----------------------------------------------------------
curl -s -I -H "Host: example.test" http://localhost:4000/github | findstr "HTTP"
if %errorlevel%==0 (
    echo   PASS: Response received
    set /a PASS+=1
) else (
    echo   FAIL: No response
    set /a FAIL+=1
)
echo.

echo [Test 2] Check HTML response contains countdown
echo ----------------------------------------------------------
curl -s -H "Host: example.test" http://localhost:4000/github | findstr "countdown"
if %errorlevel%==0 (
    echo   PASS: Countdown page rendered
    set /a PASS+=1
) else (
    echo   FAIL: Expected countdown page
    set /a FAIL+=1
)
echo.

echo [Test 3] Check redirect destination in header
echo ----------------------------------------------------------
curl -s -I -H "Host: example.test" http://localhost:4000/github | findstr "X-Redirect-Destination"
if %errorlevel%==0 (
    echo   PASS: X-Redirect-Destination header present
    set /a PASS+=1
) else (
    echo   FAIL: Header missing
    set /a FAIL+=1
)
echo.

echo [Test 4] Non-existent domain - notfound.test/anything
echo ----------------------------------------------------------
curl -s -I -H "Host: notfound.test" http://localhost:4000/anything | findstr "HTTP.*404"
if %errorlevel%==0 (
    echo   PASS: 404 Not Found
    set /a PASS+=1
) else (
    echo   FAIL: Expected 404
    set /a FAIL+=1
)
echo.

echo [Test 5] Health check - redirect engine
echo ----------------------------------------------------------
curl -s http://localhost:4000/health | findstr "ok"
if %errorlevel%==0 (
    echo   PASS: Health check OK
    set /a PASS+=1
) else (
    echo   FAIL: Health check failed
    set /a FAIL+=1
)
echo.

echo [Test 6] Dashboard API - domains list
echo ----------------------------------------------------------
curl -s http://localhost:3000/api/domains | findstr "domains"
if %errorlevel%==0 (
    echo   PASS: Dashboard API responding
    set /a PASS+=1
) else (
    echo   FAIL: Dashboard API failed
    set /a FAIL+=1
)
echo.

echo [Test 7] Cancel button works
echo ----------------------------------------------------------
curl -s -H "Host: example.test" http://localhost:4000/github | findstr "cancelRedirect"
if %errorlevel%==0 (
    echo   PASS: Cancel button present
    set /a PASS+=1
) else (
    echo   FAIL: Cancel button missing
    set /a FAIL+=1
)
echo.

echo ============================================
echo RESULTS: %PASS% passed, %FAIL% failed
echo ============================================

if %FAIL% gtr 0 (
    echo WARNING: Some tests failed!
    exit /b 1
) else (
    echo All tests passed!
    exit /b 0
)