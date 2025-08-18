#!/usr/bin/env node

console.log(`
🔄 ==========================================
   本地-生产环境同步检查
🔄 ==========================================

📋 开发流程提醒:

1. 🚀 开发阶段
   yarn dev                    # 启动本地开发环境
   
2. ✅ 测试验证  
   http://localhost:5173       # 前端功能测试
   http://localhost:8787/admin # 管理功能测试
   
3. 🌐 部署生产
   yarn sync:prod              # 同步到生产环境
   
4. 🎯 验证一致性
   yarn verify:prod            # 验证生产环境

⚠️  重要提醒:
   本地开发什么样，生产就必须什么样！
   每次功能更改都要立即同步部署！

==========================================
`)

// 检查是否有未提交的更改
const { execSync } = require('child_process')
const path = require('path')

try {
  // 检查Git状态 - 使用Windows兼容的方式
  const gitStatus = execSync('git status --porcelain', { 
    encoding: 'utf8', 
    cwd: __dirname + '/..',
    shell: true  // 在Windows上使用系统shell
  })
  
  if (gitStatus.trim()) {
    console.log('⚠️  检测到未提交的更改:')
    console.log(gitStatus)
    console.log('\n建议先提交更改:')
    console.log('git add . && git commit -m "feat: 功能更新"')
    console.log('\n然后部署到生产环境:')
    console.log('yarn sync:prod')
  } else {
    console.log('✅ Git状态干净，可以开始开发或部署')
  }
} catch (error) {
  console.log('ℹ️  Git状态检查跳过，继续启动开发环境')
}

console.log('\n🎨 准备开始开发新功能！')