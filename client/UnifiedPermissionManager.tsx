import React, { useState, useEffect, useCallback } from 'react'
import { useUser } from '@clerk/clerk-react'
import { roomUtils } from './roomUtils'
import { PermissionController, type Permission } from './permissionHierarchy'
import { RoomPermissionManager, PermissionUtils, type PermissionLevel } from './roomPermissions'

export interface UnifiedPermissionConfig {
  roomId: string
  permission: Permission
  maxPermission?: Permission
  publish: boolean
  plaza?: boolean
  historyLocked?: boolean
  historyLockTimestamp?: number
  historyLockedBy?: string
  historyLockedByName?: string
}

export interface UnifiedPermissionManagerProps {
  roomId: string
  editor?: any
  onPermissionChange?: (config: UnifiedPermissionConfig) => void
}

/**
 * 统一权限管理组件
 * 用于在SharePanel、RoomSettings和WorkSpace中统一处理权限设置
 */
export const UnifiedPermissionManager = {
  
  /**
   * 获取房间权限配置
   */
  async getRoomPermissionConfig(roomId: string): Promise<UnifiedPermissionConfig | null> {
    try {
      const room = await roomUtils.getRoom(roomId)
      if (!room) return null

      return {
        roomId: roomId,
        permission: room.permission || 'editor',
        maxPermission: room.maxPermission || 'editor',
  publish: (room as any).publish || false,
        plaza: room.plaza || false,
        historyLocked: room.historyLocked || false,
        historyLockTimestamp: room.historyLockTimestamp,
        historyLockedBy: room.historyLockedBy,
        historyLockedByName: room.historyLockedByName
      }
    } catch (error) {
      console.error('Error getting room permission config:', error)
      return null
    }
  },

  /**
   * 更新房间权限配置
   */
  async updateRoomPermissionConfig(
    roomId: string, 
    updates: Partial<UnifiedPermissionConfig>
  ): Promise<boolean> {
    try {
      const room = await roomUtils.getRoom(roomId)
      if (!room) return false

      const updatedRoom = {
        ...room,
        ...updates,
        lastModified: Date.now()
      }

      await roomUtils.updateRoom(roomId, updatedRoom)
      
      console.log(`🔄 权限更新: ${roomId}`, updates)
      
      // 触发详细的权限变更事件 - 包含完整的更新配置
      window.dispatchEvent(new CustomEvent('roomPermissionChanged', { 
        detail: { 
          roomId,
          updatedConfig: updatedRoom,
          changes: updates
        } 
      }))

      // 触发通用的房间数据变更事件
      window.dispatchEvent(new CustomEvent('roomDataChanged', { 
        detail: { 
          roomId, 
          permission: updates.permission,
          historyLocked: updates.historyLocked,
  publish: (updates as any).publish,
          plaza: updates.plaza,
          maxPermission: updates.maxPermission
        } 
      }))

      // 触发房间更新事件
      window.dispatchEvent(new CustomEvent('roomsUpdated', { 
        detail: { rooms: [updatedRoom] } 
      }))

      // 强制刷新当前页面的权限状态（如果是当前房间）
      const currentPath = window.location.pathname
      if (currentPath.includes(roomId) || currentPath.includes(`/r/${roomId}`)) {
        console.log(`🔄 当前房间权限已更新，触发状态刷新`)
        window.dispatchEvent(new CustomEvent('currentRoomPermissionUpdated', {
          detail: { roomId, updatedConfig: updatedRoom }
        }))
      }

      return true
    } catch (error) {
      console.error('Error updating room permission config:', error)
      return false
    }
  },

  /**
   * 检查用户是否是房间所有者
   */
  async isRoomOwner(roomId: string, userId?: string): Promise<boolean> {
    if (!userId) return false
    
    try {
      const room = await roomUtils.getRoom(roomId)
      return room && (room.ownerId === userId || room.owner === userId)
    } catch (error) {
      console.error('Error checking room ownership:', error)
      return false
    }
  },

  /**
   * 获取有效权限级别（考虑房间最大权限限制）
   */
  getEffectivePermission(
    requestedPermission: Permission, 
    maxPermission: Permission
  ): Permission {
    return PermissionController.canSetPermission(maxPermission, requestedPermission) 
      ? requestedPermission 
      : maxPermission
  },

  /**
   * 获取历史锁定后可用的权限选项
   */
  getPermissionsAfterHistoryLock(): Permission[] {
    return PermissionController.getPermissionsAfterHistoryLock()
  },

  /**
   * 检查权限是否可以执行特定操作
   */
  canPerformAction(
    userPermission: Permission, 
    action: 'view' | 'edit_new' | 'edit_history',
    isHistoryLocked: boolean = false
  ): boolean {
    switch (action) {
      case 'view':
        return true // 所有权限都可以查看
      case 'edit_new':
        return PermissionController.canEditNew(userPermission)
      case 'edit_history':
        return PermissionController.canEditHistory(userPermission, isHistoryLocked)
      default:
        return false
    }
  },

  /**
   * 锁定房间历史
   */
  async lockRoomHistory(
    roomId: string, 
    editor: any, 
    userId?: string, 
    userName?: string
  ): Promise<boolean> {
    try {
      if (!editor) {
        throw new Error('Editor instance is required')
      }

      await roomUtils.lockHistory(roomId, editor, userId, userName)
      
      // 更新权限配置
      const updates: Partial<UnifiedPermissionConfig> = {
        historyLocked: true,
        historyLockTimestamp: Date.now(),
        historyLockedBy: userId,
        historyLockedByName: userName
      }

      return await this.updateRoomPermissionConfig(roomId, updates)
    } catch (error) {
      console.error('Error locking room history:', error)
      return false
    }
  },

  /**
   * 解锁房间历史
   */
  async unlockRoomHistory(
    roomId: string, 
    editor: any, 
    userId?: string
  ): Promise<boolean> {
    try {
      if (!editor) {
        throw new Error('Editor instance is required')
      }

      await roomUtils.unlockHistory(roomId, editor, userId)
      
      // 更新权限配置
      const updates: Partial<UnifiedPermissionConfig> = {
        historyLocked: false,
        historyLockTimestamp: undefined,
        historyLockedBy: undefined,
        historyLockedByName: undefined
      }

      return await this.updateRoomPermissionConfig(roomId, updates)
    } catch (error) {
      console.error('Error unlocking room history:', error)
      return false
    }
  },

  /**
   * 生成房间分享URL（包含页面ID和视窗信息）
   */
  generateShareUrl(
    roomId: string, 
    pageId?: string, 
    viewport?: { x: number, y: number, width: number, height: number }
  ): string {
    const baseUrl = window.location.origin
    const params = new URLSearchParams()
    
    if (pageId) {
      params.set('p', pageId)
    }
    
    if (viewport) {
      params.set('d', `v${viewport.x}.${viewport.y}.${viewport.width}.${viewport.height}`)
    }
    
    let path = `/r/${roomId}`
    if (params.toString()) {
      path += `?${params.toString()}`
    }
    
    return `${baseUrl}${path}`
  },

  /**
   * 获取权限选项列表（用于下拉选择器）
   */
  getPermissionOptions(maxPermission?: Permission, isHistoryLocked?: boolean): Array<{
    value: Permission
    label: string
    description: string
    disabled?: boolean
  }> {
    const allPermissions: Permission[] = ['viewer', 'assist', 'editor']
    
    // 如果历史已锁定，限制权限选项
    const availablePermissions = isHistoryLocked 
      ? this.getPermissionsAfterHistoryLock()
      : allPermissions

    // 如果设置了最大权限，进一步限制
    const finalPermissions = maxPermission 
      ? availablePermissions.filter(p => PermissionController.canSetPermission(maxPermission, p))
      : availablePermissions

    return allPermissions.map(permission => ({
      value: permission,
      label: PermissionController.getPermissionDescription(permission).split(' - ')[0],
      description: PermissionController.getPermissionDescription(permission),
      disabled: !finalPermissions.includes(permission)
    }))
  }
}

