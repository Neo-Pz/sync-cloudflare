// 后端权限验证中间件
// 验证token并控制API访问权限

export type PermissionLevel = 'viewer' | 'assist' | 'editor'

export interface TokenPayload {
  roomId: string
  permission: PermissionLevel
  userId?: string
  expires: number
  issued: number
}

export interface RequestContext {
  roomId: string
  permission: PermissionLevel
  userId?: string
  isOwner: boolean
  tokenPayload: TokenPayload
}

// 权限验证中间件
export class PermissionMiddleware {
  	private static readonly SECRET_KEY = 'iflowone-sync-secret-2024'

  // 验证token（复制前端逻辑，确保一致性）
  static verifyToken(token: string): TokenPayload | null {
    try {
      // Base64解码
      const decoded = JSON.parse(atob(token))
      const { payload: payloadStr, signature } = decoded
      
      // 验证签名
      if (signature !== this.generateSignature(payloadStr)) {
        console.error('Token signature verification failed')
        return null
      }
      
      const payload: TokenPayload = JSON.parse(payloadStr)
      
      // 验证过期时间
      if (Date.now() > payload.expires) {
        console.error('Token has expired')
        return null
      }
      
      return payload
    } catch (error) {
      console.error('Token verification failed:', error)
      return null
    }
  }

  // 生成签名（与前端保持一致）
  private static generateSignature(data: string): string {
    let hash = 0
    const combined = data + this.SECRET_KEY
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32bit整数
    }
    return hash.toString(36)
  }

  // 从请求中提取权限信息
  static async extractPermissionContext(
    request: Request, 
    roomId: string,
    roomOwnerId?: string
  ): Promise<RequestContext | null> {
    const url = new URL(request.url)
    const token = url.searchParams.get('token') || request.headers.get('Authorization')?.replace('Bearer ', '')
    
    if (!token) {
      // 没有token，检查是否为房主
      const userId = request.headers.get('X-User-Id')
      if (userId && roomOwnerId && userId === roomOwnerId) {
        return {
          roomId,
          permission: 'editor',
          userId,
          isOwner: true,
          tokenPayload: {
            roomId,
            permission: 'editor',
            userId,
            expires: Date.now() + 24 * 60 * 60 * 1000,
            issued: Date.now()
          }
        }
      }
      return null
    }

    const payload = this.verifyToken(token)
    if (!payload || payload.roomId !== roomId) {
      return null
    }

    const userId = payload.userId || request.headers.get('X-User-Id')
    const isOwner = userId && roomOwnerId && userId === roomOwnerId

    return {
      roomId,
      permission: payload.permission,
      userId,
      isOwner,
      tokenPayload: payload
    }
  }

  // 检查权限
  static hasPermission(
    context: RequestContext | null, 
    requiredPermission: PermissionLevel
  ): boolean {
    if (!context) return false

    const permissionWeights = {
      viewer: 1,
      assist: 2, 
      editor: 3
    }

    return permissionWeights[context.permission] >= permissionWeights[requiredPermission]
  }

  // 权限检查装饰器
  static requirePermission(requiredPermission: PermissionLevel) {
    return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      const originalMethod = descriptor.value

      descriptor.value = async function(request: Request, ...args: any[]) {
        const url = new URL(request.url)
        const roomId = url.pathname.split('/').pop() || args[0]?.roomId
        
        // 这里需要从数据库获取房主信息
        // const roomOwnerId = await getRoomOwnerId(roomId)
        
        const context = await PermissionMiddleware.extractPermissionContext(
          request, 
          roomId, 
          undefined // roomOwnerId 暂时为空，需要与实际数据库集成
        )

        if (!PermissionMiddleware.hasPermission(context, requiredPermission)) {
          return new Response(JSON.stringify({ 
            error: 'Insufficient permissions',
            required: requiredPermission,
            current: context?.permission || 'none'
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          })
        }

        return originalMethod.call(this, request, context, ...args)
      }

      return descriptor
    }
  }
}

