// Token权限管理工具
// 统一链接权限控制系统的核心组件

export type PermissionLevel = 'viewer' | 'assist' | 'editor'

export interface TokenPayload {
  roomId: string
  permission: PermissionLevel
  userId?: string
  issued: number
  shareId: string       // 所有分享都有shareId
  pageId?: string       // 页面ID
}

export interface ShareTokenOptions {
  roomId: string
  permission: PermissionLevel
  userId?: string
  shareId: string   // 必需：分享ID
  pageId?: string   // 页面ID
}

export interface ShareConfig {
  shareId: string
  roomId: string
  pageId?: string
  permission: PermissionLevel
  isActive: boolean
  createdBy: string
  createdAt: number
  description?: string
}

// 简单的Base64编码/解码（用于演示，生产环境建议使用更安全的JWT库）
class SimpleTokenManager {
  	private static readonly SECRET_KEY = 'iflowone-sync-secret-2024'
  
  // 生成权限token（所有分享都是永久的）
  static generateToken(options: ShareTokenOptions): string {
    const compactPayload: any = {
      r: options.roomId,           // room
      p: options.permission[0],    // permission: v/a/e
      i: Math.floor(Date.now() / 1000), // issued (秒级时间戳)
      s: options.shareId           // share ID (必需)
    }

    if (options.pageId) {
      compactPayload.pg = options.pageId
    }

    if (options.userId) {
      compactPayload.u = options.userId
    }
    
    const payloadStr = JSON.stringify(compactPayload)
    const signature = this.generateSignature(payloadStr)
    
    // 使用更紧凑的格式：payloadBase64.signature
    const payloadBase64 = btoa(payloadStr)
    return `${payloadBase64}.${signature}`
  }
  
  // 验证和解析token（所有分享都是永久的）
  static async verifyToken(token: string): Promise<TokenPayload | null> {
    try {
      const parts = token.split('.')
      if (parts.length !== 2) {
        console.error('Invalid token format')
        return null
      }
      
      const [payloadBase64, signature] = parts
      const payloadStr = atob(payloadBase64)
      
      // 验证签名
      if (signature !== this.generateSignature(payloadStr)) {
        console.error('Token signature verification failed')
        return null
      }
      
      const compactPayload = JSON.parse(payloadStr)
      
      // 所有token都必须有shareId
      if (!compactPayload.s) {
        console.error('Missing shareId in token')
        return null
      }
      
      // 验证分享配置状态
      const validation = await ShareConfigManager.validatePermanentShare(compactPayload.s)
      if (!validation.isValid) {
        console.error('Share validation failed:', validation.reason)
        return null
      }
      
      // 使用数据库中的权限配置（权限可能被房主远程修改）
      const dbPermission = validation.config!.permission
      
      // 转换回完整格式（使用数据库中的最新权限）
      const fullPayload: TokenPayload = {
        roomId: compactPayload.r,
        permission: dbPermission, // 使用数据库中的权限而不是token中的
        userId: compactPayload.u,
        issued: compactPayload.i * 1000,
        shareId: compactPayload.s,
        pageId: compactPayload.pg || validation.config!.pageId
      }
      
      return fullPayload
    } catch (error) {
      console.error('Token verification failed:', error)
      return null
    }
  }
  
