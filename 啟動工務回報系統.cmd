@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "DONGREN_PYTHON=C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if exist "%DONGREN_PYTHON%" goto run
where py >nul 2>nul
if not errorlevel 1 set "DONGREN_PYTHON=py -3"& goto run
where python >nul 2>nul
if not errorlevel 1 set "DONGREN_PYTHON=python"& goto run

echo 找不到 Python，請先安裝 Python 3，或由 Codex 開啟本系統。
pause
exit /b 1

:run
echo.
echo 東仁安居工務回報系統啟動中...
echo 本機網址：http://127.0.0.1:8765
echo 同一網路的其他裝置請使用本機 IPv4 位址加上 :8765
echo 關閉此視窗會停止系統。
echo.
%DONGREN_PYTHON% server.py --host 0.0.0.0 --port 8765
echo.
echo 系統已停止。
pause
