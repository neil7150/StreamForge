@echo off
title StreamForge - Undo Wi-Fi development exception
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0configure-dev-firewall.ps1" -Undo
