@echo off
chcp 65001 >nul

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo 正在設定東仁安居工務回報系統的區域網路連線...
netsh advfirewall firewall delete rule name="東仁安居工務回報系統" >nul 2>&1
netsh advfirewall firewall add rule name="東仁安居工務回報系統" dir=in action=allow protocol=TCP localport=8765 remoteip=localsubnet profile=private,public

if errorlevel 1 (
  echo.
  echo 設定失敗，請確認已在管理員提示中按下「是」。
) else (
  echo.
  echo 設定完成。同一個 Wi-Fi 的裝置可以連線至本系統。
)
echo.
pause
