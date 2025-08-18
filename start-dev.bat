@echo off
echo.
echo 🎨 ==========================================
echo    TLDraw 本地开发环境启动中...
echo 🎨 ==========================================
echo.
echo 🌐 客户端服务器: http://localhost:5174
echo ⚡ Worker API服务: http://localhost:8787
echo 🗄️ 本地D1数据库: 已配置
echo 👤 管理员后台: http://localhost:8787/admin
echo.
echo 📝 管理员邮箱: 1903399675@qq.com
echo.
echo 🚀 启动并发服务...
echo ==========================================
echo.

REM 启动客户端服务（在新窗口中）
start "TLDraw Client" cmd /k "npm run dev:client"

REM 等待1秒
timeout /t 1 /nobreak >nul

REM 启动Worker服务（在新窗口中）
start "TLDraw Worker" cmd /k "npm run dev:worker"

echo ✅ 两个服务已在新窗口中启动
echo 📱 客户端: http://localhost:5174
echo 🔧 Worker API: http://localhost:8787
echo.
echo 💡 提示: 关闭此窗口不会停止服务
echo 💡 要停止服务，请关闭对应的服务窗口
echo.
pause