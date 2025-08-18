# tldraw 管理后台

这是一个独立的管理后台系统，用于管理 tldraw 共享白板的用户、房间和系统统计。

## 功能特性

- 📊 系统概览和统计信息
- 👥 用户管理（查看用户信息、角色、状态）
- 🏠 房间管理（查看、删除房间，管理发布状态）
- 📝 操作日志（管理员操作记录）
- 🔒 基于 Clerk 的身份验证
- 📱 响应式设计，支持移动端

## 技术栈

- **框架**: Next.js 14
- **样式**: Tailwind CSS
- **身份验证**: Clerk
- **UI组件**: Headless UI
- **图标**: Heroicons
- **HTTP客户端**: Axios
- **日期处理**: date-fns

## 部署到 Vercel

### 1. 克隆代码并安装依赖

```bash
cd admin-dashboard
npm install
```

### 2. 配置环境变量

复制 `.env.local.example` 到 `.env.local` 并填入你的配置：

```bash
cp .env.local.example .env.local
```

填入以下配置：
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk 公钥
- `CLERK_SECRET_KEY`: Clerk 密钥
- `NEXT_PUBLIC_TLDRAW_API_URL`: tldraw API 地址 (https://iflowone.com)

### 3. 部署到 Vercel

#### 方法一：使用 Vercel CLI

```bash
npm install -g vercel
vercel --prod
```

#### 方法二：连接 GitHub 仓库

1. 将代码推送到 GitHub
2. 在 Vercel 控制台中连接你的 GitHub 仓库
3. 设置环境变量
4. 部署

### 4. 配置 Vercel 环境变量

在 Vercel 控制台中设置以下环境变量：

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_TLDRAW_API_URL`

## 本地开发

```bash
npm run dev
```

应用将在 http://localhost:3000 启动。

## 权限配置

管理员权限通过以下方式验证：
- Clerk 用户元数据中的 `role` 字段为 `admin`
- 邮箱包含 `admin` 关键词
- 邮箱在管理员白名单中

当前管理员邮箱白名单：
- 010.carpe.diem@gmail.com
- admin@example.com
- administrator@tldraw.com

## API 接口

管理后台通过以下 API 与 tldraw 系统交互：

- `GET /api/admin/stats` - 获取系统统计信息
- `GET /api/admin/users` - 获取用户列表
- `GET /api/admin/logs` - 获取操作日志
- `GET /api/rooms` - 获取房间列表
- `DELETE /api/rooms/:id` - 删除房间
- `PATCH /api/rooms/:id` - 更新房间状态

## 安全考虑

1. 所有管理员操作都需要身份验证
2. API 请求包含用户身份信息
3. 危险操作需要二次确认
4. 定期检查用户权限状态
5. 操作日志记录所有管理员行为

## 主要组件

- `pages/index.tsx` - 主页面，包含登录和权限验证
- `components/AdminDashboard.tsx` - 管理后台主组件
- `pages/_app.tsx` - App 配置，包含 Clerk 提供者

## 自定义配置

如需修改管理员权限验证逻辑，请编辑 `components/AdminDashboard.tsx` 中的 `isAdmin` 变量。

如需修改 API 地址，请更新 `NEXT_PUBLIC_TLDRAW_API_URL` 环境变量。