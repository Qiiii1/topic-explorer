@echo off
title 有点想法 · 选题与灵感画布
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo 没有找到 Node.js。请先安装 Node.js 22 或更新版本：https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo.
echo 正在启动，请在浏览器打开：http://127.0.0.1:4178/
echo 关闭这个窗口或按 Ctrl+C 即可停止。
echo.

node server.mjs
pause
