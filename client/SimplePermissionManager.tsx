import React, { useState, useEffect, useCallback } from 'react'
import { useUser } from '@clerk/clerk-react'
import { roomUtils } from './roomUtils'

export type SimplePermission = 'viewer' | 'assist' | 'editor'

export interface SimplePermissionConfig {
  roomId: string
  permission: SimplePermission
  shared: boolean
  publish?: boolean
  plaza?: boolean
  plaza_request?: boolean
  // 历史锁定状态由权限自动决定，不再单独设置
  historyLocked: boolean
  historyLockTimestamp?: number
  historyLockedBy?: string
  historyLockedByName?: string
}

/**
 * 简化权限管理器
 * 规则：
 * - 编辑：完全权限，历史解锁
 * - 辅作：新增内容权限，历史锁定
 * - 浏览：只读权限，不影响历史
 */
export class SimplePermissionManager {
  
  /**
   * 获取权限描述
   */
  static getPermissionInfo(permission: SimplePermission) {
    const info = {
      viewer: {
        name: '浏览',
        description: '只能查看内容，无编辑权限',
        icon: '👁️',
        historyEffect: '不影响历史状态'
      },
      assist: {
        name: '辅作', 
        description: '可新增内容，历史自动锁定',
        icon: '✏️',
        historyEffect: '自动锁定历史'
      },
      editor: {
        name: '编辑',
        description: '完全编辑权限，历史自动解锁', 
        icon: '🖊️',
        historyEffect: '自动解锁历史'
      }
    }
    return info[permission]
  }

  /**
   * 根据权限自动决定历史锁定状态
   */
  static shouldLockHistory(permission: SimplePermission, currentHistoryLocked: boolean): boolean {
    switch (permission) {
      case 'editor':
        return false // 编辑权限自动解锁历史
      case 'assist':
        return true  // 辅作权限自动锁定历史
      case 'viewer':
        return currentHistoryLocked // 浏览权限不影响历史状态
      default:
        return currentHistoryLocked
    }
  }

  /**
   * 获取房间权限配置
   */
  static async getRoomPermissionConfig(roomId: string): Promise<SimplePermissionConfig | null> {
    try {
      const room = await roomUtils.getRoom(roomId)
      if (!room) return null

      return {
        roomId: roomId,
        permission: room.permission || 'editor',
        shared: room.shared || false,
        publish: room.publish || false,
        plaza: room.plaza || false,
        plaza_request: room.plaza_request || false,
        historyLocked: room.historyLocked || false,
        historyLockTimestamp: room.historyLockTimestamp,
        historyLockedBy: room.historyLockedBy,
        historyLockedByName: room.historyLockedByName
      }
    } catch (error) {
      console.error('Error getting room permission config:', error)
      return null
    }
  }