// API响应包装器
export class PermissionResponse {
  // 基于权限过滤房间数据
  static filterRoomData(roomData: any, permission: PermissionLevel): any {
    const filtered = { ...roomData }

    switch (permission) {
      case 'viewer':
        // 浏览权限：只返回最新快照数据
        return {
          id: filtered.id,
          name: filtered.name,
          published: filtered.published,
          permission: 'viewer',
          snapshot: filtered.currentSnapshot || filtered.snapshot,
          lastPublished: filtered.lastPublished
        }
      
      case 'assist':
        // 辅作权限：返回受限制的编辑数据
        return {
          ...filtered,
          permission: 'assist',
          historyLocked: true, // 强制历史锁定
          allowNewContent: true
        }
      
      case 'editor':
        // 编辑权限：返回完整数据
        return filtered
      
      default:
        return null
    }
  }

  // 生成权限相关的响应头
  static getPermissionHeaders(context: RequestContext): Record<string, string> {
    return {
      'X-Permission-Level': context.permission,
      'X-Room-Access': context.isOwner ? 'owner' : 'guest',
      'X-Token-Expires': new Date(context.tokenPayload.expires).toISOString()
    }
  }

  // 创建权限感知的响应
  static createResponse(
    data: any, 
    context: RequestContext | null, 
    status: number = 200
  ): Response {
    if (!context) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const filteredData = this.filterRoomData(data, context.permission)
    const headers = {
      'Content-Type': 'application/json',
      ...this.getPermissionHeaders(context)
    }

    return new Response(JSON.stringify(filteredData), {
      status,
      headers
    })
  }
}

// WebSocket权限验证
export class WebSocketPermissionManager {
  private static connections = new Map<string, RequestContext>()

  // WebSocket连接权限验证
  static async authenticateWebSocket(
    request: Request,
    roomId: string,
    roomOwnerId?: string
  ): Promise<RequestContext | null> {
    const context = await PermissionMiddleware.extractPermissionContext(
      request,
      roomId,
      roomOwnerId
    )

    if (context) {
      const connectionId = `${roomId}-${context.userId || 'anonymous'}-${Date.now()}`
      this.connections.set(connectionId, context)
      return context
    }

    return null
  }

  // 检查WebSocket操作权限
  static canPerformAction(
    connectionId: string,
    action: 'view' | 'add' | 'edit' | 'delete'
  ): boolean {
    const context = this.connections.get(connectionId)
    if (!context) return false

    switch (action) {
      case 'view':
        return true // 所有权限都可以查看
      
      case 'add':
        return context.permission === 'assist' || context.permission === 'editor'
      
      case 'edit':
      case 'delete':
        return context.permission === 'editor'
      
      default:
        return false
    }
  }

  // 过滤WebSocket消息（基于权限）
  static filterWebSocketMessage(
    connectionId: string,
    message: any
  ): any | null {
    const context = this.connections.get(connectionId)
    if (!context) return null

    if (context.permission === 'viewer') {
      // 浏览权限：只允许接收，不允许发送编辑消息
      if (message.type === 'edit' || message.type === 'add' || message.type === 'delete') {
        return null
      }
    }

    if (context.permission === 'assist') {
      // 辅作权限：允许新增，但不允许编辑历史内容
      if (message.type === 'edit' && message.isHistoryContent) {
        return null
      }
    }

    return message
  }

  // 清理连接
  static cleanupConnection(connectionId: string) {
    this.connections.delete(connectionId)
  }
}

// 使用示例注释
/*
// 在Worker中使用权限中间件

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    
    // 房间数据获取API
    if (url.pathname.startsWith('/api/rooms/')) {
      const roomId = url.pathname.split('/')[3]
      const context = await PermissionMiddleware.extractPermissionContext(
        request, 
        roomId
      )
      
      if (!context) {
        return new Response('Unauthorized', { status: 401 })
      }
      
      const roomData = await getRoomData(roomId)
      return PermissionResponse.createResponse(roomData, context)
    }
    
    // 房间编辑API（需要编辑权限）
    if (url.pathname.startsWith('/api/rooms/') && request.method === 'PUT') {
      const roomId = url.pathname.split('/')[3]
      const context = await PermissionMiddleware.extractPermissionContext(
        request, 
        roomId
      )
      
      if (!PermissionMiddleware.hasPermission(context, 'editor')) {
        return new Response('Forbidden', { status: 403 })
      }
      
      // 处理编辑操作...
    }
  }
}
*/