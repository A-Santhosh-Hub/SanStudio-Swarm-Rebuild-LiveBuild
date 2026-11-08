@echo off
setlocal
cd /d "%~dp0"
title SanStudio LiveBuild

rem Prefer the Python launcher, then plain python. Each must really run and have tkinter.
py -3 -c "import tkinter" >nul 2>&1
if not errorlevel 1 (
    start "" pyw -3 app.py %*
    exit /b 0
)
python -c "import tkinter" >nul 2>&1
if not errorlevel 1 (
    start "" pythonw app.py %*
    exit /b 0
)

echo.
echo  SanStudio LiveBuild needs Python 3.
echo.
echo  Opening the download page. During setup, tick "Add python.exe to PATH",
echo  and keep "tcl/tk and IDLE" selected. Then run START.bat again.
echo.
start "" https://www.python.org/downloads/
pause
exit /b 1
