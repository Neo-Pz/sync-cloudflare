// 环境配置管理
export interface Config {
  // 管理员配置
  adminEmails: string[]
  adminToken: string
  
  // CORS配置
  allowedOrigins: string[]
  isDevelopment: boolean
  
  // 安全配置
  enableDetailedLogging: boolean
  requireStrictAuth: boolean
}

// 根据环境获取配置
export function getConfig(env?: any): Config {
  // 检测是否为生产环境
  const isDevelopment = !env?.CF_PAGES || env?.CF_PAGES_BRANCH !== 'main'
  
  return {
    // 管理员邮箱配置
    adminEmails: isDevelopment 
      ? [
          '010.carpe.diem@gmail.com',
          '1903399675@qq.com',
          'admin@example.com', 
          'administrator@tldraw.com'
        ]
      : [
          '010.carpe.diem@gmail.com',
          '1903399675@qq.com'
        ],
    
    // 管理员快速访问令牌
    adminToken: isDevelopment 
      ? 'admin123' 
      : (env?.ADMIN_SECRET_KEY || 'CHANGE_THIS_IN_PRODUCTION'),
    
    // CORS允许的源
    allowedOrigins: isDevelopment
      ? ['http://localhost:*', 'http://127.0.0.1:*'] // 开发环境允许所有localhost
      : [
          'https://www.iflowone.com',
          'https://iflowone.com',
          'https://admin.iflowone.com'
        ],
    
    isDevelopment,
    
    // 安全配置
    enableDetailedLogging: isDevelopment,
    requireStrictAuth: !isDevelopment
  }
}

// 检查邮箱是否为管理员
export function isAdminEmail(email: string, config: Config): boolean {
  return config.adminEmails.includes(email) || 
         (config.isDevelopment && email.includes('admin'))
}

// 验证管理员令牌
export function isValidAdminToken(token: string, config: Config): boolean {
  return token === config.adminToken
}

// 检查源是否被允许
export function isOriginAllowed(origin: string | null, config: Config): boolean {
  if (!origin) return false
  
  if (config.isDevelopment) {
    // 开发环境：允许任何localhost或127.0.0.1端口
    return origin.startsWith('http://localhost:') || 
           origin.startsWith('http://127.0.0.1:')
  }
  
  // 生产环境：检查允许列表
  return config.allowedOrigins.includes(origin)
}