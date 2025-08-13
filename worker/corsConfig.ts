// CORS配置管理
export interface CorsConfig {
  allowedOrigins: string[]
  allowedMethods: string[]
  allowedHeaders: string[]
  maxAge: number
}

// 生产环境允许的域名
const PRODUCTION_ORIGINS = [
  'https://tldraw-worker.010-carpe-diem.workers.dev',
  'https://iflowone.com',
  'https://www.iflowone.com'
]

// 开发环境允许的域名
const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174', 
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  'http://localhost:8787',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175', 
  'http://127.0.0.1:5176',
  'http://127.0.0.1:5177',
  'http://127.0.0.1:8787'
]

// 获取CORS配置
export function getCorsConfig(isDevelopment: boolean = false): CorsConfig {
  return {
    allowedOrigins: isDevelopment 
      ? [...PRODUCTION_ORIGINS, ...DEVELOPMENT_ORIGINS] 
      : PRODUCTION_ORIGINS,
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Email', 'X-User-ID', 'X-Admin-Token'],
    maxAge: 86400 // 24 hours
  }
}

// 检查origin是否被允许
export function isOriginAllowed(origin: string | null, config: CorsConfig): boolean {
  if (!origin) return false
  
  // 开发模式下，允许任何localhost端口
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
    return true
  }
  
  return config.allowedOrigins.includes(origin) || config.allowedOrigins.includes('*')
}

// 获取安全的CORS头
export function getSecureCorsHeaders(origin: string | null, config: CorsConfig): Record<string, string> {
  const headers: Record<string, string> = {}
  
  console.log(`CORS Debug - Origin: ${origin}, Allowed: ${isOriginAllowed(origin, config)}`)
  
  if (isOriginAllowed(origin, config)) {
    headers['Access-Control-Allow-Origin'] = origin!
    console.log(`CORS Debug - Setting Access-Control-Allow-Origin to: ${origin}`)
  }
  
  headers['Access-Control-Allow-Methods'] = config.allowedMethods.join(', ')
  headers['Access-Control-Allow-Headers'] = config.allowedHeaders.join(', ')
  headers['Access-Control-Max-Age'] = config.maxAge.toString()
  headers['Vary'] = 'Origin'
  
  return headers
}

// 创建CORS响应
export function createCorsResponse(
  data: any, 
  status: number = 200, 
  origin: string | null = null,
  isDevelopment: boolean = false
): Response {
  const config = getCorsConfig(isDevelopment)
  const corsHeaders = getSecureCorsHeaders(origin, config)
  
  // 在开发模式下，强制允许localhost
  if (isDevelopment && origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
    corsHeaders['Access-Control-Allow-Origin'] = origin
    console.log(`CORS Debug - Development mode: Setting origin to ${origin}`)
  }
  
  const response = Response.json(data, { status })
  
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  
  return response
}

// 创建OPTIONS预检响应
export function createOptionsResponse(
  origin: string | null = null,
  isDevelopment: boolean = false
): Response {
  const config = getCorsConfig(isDevelopment)
  const corsHeaders = getSecureCorsHeaders(origin, config)
  
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  })
}