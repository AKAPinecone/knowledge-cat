@echo off
setlocal
cd /d "%~dp0"
set "URL=http://127.0.0.1:8787/index.html"
echo.
echo ============================================================
echo   Knowledge Fed the Cat - local preview
echo   URL: %URL%
echo   Keep this window open while you play. Close to stop.
echo ============================================================
echo.
start "" "%URL%"
where python >nul 2>&1
if %ERRORLEVEL% == 0 (
  python -m http.server 8787
  goto :end
)
where py >nul 2>&1
if %ERRORLEVEL% == 0 (
  py -m http.server 8787
  goto :end
)
echo.
echo [error] Python was not found. Install from https://www.python.org/downloads/
echo         or just use the hosted link you already have.
echo.
pause
exit /b 1
:end
endlocal