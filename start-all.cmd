@echo off
rem One-click launcher for Amar Doctor V1 (double-click me). Run setup-windows.cmd once first.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-all.ps1" %*
pause
