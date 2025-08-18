@echo off
echo 🚀 开始部署 tldraw 管理后台...

REM 检查是否安装了 Vercel CLI
where vercel >nul 2>nul
if %errorlevel% neq 0 (
    echo 📦 正在安装 Vercel CLI...
    npm install -g vercel
)

REM 检查是否存在 .env.local 文件
if not exist ".env.local" (
    echo ⚠️  请先创建 .env.local 文件并配置环境变量
    echo 📋 复制 .env.local.example 并填入配置:
    echo    copy .env.local.example .env.local
    echo    然后编辑 .env.local 文件
    pause
    exit /b 1
)

REM 安装依赖
echo 📦 正在安装依赖...
npm install

REM 构建项目
echo 🔨 正在构建项目...
npm run build

REM 部署到 Vercel
echo 🚀 正在部署到 Vercel...
vercel --prod

echo ✅ 部署完成!
echo 📱 请访问 Vercel 控制台查看部署状态
echo 🔗 记得在 Vercel 控制台中配置环境变量:
echo    - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
echo    - CLERK_SECRET_KEY
echo    - NEXT_PUBLIC_TLDRAW_API_URL
pause