  /**
   * 发布到共享空间（直播协作）
   */
  static async publishToShared(roomId: string, userId: string, userName: string): Promise<boolean> {
    try {
      const response = await fetch('/api/rooms/' + roomId + '/publish-shared', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          userName,
          publishedAt: Date.now()
        })
      })

      return response.ok
    } catch (error) {
      console.error('Error publishing to shared space:', error)
      return false
    }
  }

  /**
   * 取消共享空间发布
   */
  static async unshareFromShared(roomId: string): Promise<boolean> {
    try {
      const response = await fetch('/api/rooms/' + roomId + '/unshare-shared', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      return response.ok
    } catch (error) {
      console.error('Error unpublishing from shared space:', error)
      return false
    }
  }

  /**
   * 发布（静态展示） - 创建p路径的静态副本
   */
  static async publishToPlaza(roomId: string, userId: string, userName: string): Promise<boolean> {
    try {
      console.log('🚀 开始发布房间 /p/ 路径:', roomId)
      
      // 调用后端API创建发布副本
      const response = await fetch('/api/rooms/' + roomId + '/publish-publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          userName,
          publishedAt: Date.now(),
          createPlazaCopy: true // 标记需要创建p路径副本
        })
      })

      if (response.ok) {
        console.log('✅ 房间已发布，p路径副本已创建')
        
        // 触发房间发布到p路径的事件
        window.dispatchEvent(new CustomEvent('roomPublishedToPlaza', {
          detail: { roomId, userId, userName }
        }))
        
        return true
      } else {
        console.error('❌ 发布失败:', response.status)
        return false
      }
    } catch (error) {
      console.error('Error publishing to publish:', error)
      return false
    }
  }

  /**
   * 取消发布 - 删除p路径的静态副本
   */
  static async unpublishFromPlaza(roomId: string): Promise<boolean> {
    try {
      console.log('🗑️ 开始取消发布，删除 /p/ 路径副本:', roomId)
      
      const response = await fetch('/api/rooms/' + roomId + '/unpublish-publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          removePlazaCopy: true // 标记需要删除p路径副本
        })
      })

      if (response.ok) {
        console.log('✅ 已取消发布，p路径副本已删除')
        
        // 清理本地p路径相关的快照
        try {
          const { snapshotManager } = await import('./SnapshotManager')
          snapshotManager.clearSnapshots(roomId)
          console.log('🧹 已清理本地p路径快照')
        } catch (cleanupError) {
          console.warn('⚠️ 清理快照失败:', cleanupError)
        }
        
        // 触发取消发布事件
        window.dispatchEvent(new CustomEvent('roomUnpublishedFromPlaza', {
          detail: { roomId }
        }))
        
        return true
      } else {
        console.error('❌ 取消发布失败:', response.status)
        return false
      }
    } catch (error) {
      console.error('Error unpublishing from publish:', error)
      return false
    }
  }

  /**
   * 提交发布申请 (保留用于兼容性)
   */
  static async submitPlazaRequest(roomId: string, userId: string, userName: string): Promise<boolean> {
    // 现在直接调用发布
    return this.publishToPlaza(roomId, userId, userName)
  }

  /**
   * 检查房间发布状态
   */
  static async checkPublishStatus(roomId: string): Promise<'none' | 'pending' | 'approved' | 'rejected'> {
    // 已移除“发布申请/审核”流程，直接返回 none，避免无效的后端请求与控制台噪音
    return 'none'
  }

  /**
   * 更新房间权限配置（自动处理历史锁定和发布审批）
   */
  static async updateRoomPermissionConfig(
    roomId: string,
    newPermission: SimplePermission,
    shared?: boolean,
    publish?: boolean,
    editor?: any,
    userId?: string,
    userName?: string
  ): Promise<boolean> {
    try {
      const room = await roomUtils.getRoom(roomId)
      if (!room) return false

      const currentHistoryLocked = room.historyLocked || false
      const shouldLock = this.shouldLockHistory(newPermission, currentHistoryLocked)
      
      console.log(`🔄 权限变更: ${newPermission}, 历史锁定: ${currentHistoryLocked} → ${shouldLock}`)

      // 检查是否要共享房间和加入发布白板
      const wasShared = room.shared || false
      const willBeShared = shared !== undefined ? shared : room.shared
      const wasInPlaza = room.publish || false
      const willBeInPlaza = publish !== undefined ? publish : room.publish

      // 处理共享到共享空间
      if (!wasShared && willBeShared && userId && userName) {
        console.log('🚀 共享到共享空间（自动生效）')
        await this.publishToShared(roomId, userId, userName)
      } else if (wasShared && !willBeShared) {
        console.log('🔒 取消共享空间共享')
        await this.unshareFromShared(roomId)
      }

      // 处理发布
      if (!wasInPlaza && willBeInPlaza && userId && userName) {
        console.log('🎨 发布（自动生效）')
        await this.publishToPlaza(roomId, userId, userName)
      } else if (wasInPlaza && !willBeInPlaza) {
        console.log('🏠 取消发布')
        await this.unpublishFromPlaza(roomId)
      }

      let updatedRoom = {
        ...room,
        permission: newPermission,
        shared: willBeShared, // 共享状态
        publish: willBeInPlaza, // 发布白板状态
        published: willBeShared || willBeInPlaza, // 向后兼容：共享或发布房间都视为已发布
        historyLocked: shouldLock,
        lastModified: Date.now(),
        publishRequestStatus: 'none' // 取消审核流程
      }

      // 处理历史锁定状态变更
      if (shouldLock && !currentHistoryLocked && editor) {
        // 需要锁定历史
        console.log('🔒 自动锁定历史')
        await roomUtils.lockHistory(roomId, editor, userId, userName)
        updatedRoom.historyLockTimestamp = Date.now()
        updatedRoom.historyLockedBy = userId
        updatedRoom.historyLockedByName = userName
      } else if (!shouldLock && currentHistoryLocked && editor) {
        // 需要解锁历史  
        console.log('🔓 自动解锁历史')
        await roomUtils.unlockHistory(roomId, editor, userId)
        updatedRoom.historyLockTimestamp = undefined
        updatedRoom.historyLockedBy = undefined
        updatedRoom.historyLockedByName = undefined
      }

      await roomUtils.updateRoom(roomId, updatedRoom)
      
      // 触发同步事件
      window.dispatchEvent(new CustomEvent('simplePermissionChanged', { 
        detail: { 
          roomId,
          permission: newPermission,
          historyLocked: shouldLock,
          shared: updatedRoom.shared,
          publish: updatedRoom.publish,
          updatedConfig: updatedRoom
        } 
      }))

      // 额外广播：统一的权限变更事件 + 跨标签/跨源同步，避免手动刷新
      try {
        const permissionData = {
          roomId,
          permission: newPermission,
          timestamp: Date.now(),
          source: 'settings'
        }
        // 本标签页
        window.dispatchEvent(new CustomEvent('room-permission-change', { detail: permissionData }))
        // 本地存储（跨标签页）
        localStorage.setItem(`room-permission-${roomId}`, JSON.stringify(permissionData))
        // BroadcastChannel（跨源）
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel(`tldraw-room-${roomId}`)
          channel.postMessage(permissionData)
        }
      } catch {}

      return true
    } catch (error) {
      console.error('Error updating room permission config:', error)
      return false
    }
  }

  /**
   * 检查用户是否是房间所有者
   */
  static async isRoomOwner(roomId: string, userId?: string): Promise<boolean> {
    if (!userId) return false
    
    try {
      const room = await roomUtils.getRoom(roomId)
      return room && (room.ownerId === userId || room.owner === userId)
    } catch (error) {
      console.error('Error checking room ownership:', error)
      return false
    }
  }

  /**
   * 生成分享URL - 严格格式 /r/{roomId}?p={pageId}&d=v{x}.{y}.{width}.{height}
   */
  static generateShareUrl(
    roomId: string, 
    pageId: string, 
    viewport?: { x: number, y: number, width: number, height: number }
  ): string {
    const baseUrl = window.location.origin
    const params = new URLSearchParams()
    
    // 总是添加页面ID，每个房间至少有一页
    params.set('p', pageId)
    console.log('🔗 Added pageId to URL:', pageId)
    
    // 如果有视窗信息，添加视窗参数
    if (viewport) {
      params.set('d', `v${viewport.x}.${viewport.y}.${viewport.width}.${viewport.height}`)
      console.log('🔗 Added viewport to URL:', `v${viewport.x}.${viewport.y}.${viewport.width}.${viewport.height}`)
    }
    
    const finalUrl = `${baseUrl}/r/${roomId}?${params.toString()}`
    console.log('🔗 Final share URL:', finalUrl)
    return finalUrl
  }

  /**
   * 将复杂的pageId转换为简单的数字索引
   */
  static getPageIndex(pageId: string): number {
    // 如果已经是简单格式 'page:N'，直接返回数字
    if (pageId.startsWith('page:')) {
      const indexStr = pageId.replace('page:', '')
      const index = parseInt(indexStr, 10)
      if (!isNaN(index)) {
        return index
      }
    }
    
    // 从其他格式的pageId中提取数字索引
    const match = pageId.match(/(\d+)/)
    if (match) {
      return parseInt(match[1], 10)
    }
    
    // 如果无法解析，使用pageId的哈希值模10作为索引（限制在0-9范围内）
    let hash = 0
    for (let i = 0; i < pageId.length; i++) {
      const char = pageId.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32位整数
    }
    return Math.abs(hash) % 10
  }

  /**
   * 根据索引获取对应的pageId（用于URL解析）
   */
  static getPageIdFromIndex(index: number, editor?: any): string {
    if (!editor) {
      return `page:${index}`
    }
    
    try {
      const pages = editor.getPages()
      if (pages && pages[index]) {
        return pages[index].id
      }
    } catch (error) {
      console.warn('Failed to get page from index:', error)
    }
    
    return `page:${index}`
  }

  /**
   * 从编辑器中获取页面的实际索引位置
   */
  static getPageIndexFromEditor(pageId: string, editor?: any): number {
    if (!editor) {
      return 0
    }
    
    try {
      const pages = editor.getPages()
      if (pages) {
        const pageIndex = pages.findIndex((page: any) => page.id === pageId)
        return pageIndex >= 0 ? pageIndex : 0
      }
    } catch (error) {
      console.warn('Failed to get page index from editor:', error)
    }
    
    return 0
  }
}