  // 生成简单签名（生产环境建议使用HMAC-SHA256）
  private static generateSignature(data: string): string {
    // 简单hash函数，生产环境应该使用更安全的算法
    let hash = 0
    const combined = data + this.SECRET_KEY
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32bit整数
    }
    return hash.toString(36)
  }
  
  // 检查token是否有效（所有分享都是永久的，不会过期）
  static async isTokenValid(token: string): Promise<boolean> {
    const payload = await this.verifyToken(token)
    return !!payload
  }
  
  // 从token获取权限级别
  static async getPermissionFromToken(token: string): Promise<PermissionLevel | null> {
    const payload = await this.verifyToken(token)
    return payload?.permission || null
  }
  
  // 同步版本的token验证（仅用于基本格式检查，不验证分享状态）
  static verifyTokenSync(token: string): TokenPayload | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 2) {
        return null
      }
      
      const [payloadBase64, signature] = parts
      const payloadStr = atob(payloadBase64)
      
      // 验证签名
      if (signature !== this.generateSignature(payloadStr)) {
        return null
      }
      
      const compactPayload = JSON.parse(payloadStr)
      
      // 所有token都必须有shareId
      if (!compactPayload.s) {
        return null
      }
      
      // 转换回完整格式（注意：权限可能不准确，需要异步验证）
      const fullPayload: TokenPayload = {
        roomId: compactPayload.r,
        permission: compactPayload.p === 'v' ? 'viewer' : 
                   compactPayload.p === 'a' ? 'assist' : 'editor',
        userId: compactPayload.u,
        issued: compactPayload.i * 1000,
        shareId: compactPayload.s,
        pageId: compactPayload.pg
      }
      
      return fullPayload
    } catch (error) {
      return null
    }
  }
}

// 权限级别工具函数
export class PermissionUtils {
  // 权限级别权重（用于比较）
  static readonly PERMISSION_WEIGHTS = {
    viewer: 1,
    assist: 2,
    editor: 3
  }
  
  // 权限级别描述
  static readonly PERMISSION_DESCRIPTIONS = {
    viewer: '浏览 - 只能查看最新快照',
    assist: '辅作 - 可新增内容，不能修改历史',
    editor: '编辑 - 完全编辑权限，实时协作'
  }
  
  // 权限级别图标
  static readonly PERMISSION_ICONS = {
    viewer: '👁️',
    assist: '✏️',
    editor: '🖊️'
  }
  
  // 比较权限级别
  static comparePermissions(permission1: PermissionLevel, permission2: PermissionLevel): number {
    return this.PERMISSION_WEIGHTS[permission1] - this.PERMISSION_WEIGHTS[permission2]
  }
  
  // 检查是否有足够权限
  static hasPermission(userPermission: PermissionLevel, requiredPermission: PermissionLevel): boolean {
    return this.PERMISSION_WEIGHTS[userPermission] >= this.PERMISSION_WEIGHTS[requiredPermission]
  }
  
  // 获取权限描述
  static getDescription(permission: PermissionLevel): string {
    return this.PERMISSION_DESCRIPTIONS[permission]
  }
  
  // 获取权限图标
  static getIcon(permission: PermissionLevel): string {
    return this.PERMISSION_ICONS[permission]
  }
  
  // 获取所有权限级别选项
  static getAllPermissions(): Array<{value: PermissionLevel, label: string, icon: string}> {
    return Object.keys(this.PERMISSION_DESCRIPTIONS).map(permission => ({
      value: permission as PermissionLevel,
      label: this.PERMISSION_DESCRIPTIONS[permission as PermissionLevel],
      icon: this.PERMISSION_ICONS[permission as PermissionLevel]
    }))
  }
}

// 分享配置管理器 - 实现远程权限控制
export class ShareConfigManager {
  private static readonly API_BASE = '/api/share-configs'

  // 创建永久分享配置
  static async createShareConfig(config: {
    roomId: string
    pageId?: string
    permission: PermissionLevel
    description?: string
  }): Promise<ShareConfig> {
    const response = await fetch(`${this.API_BASE}/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.getAuthHeader()
      },
      body: JSON.stringify(config)
    })

    if (!response.ok) {
      throw new Error('Failed to create share config')
    }

    return response.json()
  }

  // 获取分享配置（验证权限）
  static async getShareConfig(shareId: string): Promise<ShareConfig | null> {
    try {
      const response = await fetch(`${this.API_BASE}/${shareId}`)

      if (response.status === 404) {
        return null
      }

      if (response.status === 403) {
        throw new Error('Share has been disabled')
      }

      if (!response.ok) {
        throw new Error('Failed to get share config')
      }

      return response.json()
    } catch (error) {
      console.error('Error getting share config:', error)
      throw error
    }
  }

  // 更新分享配置（房主控制）
  static async updateShareConfig(shareId: string, updates: Partial<{
    permission: PermissionLevel
    isActive: boolean
    description: string
  }>): Promise<ShareConfig> {
    const response = await fetch(`${this.API_BASE}/${shareId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.getAuthHeader()
      },
      body: JSON.stringify(updates)
    })

