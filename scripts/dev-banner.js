#!/usr/bin/env node

console.log(`
🎨 ==========================================
   TLDraw 本地开发环境启动中...
🎨 ==========================================

🌐 客户端服务器: http://localhost:5173
⚡ Worker API服务: http://localhost:8787
🗄️ 本地D1数据库: 已配置
👤 管理员后台: http://localhost:8787/admin

📝 管理员邮箱: 1903399675@qq.com

💡 启动选项:
   yarn dev        # 并发启动 (推荐)
   yarn dev:simple # 分别启动指导
   npm run dev:client # 仅启动客户端
   npm run dev:worker # 仅启动Worker

🚀 所有服务启动完成后即可开始开发!
==========================================
`)