Write-Host ""
Write-Host "🎨 ==========================================" -ForegroundColor Cyan
Write-Host "   TLDraw 本地开发环境启动中..." -ForegroundColor Cyan  
Write-Host "🎨 ==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "🌐 客户端服务器: http://localhost:5174" -ForegroundColor Green
Write-Host "⚡ Worker API服务: http://localhost:8787" -ForegroundColor Yellow
Write-Host "🗄️ 本地D1数据库: 已配置" -ForegroundColor Blue
Write-Host "👤 管理员后台: http://localhost:8787/admin" -ForegroundColor Magenta
Write-Host ""
Write-Host "📝 管理员邮箱: 1903399675@qq.com" -ForegroundColor White
Write-Host ""
Write-Host "🚀 启动并发服务..." -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 启动客户端服务
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev:client" -WindowStyle Normal

# 等待1秒
Start-Sleep -Seconds 1

# 启动Worker服务  
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run dev:worker" -WindowStyle Normal

Write-Host "✅ 两个服务已在新窗口中启动" -ForegroundColor Green
Write-Host "📱 客户端: http://localhost:5174" -ForegroundColor Green
Write-Host "🔧 Worker API: http://localhost:8787" -ForegroundColor Yellow
Write-Host ""
Write-Host "💡 提示: 关闭此窗口不会停止服务" -ForegroundColor Blue
Write-Host "💡 要停止服务，请关闭对应的服务窗口" -ForegroundColor Blue
Write-Host ""
Read-Host "按回车键退出"