    if (!response.ok) {
      throw new Error('Failed to update share config')
    }

    return response.json()
  }

  // 房主快速启用/停用分享
  static async toggleShare(shareId: string, isActive: boolean): Promise<void> {
    await this.updateShareConfig(shareId, { isActive })
  }

  // 获取房间的所有分享配置
  static async getRoomShareConfigs(roomId: string): Promise<ShareConfig[]> {
    const response = await fetch(`${this.API_BASE}/room/${roomId}`, {
      headers: {
        'Authorization': this.getAuthHeader()
      }
    })

    if (!response.ok) {
      throw new Error('Failed to get room share configs')
    }

    return response.json()
  }

  // 删除分享配置
  static async deleteShareConfig(shareId: string): Promise<void> {
    const response = await fetch(`${this.API_BASE}/${shareId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': this.getAuthHeader()
      }
    })

    if (!response.ok) {
      throw new Error('Failed to delete share config')
    }
  }

  // 验证永久分享的权限（后端调用）
  static async validatePermanentShare(shareId: string): Promise<{
    isValid: boolean
    config?: ShareConfig
    reason?: string
  }> {
    try {
      const config = await this.getShareConfig(shareId)
      
      if (!config) {
        return { isValid: false, reason: 'Share not found' }
      }

      if (!config.isActive) {
        return { isValid: false, reason: 'Share disabled by owner' }
      }

      return { isValid: true, config }
    } catch (error) {
      return { isValid: false, reason: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  private static getAuthHeader(): string {
    const token = localStorage.getItem('userToken') || ''
    return token ? `Bearer ${token}` : ''
  }
}

// URL工具函数
export class ShareUrlUtils {
  // 生成分享链接（通过ShareConfigManager创建分享配置）
  static async generateShareUrl(config: {
    roomId: string
    pageId?: string
    permission: PermissionLevel
    description?: string
    userId?: string
  }, viewport?: {
    x: number, y: number, width: number, height: number
  }): Promise<string> {
    // 创建分享配置
    const shareConfig = await ShareConfigManager.createShareConfig({
      roomId: config.roomId,
      pageId: config.pageId,
      permission: config.permission,
      description: config.description
    })
    
    // 生成包含shareId的token
    const token = SimpleTokenManager.generateToken({
      roomId: config.roomId,
      permission: config.permission,
      shareId: shareConfig.shareId,
      pageId: config.pageId,
      userId: config.userId
    })
    
    const baseUrl = window.location.origin
    const pageId = config.pageId || 'default'
    const params = new URLSearchParams()
    params.set('p', pageId)
    params.set('t', token)
    
    // 添加视窗参数
    if (viewport && viewport.width && viewport.height) {
      params.set('d', `v${viewport.x}.${viewport.y}.${viewport.width}.${viewport.height}`)
    }
    
    let url = `${baseUrl}/r/${config.roomId}?${params.toString()}`
    
    return url
  }
  
  // 根据已有shareId生成链接（无需创建新的分享配置）
  static generateShareUrlFromId(options: ShareTokenOptions, viewport?: {
    x: number, y: number, width: number, height: number
  }): string {
    const token = SimpleTokenManager.generateToken(options)
    const baseUrl = window.location.origin
    
    // 固定资源路径：/r/{roomId}
    const pageId = options.pageId || 'default'
    const params = new URLSearchParams()
    params.set('p', pageId)
    params.set('t', token)
    
    // 添加视窗参数
    if (viewport && viewport.width && viewport.height) {
      params.set('d', `v${viewport.x}.${viewport.y}.${viewport.width}.${viewport.height}`)
    }
    
    let url = `${baseUrl}/r/${options.roomId}?${params.toString()}`
    
    return url
  }
  
  // 解析分享链接
  static parseShareUrl(url: string): {
    roomId: string
    pageId: string
    token: string
    viewport?: {
      x: number
      y: number
      width: number
      height: number
    }
  } | null {
    try {
      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split('/')
      
      if (pathParts[1] !== 'board' || !pathParts[2]) {
        return null
      }
      
      // 解析 roomId.pageId 格式
      const roomPagePart = pathParts[2]
      const lastDotIndex = roomPagePart.lastIndexOf('.')
      const roomId = lastDotIndex > 0 ? roomPagePart.substring(0, lastDotIndex) : roomPagePart
      const pageId = lastDotIndex > 0 ? roomPagePart.substring(lastDotIndex + 1) : 'default'
      
      const token = urlObj.searchParams.get('t') || urlObj.searchParams.get('token')
      
      if (!token) {
        return null
      }
      
      const result: any = { roomId, pageId, token }
      
      // 解析视窗参数（简化格式）
      const viewportParam = urlObj.searchParams.get('v')
      if (viewportParam) {
        const coords = viewportParam.split(',').map(parseFloat)
        if (coords.length === 4) {
          result.viewport = {
            x: coords[0],
            y: coords[1], 
            width: coords[2],
            height: coords[3]
          }
        }
      }
      
      return result
    } catch (error) {
      console.error('Failed to parse share URL:', error)
      return null
    }
  }
  
  // 从当前URL获取token
  static getTokenFromCurrentUrl(): string | null {
    const urlParams = new URLSearchParams(window.location.search)
    return urlParams.get('t') || urlParams.get('token')
  }
  
  // 从当前URL获取房间ID
  static getRoomIdFromCurrentUrl(): string | null {
    const pathParts = window.location.pathname.split('/')
    if (pathParts[1] === 'board' && pathParts[2]) {
      // 解析 roomId.pageId 格式，返回roomId部分
      const roomPagePart = pathParts[2]
      const lastDotIndex = roomPagePart.lastIndexOf('.')
      return lastDotIndex > 0 ? roomPagePart.substring(0, lastDotIndex) : roomPagePart
    }
    return null
  }
}

// 导出主要功能
export { SimpleTokenManager as TokenManager }

// 使用示例：
/*
// ===== 永久分享（远程权限控制） =====
// 创建分享链接
const shareUrl = await ShareUrlUtils.generateShareUrl({
  roomId: 'room123',
  pageId: 'home',
  permission: 'viewer',
  description: '产品设计展示',
  userId: 'user456'
})

// 根据已有shareId生成链接
const urlFromId = ShareUrlUtils.generateShareUrlFromId({
  roomId: 'room123',
  permission: 'editor',
  shareId: 'existing-share-id',
  pageId: 'home'
})

// 房主远程控制权限
await ShareConfigManager.updateShareConfig('shareId123', {
  permission: 'assist'  // 从浏览权限升级到辅作权限
})

// 房主快速启用/停用分享
await ShareConfigManager.toggleShare('shareId123', false) // 立即停用

// ===== 权限验证 =====
// 验证当前访问的权限
const currentToken = ShareUrlUtils.getTokenFromCurrentUrl()
if (currentToken) {
  const permission = await TokenManager.getPermissionFromToken(currentToken)
  console.log('Current permission:', permission)
  
  // 检查token是否有效
  const isValid = await TokenManager.isTokenValid(currentToken)
  console.log('Token is valid:', isValid)
}
*/