@echo off
title StreamForge - Allow local Wi-Fi development
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0configure-dev-firewall.ps1"
