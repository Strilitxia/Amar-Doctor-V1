@echo off
rem One-click installer for Amar Doctor V1 on Windows (double-click me).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-windows.ps1" %*
pause