/**
 * React Hook for unified permission management
 */
export function useUnifiedPermissions(roomId: string, editor?: any) {
  const { user } = useUser()
  const [config, setConfig] = useState<UnifiedPermissionConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)

  // Load permission config
  const loadConfig = useCallback(async () => {
    if (!roomId) return
    
    setIsLoading(true)
    try {
      const permissionConfig = await UnifiedPermissionManager.getRoomPermissionConfig(roomId)
      setConfig(permissionConfig)
      
      if (user?.id) {
        const ownerStatus = await UnifiedPermissionManager.isRoomOwner(roomId, user.id)
        setIsOwner(ownerStatus)
      }
    } catch (error) {
      console.error('Error loading permission config:', error)
    } finally {
      setIsLoading(false)
    }
  }, [roomId, user?.id])

  // Update permission config
  const updateConfig = useCallback(async (updates: Partial<UnifiedPermissionConfig>) => {
    if (!roomId) return false
    
    const success = await UnifiedPermissionManager.updateRoomPermissionConfig(roomId, updates)
    if (success) {
      setConfig(prev => prev ? { ...prev, ...updates } : null)
    }
    return success
  }, [roomId])

  // Lock history
  const lockHistory = useCallback(async () => {
    if (!editor || !user?.id) return false
    
    return await UnifiedPermissionManager.lockRoomHistory(
      roomId, 
      editor, 
      user.id, 
      user.fullName || user.firstName || 'User'
    )
  }, [roomId, editor, user])

  // Unlock history
  const unlockHistory = useCallback(async () => {
    if (!editor || !user?.id) return false
    
    return await UnifiedPermissionManager.unlockRoomHistory(roomId, editor, user.id)
  }, [roomId, editor, user])

  // Generate share URL
  const generateShareUrl = useCallback((pageId?: string, viewport?: any) => {
    return UnifiedPermissionManager.generateShareUrl(roomId, pageId, viewport)
  }, [roomId])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // 监听权限变更事件，实时同步状态
  useEffect(() => {
    const handlePermissionChange = (event: CustomEvent) => {
      const { roomId: changedRoomId, updatedConfig } = event.detail
      
      if (changedRoomId === roomId && updatedConfig) {
        console.log(`🔄 检测到房间 ${roomId} 的权限变更，同步状态`, updatedConfig)
        
        // 直接更新本地配置状态
        setConfig({
          roomId: updatedConfig.id || roomId,
          permission: updatedConfig.permission || 'editor',
          maxPermission: updatedConfig.maxPermission || 'editor',
  publish: updatedConfig.publish || false,
          plaza: updatedConfig.plaza || false,
          historyLocked: updatedConfig.historyLocked || false,
          historyLockTimestamp: updatedConfig.historyLockTimestamp,
          historyLockedBy: updatedConfig.historyLockedBy,
          historyLockedByName: updatedConfig.historyLockedByName
        })
        
        // 更新拥有者状态
        if (user?.id) {
          const ownerStatus = updatedConfig.ownerId === user.id || updatedConfig.owner === user.id
          setIsOwner(ownerStatus)
        }
      }
    }

    const handleRoomDataChange = (event: CustomEvent) => {
      const { roomId: changedRoomId } = event.detail
      
      if (changedRoomId === roomId) {
        console.log(`🔄 检测到房间 ${roomId} 的数据变更，重新加载配置`)
        // 延迟一点重新加载，确保数据库已更新
        setTimeout(() => {
          loadConfig()
        }, 100)
      }
    }

    // 监听特定的权限变更事件
    window.addEventListener('roomPermissionChanged', handlePermissionChange as EventListener)
    window.addEventListener('currentRoomPermissionUpdated', handlePermissionChange as EventListener)
    
    // 监听通用的房间数据变更事件作为备用
    window.addEventListener('roomDataChanged', handleRoomDataChange as EventListener)

    return () => {
      window.removeEventListener('roomPermissionChanged', handlePermissionChange as EventListener)
      window.removeEventListener('currentRoomPermissionUpdated', handlePermissionChange as EventListener)
      window.removeEventListener('roomDataChanged', handleRoomDataChange as EventListener)
    }
  }, [roomId, loadConfig, user])

  return {
    config,
    isLoading,
    isOwner,
    loadConfig,
    updateConfig,
    lockHistory,
    unlockHistory,
    generateShareUrl,
    getPermissionOptions: (isHistoryLocked?: boolean) => 
      UnifiedPermissionManager.getPermissionOptions(config?.maxPermission, isHistoryLocked),
    canPerformAction: (action: 'view' | 'edit_new' | 'edit_history') =>
      config ? UnifiedPermissionManager.canPerformAction(
        config.permission, 
        action, 
        config.historyLocked
      ) : false
  }
}