/**
 * 简化权限管理 React Hook
 */
export function useSimplePermissions(roomId: string, editor?: any) {
  const { user } = useUser()
  const [config, setConfig] = useState<SimplePermissionConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)

  // 加载权限配置
  const loadConfig = useCallback(async () => {
    if (!roomId) return
    
    setIsLoading(true)
    try {
      const permissionConfig = await SimplePermissionManager.getRoomPermissionConfig(roomId)
      setConfig(permissionConfig)
      
      if (user?.id) {
        const ownerStatus = await SimplePermissionManager.isRoomOwner(roomId, user.id)
        setIsOwner(ownerStatus)
      }
    } catch (error) {
      console.error('Error loading simple permission config:', error)
    } finally {
      setIsLoading(false)
    }
  }, [roomId, user?.id])

  // 更新权限配置
  const updatePermission = useCallback(async (
    newPermission: SimplePermission,
    shared?: boolean,
    publish?: boolean
  ) => {
    if (!roomId || !user?.id) return false
    
    console.log(`🔄 更新权限: ${newPermission}`)
    
    return await SimplePermissionManager.updateRoomPermissionConfig(
      roomId,
      newPermission, 
      shared,
      publish,
      editor,
      user.id,
      user.fullName || user.firstName || 'User'
    )
  }, [roomId, editor, user])

  // 生成分享URL
  const generateShareUrl = useCallback((pageId?: string, viewport?: any) => {
    return SimplePermissionManager.generateShareUrl(roomId, pageId, viewport)
  }, [roomId])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // 监听权限变更事件
  useEffect(() => {
    const handlePermissionChange = (event: CustomEvent) => {
      const { roomId: changedRoomId, updatedConfig } = event.detail
      
      if (changedRoomId === roomId && updatedConfig) {
        console.log(`🔄 检测到简化权限变更: ${roomId}`, updatedConfig)
        setConfig({
          roomId: roomId,
          permission: updatedConfig.permission || 'editor',
          shared: updatedConfig.shared || false,
          publish: updatedConfig.publish || false,
          historyLocked: updatedConfig.historyLocked || false,
          historyLockTimestamp: updatedConfig.historyLockTimestamp,
          historyLockedBy: updatedConfig.historyLockedBy,
          historyLockedByName: updatedConfig.historyLockedByName
        })
      }
    }

    window.addEventListener('simplePermissionChanged', handlePermissionChange as EventListener)
    
    return () => {
      window.removeEventListener('simplePermissionChanged', handlePermissionChange as EventListener)
    }
  }, [roomId])

  return {
    config,
    isLoading,
    isOwner,
    loadConfig,
    updatePermission,
    generateShareUrl,
    
    // 权限信息获取
    getPermissionInfo: (permission: SimplePermission) => 
      SimplePermissionManager.getPermissionInfo(permission),
      
    // 当前权限信息
    currentPermissionInfo: config ? 
      SimplePermissionManager.getPermissionInfo(config.permission) : null
  }
}