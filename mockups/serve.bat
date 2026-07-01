@echo off
echo.
echo   Swimchain Client Mockups
echo   ======================================
echo.
echo   Starting server on http://localhost:8080
echo.
echo   Available mockups:
echo     - Index:        http://localhost:8080/
echo     - Forum Client: http://localhost:8080/forum-client/
echo     - Reddit Client: http://localhost:8080/reddit-client/
echo.
echo   Press Ctrl+C to stop
echo.

cd /d "%~dp0"
python -m http.server 8080
