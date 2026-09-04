@echo off
title WinkPass Enterprise Runner
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
pause
