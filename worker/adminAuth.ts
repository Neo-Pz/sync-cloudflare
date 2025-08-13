import { IRequest } from 'itty-router'
import { getConfig, isAdminEmail, isValidAdminToken } from './config'

export interface AdminAuthRequest extends IRequest {
  adminUser?: {
    id: string
    email: string
    role: string
  }
}

export interface AuthContext {
  config: ReturnType<typeof getConfig>
}

// 从请求头中提取用户信息
function extractUserFromRequest(request: IRequest, config: ReturnType<typeof getConfig>): { id: string, email: string, role: string } | null {
  try {
    // 1. 支持管理员令牌认证 (开发环境快速访问)
    const adminToken = request.headers.get('X-Admin-Token')
    if (adminToken && isValidAdminToken(adminToken, config)) {
      return {
        id: 'admin-token',
        email: config.adminEmails[0], // 使用第一个管理员邮箱
        role: 'admin'
      }
    }
    
    // 2. Session token 验证 (登录后的会话)
    const sessionToken = request.headers.get('X-Session-Token')
    if (sessionToken) {
      // 验证会话token（这里简化处理，实际应该验证token有效性）
      if (sessionToken.startsWith('admin-')) {
        return {
          id: 'admin-session',
          email: config.adminEmails[0],
          role: 'admin'
        }
      }
    }
    
    // 3. JWT token 验证 (Clerk或其他认证系统)
    const authHeader = request.headers.get('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      // 简单检查admin123 token
      if (token === 'admin123') {
        return {
          id: 'admin',
          email: config.adminEmails[0] || 'admin@iflowone.com',
          role: 'admin'
        }
      }
      // 这里可以添加其他JWT验证逻辑
    }
    
    // 4. 检查用户信息头 (来自Clerk等认证系统)
    const userEmail = request.headers.get('X-User-Email')
    const userId = request.headers.get('X-User-ID')
    
    if (userEmail && userId) {
      return {
        id: userId,
        email: userEmail,
        role: isAdminEmail(userEmail, config) ? 'admin' : 'user'
      }
    }
    
    // 5. 开发环境：检查URL参数中的管理员标识
    if (config.isDevelopment) {
      const url = new URL(request.url)
      const devAdmin = url.searchParams.get('dev-admin')
      if (devAdmin === 'true') {
        return {
          id: 'dev-admin',
          email: config.adminEmails[0],
          role: 'admin'
        }
      }
    }

    return null
  } catch (error) {
    if (config.enableDetailedLogging) {
      console.error('Failed to extract user from request:', error)
    }
    return null
  }
}

// 管理员权限验证中间件
export function requireAdmin(request: AdminAuthRequest, env?: any): Response | null {
  const config = getConfig(env)
  const user = extractUserFromRequest(request, config)
  
  if (!user) {
    return new Response(JSON.stringify({ 
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    }), { 
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  if (user.role !== 'admin') {
    return new Response(JSON.stringify({ 
      error: 'Admin access required',
      code: 'ADMIN_REQUIRED'
    }), { 
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  // 将用户信息附加到请求对象
  request.adminUser = user
  return null // 验证通过，返回null继续处理
}

// 创建认证中间件工厂
export function createAuthMiddleware(env?: any) {
  const config = getConfig(env)
  
  return {
    requireAdmin: (request: AdminAuthRequest) => requireAdmin(request, env),
    extractUser: (request: IRequest) => extractUserFromRequest(request, config),
    config
  }
}

// 日志记录辅助函数
export async function logAdminAction(
  db: D1Database,
  adminId: string,
  action: string,
  details: string
) {
  // 记录到控制台
  console.log(`[ADMIN] ${adminId} performed ${action} - ${details}`)
  
  try {
    // 可以选择记录到数据库
    // await db.prepare('INSERT INTO admin_logs (admin_id, action, details, timestamp) VALUES (?, ?, ?, ?)').bind(adminId, action, details, Date.now()).run()
  } catch (error) {
    console.error('Failed to log admin action:', error)
  }
  
  return {
    id: Date.now().toString(),
    adminId,
    action,
    details,
    timestamp: Date.now()
  }
}