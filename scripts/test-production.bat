@echo off
REM ============================================
REM Production Testing Script
REM ============================================

echo Production Redirect Testing
echo.

REM Check environment variables
if "%PRODUCTION_URL%"=="" (
    echo WARNING: PRODUCTION_URL not set. Using localhost:4000
    set PROD_URL=http://localhost:4000
) else (
    set PROD_URL=%PRODUCTION_URL%
)

if "%TEST_DOMAIN%"=="" (
    echo WARNING: TEST_DOMAIN not set. Using example.test
    set TEST_DOMAIN=example.test
)

echo Production URL: %PROD_URL%
echo Test Domain: %TEST_DOMAIN%
echo.

set PASS=0
set FAIL=0

echo [Test 1] Health check
echo ----------------------------------------------------------
curl -s -I "%PROD_URL%/health" | findstr "HTTP.*200"
if %errorlevel%==0 (
    echo   PASS: Health check OK
    set /a PASS+=1
) else (
    echo   FAIL: Health check failed
    set /a FAIL+=1
)
echo.

echo [Test 2] Root path redirect
echo ----------------------------------------------------------
curl -s -I -H "Host: %TEST_DOMAIN%" "%PROD_URL%/github" | findstr "HTTP.*302"
if %errorlevel%==0 (
    echo   PASS: 302 redirect
    set /a PASS+=1
) else (
    echo   FAIL: Expected 302
    set /a FAIL+=1
)
echo.

echo [Test 3] Subdomain redirect
echo ----------------------------------------------------------
curl -s -I -H "Host: blog.%TEST_DOMAIN%" "%PROD_URL%/" | findstr "HTTP.*302"
if %errorlevel%==0 (
    echo   PASS: 302 redirect
    set /a PASS+=1
) else (
    echo   FAIL: Expected 302
    set /a FAIL+=1
)
echo.

echo [Test 4] Nonexistent route - should 404
echo ----------------------------------------------------------
curl -s -I -H "Host: %TEST_DOMAIN%" "%PROD_URL%/nonexistent-path-12345" | findstr "HTTP.*404"
if %errorlevel%==0 (
    echo   PASS: 404 returned
    set /a PASS+=1
) else (
    echo   FAIL: Expected 404
    set /a FAIL+=1
)
echo.

echo [Test 5] Verify Location header present
echo ----------------------------------------------------------
curl -s -I -H "Host: %TEST_DOMAIN%" "%PROD_URL%/github" | findstr "Location:"
if %errorlevel%==0 (
    echo   PASS: Location header present
    set /a PASS+=1
) else (
    echo   FAIL: Location header missing
    set /a FAIL+=1
)
echo.

echo ============================================
echo RESULTS: %PASS% passed, %FAIL% failed
echo ============================================

if %FAIL% gtr 0 (
    exit /b 1
) else (
    echo Production tests completed!
    exit /b 0
)