// 房间权限管理系统
// 基于房间属性的权限控制，无需token

export type PermissionLevel = 'viewer' | 'assist' | 'editor'

export interface RoomPermissions {
  // 基础信息
  roomId: string
  ownerId: string
  ownerName: string
  
  // 权限设置
  publicAccessEnabled: boolean    // 是否允许公开访问
  publicPermission: PermissionLevel // 公开访问权限级别
  shareEnabled: boolean           // 是否允许分享
  visitorPermission: PermissionLevel // 访客权限级别
  maxPermission: PermissionLevel  // 房间最高权限级别
  requireApproval: boolean        // 是否需要房主批准
}

export interface UserAccessInfo {
  userId?: string
  userName?: string
  isOwner: boolean
  isGuest: boolean
  effectivePermission: PermissionLevel
  accessReason: 'owner' | 'public' | 'visitor' | 'denied'
}

// 权限级别工具
export class PermissionUtils {
  static readonly PERMISSION_WEIGHTS = {
    viewer: 1,
    assist: 2,
    editor: 3
  }
  
  static readonly PERMISSION_DESCRIPTIONS = {
    viewer: '浏览 - 只能查看最新快照',
    assist: '辅作 - 可新增内容，不能修改历史',
    editor: '编辑 - 完全编辑权限，实时协作'
  }
  
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
  
  // 限制权限级别（不能超过房间最高权限）
  static limitPermission(permission: PermissionLevel, maxPermission: PermissionLevel): PermissionLevel {
    if (this.comparePermissions(permission, maxPermission) > 0) {
      return maxPermission
    }
    return permission
  }
}

// 房间权限管理器
export class RoomPermissionManager {
  private static readonly API_BASE = '/api/rooms'
  
  // 获取房间权限配置
  static async getRoomPermissions(roomId: string): Promise<RoomPermissions | null> {
    try {
      const response = await fetch(`${this.API_BASE}/${roomId}/permissions`)
      
      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        throw new Error('Failed to get room permissions')
      }
      
      return response.json()
    } catch (error) {
      console.error('Error getting room permissions:', error)
      throw error
    }
  }
  
  // 更新房间权限配置（仅房主）
  static async updateRoomPermissions(
    roomId: string, 
    updates: Partial<RoomPermissions>,
    userToken?: string
  ): Promise<RoomPermissions> {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json'
      }
      
      if (userToken) {
        headers['Authorization'] = `Bearer ${userToken}`
      }
      
      const response = await fetch(`${this.API_BASE}/${roomId}/permissions`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates)
      })
      
      if (!response.ok) {
        throw new Error('Failed to update room permissions')
      }
      
      return response.json()
    } catch (error) {
      console.error('Error updating room permissions:', error)
      throw error
    }
  }
  
  // 检查用户对房间的访问权限
  static async checkUserAccess(
    roomId: string, 
    userId?: string,
    userName?: string
  ): Promise<UserAccessInfo> {
    try {
      const params = new URLSearchParams()
      if (userId) params.append('userId', userId)
      if (userName) params.append('userName', userName)
      
      const response = await fetch(`${this.API_BASE}/${roomId}/access?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to check user access')
      }
      
      return response.json()
    } catch (error) {
      console.error('Error checking user access:', error)
      throw error
    }
  }
  
  // 生成简单的房间分享链接（不包含token）
  static generateShareUrl(roomId: string, pageId?: string): string {
    const baseUrl = window.location.origin
    const path = pageId ? `/r/${roomId}?p=${encodeURIComponent(pageId)}` : `/r/${roomId}`
    return `${baseUrl}${path}`
  }
  
  // 获取当前URL的房间ID
  static getRoomIdFromCurrentUrl(): string | null {
    const pathParts = window.location.pathname.split('/')
    if ((pathParts[1] === 'r' || pathParts[1] === 'board') && pathParts[2]) {
      // 支持 /r/roomId 和 /board/roomId 格式（向后兼容）
      const roomPagePart = pathParts[2]
      const dotIndex = roomPagePart.lastIndexOf('.')
      return dotIndex > 0 ? roomPagePart.substring(0, dotIndex) : roomPagePart
    }
    return null
  }
  
  // 获取当前URL的页面ID
  static getPageIdFromCurrentUrl(): string | null {
    const pathParts = window.location.pathname.split('/')
    if (pathParts[1] === 'board' && pathParts[2]) {
      const roomPagePart = pathParts[2]
      const dotIndex = roomPagePart.lastIndexOf('.')
      return dotIndex > 0 ? roomPagePart.substring(dotIndex + 1) : null
    }
    return null
  }
}

// 权限上下文Hook（用于React组件）
export function useRoomPermissions(roomId: string, userId?: string) {
  // 这里可以实现React Hook逻辑
  // 包括权限状态管理、实时更新等
  
  return {
    permissions: null as RoomPermissions | null,
    userAccess: null as UserAccessInfo | null,
    isLoading: true,
    error: null as Error | null,
    
    // 刷新权限信息
    refresh: async () => {
      // 实现权限刷新逻辑
    },
    
    // 检查权限
    hasPermission: (required: PermissionLevel) => {
      // 实现权限检查逻辑
      return false
    }
  }
}

// 使用示例
/*
// 检查用户访问权限
const userAccess = await RoomPermissionManager.checkUserAccess('room123', 'user456')
console.log('User permission:', userAccess.effectivePermission)

// 更新房间权限（房主操作）
await RoomPermissionManager.updateRoomPermissions('room123', {
  publicAccessEnabled: true,
  publicPermission: 'viewer',
  visitorPermission: 'assist'
})

// 生成分享链接
const shareUrl = RoomPermissionManager.generateShareUrl('room123', 'home')
// 结果: https://domain.com/board/room123.home
*/