#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')
const os = require('os')

console.log(`
🎨 ==========================================
   TLDraw 本地开发环境启动中...
🎨 ==========================================

🌐 客户端服务器: http://localhost:5174
⚡ Worker API服务: http://localhost:8787
🗄️ 本地D1数据库: 已配置
👤 管理员后台: http://localhost:8787/admin

📝 管理员邮箱: 1903399675@qq.com

🚀 启动并发服务...
==========================================
`)

const isWindows = os.platform() === 'win32'
const projectRoot = path.join(__dirname, '..')

// 启动函数
function startService(name, command, args, color) {
  const childProcess = spawn(command, args, {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    detached: false
  })

  // 输出带颜色前缀
  const colorCodes = {
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    reset: '\x1b[0m'
  }

  const prefix = `${colorCodes[color]}[${name}]${colorCodes.reset} `

  // 处理stdout，防止EPIPE错误
  if (childProcess.stdout) {
    childProcess.stdout.on('data', (data) => {
      try {
        data.toString().split('\n').forEach(line => {
          if (line.trim()) {
            process.stdout.write(prefix + line + '\n')
          }
        })
      } catch (err) {
        // 忽略EPIPE错误
        if (err.code !== 'EPIPE') {
          console.error('stdout error:', err)
        }
      }
    })
  }

  // 处理stderr，防止EPIPE错误
  if (childProcess.stderr) {
    childProcess.stderr.on('data', (data) => {
      try {
        data.toString().split('\n').forEach(line => {
          if (line.trim()) {
            process.stderr.write(prefix + line + '\n')
          }
        })
      } catch (err) {
        // 忽略EPIPE错误
        if (err.code !== 'EPIPE') {
          console.error('stderr error:', err)
        }
      }
    })
  }

  childProcess.on('close', (code) => {
    try {
      console.log(`${prefix}进程退出，代码: ${code}`)
    } catch (err) {
      // 忽略EPIPE错误
    }
  })

  childProcess.on('error', (err) => {
    if (err.code !== 'EPIPE') {
      console.error(`${prefix}进程错误:`, err)
    }
  })

  return childProcess
}

let clientProcess, workerProcess

// 处理进程退出
const cleanup = () => {
  console.log('\n🛑 正在停止所有服务...')
  try {
    if (clientProcess && !clientProcess.killed) {
      clientProcess.kill('SIGTERM')
    }
    if (workerProcess && !workerProcess.killed) {
      workerProcess.kill('SIGTERM')
    }
  } catch (err) {
    // 忽略清理错误
  }
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)
process.on('exit', cleanup)

// 启动客户端
console.log('🌐 启动客户端服务...')
clientProcess = startService('CLIENT', 'npm', ['run', 'dev:client'], 'cyan')

// 等待一点时间后启动Worker
setTimeout(() => {
  console.log('⚡ 启动Worker服务...')
  workerProcess = startService('WORKER', 'npm', ['run', 'dev:worker'], 'magenta')
}, 2000)

console.log(`
✅ 服务启动中...
📱 客户端即将在: http://localhost:5174
🔧 Worker API即将在: http://localhost:8787

💡 使用 Ctrl+C 停止所有服务
`)