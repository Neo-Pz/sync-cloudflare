import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useUser, SignInButton, useClerk } from '@clerk/clerk-react'
import { nanoid } from 'nanoid'
import { RoomThumbnail } from './RoomThumbnail'
import { CoverPageSelector } from './CoverPageSelector'
import { RoomSettings } from './RoomSettings'
import { SharePanel } from './SharePanel'
import { RoomInfo } from './RoomInfo'

// 显示房间缩略图上的操作按钮（重命名 / 设置封面 / 共享 / 设为发布 / 删除）
// 需求：这些操作已在房间设置中提供，这里统一隐藏，仅保留状态展示。
const SHOW_ROOM_CARD_ACTIONS = false
import { roomUtils } from './roomUtils'
import { interactionTracker } from './interactionTracker'
import { roomUserStatsManager } from './roomUserStatsManager'

export interface Room {
  id: string
  name: string
  createdAt: number
  lastModified: number
  owner: string
  ownerId: string
  ownerName: string
  isShared: boolean
  shared: boolean     // 是否共享到共享白板
  published?: boolean // 向后兼容字段（废弃）
  permission: 'viewer' | 'editor' | 'assist'
  maxPermission?: 'viewer' | 'editor' | 'assist' // 房主设定的最大权限
  thumbnail?: string
  coverPageId?: string
  publishStatus?: 'private' | 'published' | 'unlisted'
  description?: string
  tags?: string[]
  historyLocked?: boolean
  historyLockTimestamp?: number  // 新增：历史锁定时间戳，锁定时刻之前的内容不可编辑
  historyLockedBy?: string  // 新增：锁定人ID
  historyLockedByName?: string  // 新增：锁定人姓名
  publish?: boolean  // 是否发布（用于发布白板）
  plaza?: boolean    // 是否设为广场（用于广场白板）
}

interface RoomManagerProps {
  currentRoomId: string
  onRoomChange: (roomId: string, accessType?: 'my' | 'shared' | 'published') => void
  onRoomCreate: (room: Room) => void
  onClose?: () => void
}

type ViewMode = 'card' | 'list'
type SortMode = 'recent' | 'name' | 'created'
type FilterMode = 'all' | 'my' | 'shared' | 'published' | 'plaza'

export function RoomManager({ currentRoomId, onRoomChange, onRoomCreate, onClose }: RoomManagerProps) {
  const { user, isLoaded } = useUser()
  const { openSignIn } = useClerk()
  const [rooms, setRooms] = useState<Room[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('card')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [coverSelectorRoom, setCoverSelectorRoom] = useState<Room | null>(null)
  const [starredMap, setStarredMap] = useState<Record<string, boolean>>({})
  const [roomSettingsRoomId, setRoomSettingsRoomId] = useState<string | null>(null)
  const [roomInfoModal, setRoomInfoModal] = useState<Room | null>(null)
  const [shareRoomId, setShareRoomId] = useState<string | null>(null)

  // 初始化收藏状态（从interactionTracker读取）
  useEffect(() => {
    try {
      const allMetrics = interactionTracker.getAllMetrics?.()
      if (allMetrics) {
        const map: Record<string, boolean> = {}
        allMetrics.forEach((m: any) => { map[m.roomId] = !!m.isStarred })
        setStarredMap(map)
      }
    } catch {}
  }, [])

  // 监听来自其他组件的收藏状态变化
  useEffect(() => {
    const handleStarChange = (event: Event) => {
      const customEvent = event as CustomEvent
      const { roomId, starred } = customEvent.detail || {}
      if (roomId) {
        setStarredMap((prev) => ({ ...prev, [roomId]: !!starred }))
      }
    }
    
    window.addEventListener('starChanged', handleStarChange)
    return () => window.removeEventListener('starChanged', handleStarChange)
  }, [])

  const toggleStar = useCallback(async (roomId: string) => {
    const userId = user?.id || 'anon'
    const userName = user?.fullName || user?.username || 'Anonymous'
    const current = !!starredMap[roomId]
    const newStarredState = !current
    
    await interactionTracker.toggleStar(roomId, userId, userName, newStarredState)
    setStarredMap((prev) => ({ ...prev, [roomId]: newStarredState }))
    
    // 触发全局事件，通知其他组件（如当前房间详情）收藏状态已变化
    window.dispatchEvent(new CustomEvent('starChanged', {
      detail: { roomId, starred: newStarredState }
    }))
  }, [starredMap, user])

  // 获取当前用户权限
  const getCurrentUserPermission = useCallback((room: Room) => {
    // 检查是否是房主
    const isOwner = user?.id === room.ownerId || user?.id === room.owner
    
    // 检查URL路径来判断访问权限
    const currentPath = window.location.pathname
    const isReadOnlyAccess = currentPath.includes('/ro/')
    
    if (isOwner) {
      return 'owner' // 房主拥有所有权限
    } else if (isReadOnlyAccess) {
      return 'viewer' // 通过只读链接访问
    } else {
      return room.permission || 'viewer' // 使用房间设置的权限
    }
  }, [user])

  // 判断用户是否有编辑权限
  const hasEditPermission = useCallback((room: Room) => {
    const permission = getCurrentUserPermission(room)
    return permission === 'owner' || permission === 'editor'
  }, [getCurrentUserPermission])

  // 判断用户是否是房主
  const isRoomOwner = useCallback((room: Room) => {
    return user?.id === room.ownerId || user?.id === room.owner
  }, [user])

  // Load rooms from storage
  const loadRooms = useCallback(async () => {
    try {
      const rooms = await roomUtils.getAllRooms()
      console.log('🔍 RoomManager.loadRooms() 加载的房间:', {
        totalRooms: rooms.length,
        roomDetails: rooms.map(room => ({
          id: room.id,
          name: room.name,
          owner: room.ownerName,
          ownerId: room.ownerId,
          shared: room.shared,
          publish: room.publish,
          plaza: room.plaza,
          isMyRoom: room.owner === (user?.id || 'anonymous') || room.ownerId === (user?.id || 'anonymous')
        }))
      })
      
      if (rooms.length === 0) {
        // Create default room if no rooms exist
        const userId = user?.id || 'anonymous'
        // 优先使用邮箱前缀作为用户名
        const userName = user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 
                         user?.fullName || 
                         `${user?.firstName || ''} ${user?.lastName || ''}`.trim() ||
                         user?.username ||
                         user?.emailAddresses?.[0]?.emailAddress ||
                         'User'
        await roomUtils.createDefaultRoomIfNeeded(userId, userName)
        const updatedRooms = await roomUtils.getAllRooms()
        setRooms(updatedRooms)
      } else {
        setRooms(rooms)
      }
    } catch (error) {
      console.error('Error loading rooms:', error)
      setRooms([])
    }
  }, [user])

  // Load rooms initially
  useEffect(() => {
    loadRooms()
  }, [loadRooms])

  // 未登录时强制限制可见标签与默认筛选
  useEffect(() => {
    if (!user && (filterMode === 'my' || filterMode === 'shared')) {
      setFilterMode('all')
    }
  }, [user, filterMode])

  // 监听从缩略图发来的“openRoomInfo”
  useEffect(() => {
    const handler = (e: Event) => {
      const { roomId } = (e as CustomEvent).detail || {}
      if (!roomId) return
      const room = rooms.find(r => r.id === roomId)
      if (!room) return
      // 非房主：仅显示“房间信息”只读面板；房主：打开房间设置
      const isOwner = user?.id === room.ownerId || user?.id === room.owner
      if (isOwner) {
        setRoomSettingsRoomId(roomId)
      } else {
        setRoomInfoModal(room)
      }
    }
    window.addEventListener('openRoomInfo', handler as EventListener)
    return () => window.removeEventListener('openRoomInfo', handler as EventListener)
  }, [rooms, user?.id])

  // Debug: Log rooms data when it changes
  useEffect(() => {
    console.log('Current rooms:', rooms)
    console.log('Published rooms:', rooms.filter(room => room.shared === true))
  }, [rooms])

  // Listen for room changes from other components
  useEffect(() => {
    const handleRoomUpdate = async (event: Event) => {
      // 安全地转换为CustomEvent
      const customEvent = event as CustomEvent
      console.log('Room update event received:', customEvent.detail)
      try {
        const rooms = await roomUtils.getAllRooms()
        setRooms(rooms)
      } catch (error) {
        console.error('Error updating rooms:', error)
      }
    }
    
    window.addEventListener('roomsUpdated', handleRoomUpdate)
    
    return () => {
      window.removeEventListener('roomsUpdated', handleRoomUpdate)
    }
  }, [])

  // Remove auto-save to prevent circular updates
  // roomUtils.saveRooms is called directly in mutations

  // Filter and sort rooms
  const filteredAndSortedRooms = useMemo(() => {
    // 首先去重 - 按房间ID去重，优先保留最新的记录
    const uniqueRooms = roomUtils.deduplicateRooms(rooms)
    console.log(`RoomManager: 去重后房间数量从 ${rooms.length} 减少到 ${uniqueRooms.length}`)

    let filtered = uniqueRooms

    // Apply filter
    if (filterMode === 'my') {
      // 我的白板 - 显示当前用户创建的所有房间（无论是否共享或是否在广场）
      // 点击后访问 /r/ 路径，拥有完整编辑权限
      filtered = uniqueRooms.filter(room => room.owner === (user?.id || 'anonymous') || room.ownerId === (user?.id || 'anonymous'))
      console.log('📝 我的白板过滤结果:', {
        totalRooms: uniqueRooms.length,
        myRooms: filtered.length,
        currentUser: user?.id || 'anonymous',
        myRoomsList: filtered.map(room => ({
          id: room.id,
          name: room.name,
          shared: room.shared,
          publish: room.publish
        }))
      })
    } else if (filterMode === 'shared') {
      // 共享白板 - 显示所有共享的房间（共享空间房间）
      // 点击后访问 /r/ 路径，权限受房间设置限制
      filtered = uniqueRooms.filter(room => room.shared === true)
      console.log('🌐 共享白板过滤结果:', {
        totalRooms: uniqueRooms.length,
        sharedRooms: filtered.length,
        currentUser: user?.id || 'anonymous',
        currentPath: window.location.pathname,
        sharedRoomsList: filtered.map(room => ({
          id: room.id,
          name: room.name,
          owner: room.ownerName,
          permission: room.permission,
          shared: room.shared,
          publish: room.publish
        }))
      })
    } else if (filterMode === 'published') {
      // 发布 - 显示所有发布房间的静态快照
      // 点击后访问 /p/ 路径，查看静态快照版本
      filtered = uniqueRooms.filter(room => room.publish === true)
      console.log('🏛️ 发布过滤结果:', {
        totalRooms: uniqueRooms.length,
        publishedRooms: filtered.length,
        currentUser: user?.id || 'anonymous',
        publishedRoomsList: filtered.map(room => ({
          id: room.id,
          name: room.name,
          owner: room.ownerName,
          publish: room.publish,
          shared: room.shared
        }))
      })
    } else if (filterMode === 'plaza') {
      // 广场 - 显示所有设为广场的房间
      // 点击后访问 /r/ 路径，权限受房间设置限制
      filtered = uniqueRooms.filter(room => room.plaza === true)
      console.log('🏛️ 广场过滤结果:', {
        totalRooms: uniqueRooms.length,
        plazaRooms: filtered.length,
        currentUser: user?.id || 'anonymous',
        plazaRoomsList: filtered.map(room => ({
          id: room.id,
          name: room.name,
          owner: room.ownerName,
          permission: room.permission,
          shared: room.shared,
          publish: room.publish,
          plaza: room.plaza
        }))
      })
    } else if (filterMode === 'all') {
      // 全部 - 只显示用户有权限访问的房间
      filtered = uniqueRooms.filter(room => {
        // 未登录：只显示发布与广场
        if (!user) {
          return room.publish === true || room.plaza === true
        }
        // 用户自己的房间
        if (room.owner === (user?.id || 'anonymous') || room.ownerId === (user?.id || 'anonymous')) {
          return true
        }
        // 共享给用户的房间
        if (room.shared === true) {
          return true
        }
        // 公开发布的房间
        if (room.publish === true) {
          return true
        }
        // 设为广场的房间
        if (room.plaza === true) {
          return true
        }
        return false
      })
      
      console.log('🔒 全部过滤结果 (权限控制):', {
        totalRooms: uniqueRooms.length,
        accessibleRooms: filtered.length,
        currentUser: user?.id || 'anonymous',
        accessibleRoomsList: filtered.map(room => ({
          id: room.id,
          name: room.name,
          owner: room.ownerName,
          permission: room.permission,
          shared: room.shared,
          publish: room.publish,
          plaza: room.plaza
        }))
      })
    }

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter(room => 
        room.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Apply sort
    return filtered.sort((a, b) => {
      switch (sortMode) {
        case 'recent':
          return b.lastModified - a.lastModified
        case 'name':
          return a.name.localeCompare(b.name)
        case 'created':
          return b.createdAt - a.createdAt
        default:
          return 0
      }
    })
  }, [rooms, filterMode, sortMode, searchTerm, user])


  // 处理房间切换，根据当前筛选模式确定访问路径
  const handleRoomChange = useCallback((roomId: string) => {
    let accessType: 'my' | 'shared' | 'published' | undefined
    
    // 根据当前筛选模式确定访问类型和路径：
    // - 'my' 和 'shared' 都访问 /r/ 路径（原始房间）
    // - 'published' 访问 /p/ 路径（静态快照）
    if (filterMode === 'my') {
      accessType = 'my'        // → /r/ 路径，完整编辑权限
    } else if (filterMode === 'shared') {
      accessType = 'shared'    // → /r/ 路径，权限受限
    } else if (filterMode === 'published') {
      // 对于发布房间，在新标签页打开发布页面
      const publishedSlug = localStorage.getItem(`publishedSlug_${roomId}`)
      if (publishedSlug) {
        console.log(`🎯 在新标签页打开发布页面: /p/${publishedSlug}`)
        window.open(`/p/${publishedSlug}`, '_blank')
        return
      } else {
        console.warn('⚠️ 未找到发布slug，使用房间ID在新标签页打开')
        window.open(`/p/${roomId}`, '_blank')
        return
      }
    } else if (filterMode === 'plaza') {
      accessType = 'shared'    // → /r/ 路径，权限受限，广场房间通常不给完整编辑权限
    }
    // filterMode === 'all' 时不传递 accessType，让系统自动判断
    
    console.log(`房间切换: ${roomId}, 访问类型: ${accessType}, 筛选模式: ${filterMode}`)
    onRoomChange(roomId, accessType)
  }, [filterMode, onRoomChange])

  const deleteRoom = useCallback(async (roomId: string) => {
    if (rooms.length <= 1) {
      alert('Cannot delete the last room')
      return
    }

    try {
      // 双重确认
      const first = confirm('确定要删除该白板吗？此操作不可恢复。')
      if (!first) return
      const second = confirm('再次确认：删除后将无法找回，确定继续？')
      if (!second) return

      // 使用roomUtils删除房间（仅房主/有权者应触发该操作，UI侧会控制）
      await roomUtils.deleteRoom(roomId)
      // 立即更新本地状态
      setRooms(prev => prev.filter(room => room.id !== roomId))
      
      // If deleting current room, switch to first available room
      if (roomId === currentRoomId) {
        const remainingRooms = rooms.filter(room => room.id !== roomId)
        if (remainingRooms.length > 0) {
          handleRoomChange(remainingRooms[0].id)
        }
      }
    } catch (error) {
      console.error('Error deleting room:', error)
      alert('删除房间失败')
    }
  }, [rooms, currentRoomId, handleRoomChange])

  const updateRoomLastModified = useCallback(async (roomId: string) => {
    try {
      // 使用roomUtils更新
      await roomUtils.updateRoomLastModified(roomId)
      // 立即更新本地状态
      setRooms(prev => prev.map(room => 
        room.id === roomId 
          ? { ...room, lastModified: Date.now() }
          : room
      ))
    } catch (error) {
      console.error('Error updating room last modified:', error)
    }
  }, [])

  // Expose updateRoomLastModified for external use
  useEffect(() => {
    ;(window as any).updateRoomLastModified = updateRoomLastModified
  }, [updateRoomLastModified])

  const renameRoom = useCallback(async (roomId: string, newName: string) => {
    if (!newName.trim()) return

    try {
      // 使用roomUtils更新
      await roomUtils.updateRoom(roomId, { name: newName.trim(), lastModified: Date.now() })
      // 立即更新本地状态
      setRooms(prev => prev.map(room => 
        room.id === roomId 
          ? { ...room, name: newName.trim(), lastModified: Date.now() }
          : room
      ))
    } catch (error) {
      console.error('Error renaming room:', error)
      alert('重命名房间失败')
    }
  }, [])

  const setCoverPage = useCallback(async (roomId: string, pageId: string) => {
    try {
      console.log(`Setting cover page for room ${roomId}, page ${pageId}`)
      
      const room = rooms.find(r => r.id === roomId)
      if (!room) {
        throw new Error(`Room not found: ${roomId}`)
      }
      
      const updatedRoom = {
        ...room,
        coverPageId: pageId,
        lastModified: Date.now()
      }
      
      // 使用roomUtils更新 (这会自动触发 roomsUpdated 事件)
      await roomUtils.updateRoom(roomId, updatedRoom)
      
      // 立即更新本地状态
      setRooms(prev => prev.map(r => 
        r.id === roomId 
          ? { ...r, coverPageId: pageId, lastModified: Date.now() }
          : r
      ))
      
      // 验证更新是否成功
      const verifyRoom = await roomUtils.getRoom(roomId)
      if (verifyRoom && verifyRoom.coverPageId === pageId) {
        console.log(`✅ Cover page successfully set for room ${roomId}, page ${pageId}`)
        
        // 清除所有相关的缓存缩略图，强制重新生成
        localStorage.removeItem(`thumbnail-${roomId}`)
        localStorage.removeItem(`room-thumbnail-${roomId}`)
        localStorage.removeItem(`gallery-thumbnail-${roomId}`)
        
        // 查找页面缩略图并更新到画廊缓存
        const pageThumbnail = localStorage.getItem(`page-thumbnail-${roomId}-${pageId}`) ||
                             localStorage.getItem(`gallery-page-thumbnail-${roomId}-${pageId}`)
        
        if (pageThumbnail) {
          // 保存到各种缓存位置，确保所有组件都能找到
          localStorage.setItem(`gallery-thumbnail-${roomId}`, pageThumbnail)
          localStorage.setItem(`thumbnail-${roomId}`, pageThumbnail)
          console.log(`✅ Updated gallery thumbnail cache for room ${roomId} with page ${pageId}`)
        }
        
        // 触发封面变化事件，通知所有缩略图组件立即更新
        window.dispatchEvent(new CustomEvent('coverChanged', { 
          detail: { roomId, coverPageId: pageId } 
        }))
        
        // 显示成功通知
        alert(`封面设置成功！已设置为页面: ${pageId}`)
      } else {
        console.error(`❌ Failed to set cover page for room ${roomId}, page ${pageId}`)
        alert('封面设置失败，请重试')
        throw new Error('Failed to update room cover')
      }
      
    } catch (error) {
      console.error('Error setting cover page:', error)
      alert('封面设置失败，请重试')
      throw error
    }
  }, [rooms])

  const publishRoom = useCallback(async (roomId: string) => {
    try {
      // 使用roomUtils共享房间
      await roomUtils.publishRoom(roomId)
      // 立即更新本地状态
      setRooms(prev => prev.map(room => 
        room.id === roomId 
          ? { ...room, publishStatus: 'shared', shared: true, lastModified: Date.now() }
          : room
      ))
    } catch (error) {
      console.error('Error publishing room:', error)
      alert('共享房间失败')
    }
  }, [])

  const unpublishRoom = useCallback(async (roomId: string) => {
    try {
      // 使用roomUtils取消共享房间
      await roomUtils.unpublishRoom(roomId)
      // 立即更新本地状态
      setRooms(prev => prev.map(room => 
        room.id === roomId 
          ? { ...room, publishStatus: 'private', shared: false, lastModified: Date.now() }
          : room
      ))
    } catch (error) {
      console.error('Error unpublishing room:', error)
      alert('取消共享房间失败')
    }
  }, [])

  const toggleRoomPublished = useCallback(async (roomId: string) => {
    const room = rooms.find(r => r.id === roomId)
    if (!room) return
    
    const newSharedState = !room.shared
    
    try {
      // 使用roomUtils更新共享状态
      await roomUtils.updateRoom(roomId, { published: newSharedState, lastModified: Date.now() })
      // 立即更新本地状态
      setRooms(prev => prev.map(room => 
        room.id === roomId 
          ? { ...room, published: newSharedState, lastModified: Date.now() }
          : room
      ))
    } catch (error) {
      console.error('Error toggling room published status:', error)
      alert('更改共享状态失败')
    }
  }, [rooms])

  const toggleRoomPlaza = useCallback(async (roomId: string) => {
    const room = rooms.find(r => r.id === roomId)
    if (!room) return
    
    console.log('🎨 toggleRoomPlaza 开始:', {
      roomId,
      roomName: room.name,
      currentPlaza: room.publish,
      published: room.shared
    })
    
    // 发布与共享是平行的，可以独立设置
    
    const newPlazaState = !room.publish
    
    try {
      // 使用roomUtils更新发布状态
      await roomUtils.setRoomPlaza(roomId, newPlazaState)
      console.log(`✅ 发布状态更新成功: ${room.name} -> publish: ${newPlazaState}`)
      
      // 立即更新本地状态
      setRooms(prev => {
        const updatedRooms = prev.map(room => 
          room.id === roomId 
            ? { ...room, publish: newPlazaState, lastModified: Date.now() }
            : room
        )
        console.log('🔄 本地房间状态已更新:', {
          totalRooms: updatedRooms.length,
          targetRoom: updatedRooms.find(r => r.id === roomId)
        })
        return updatedRooms
      })
      
      // 重新加载房间数据以确保与云端同步
      setTimeout(() => {
        console.log('🔄 重新加载房间数据以确保同步')
        loadRooms()
      }, 1000)
      
    } catch (error) {
      console.error('Error toggling room publish status:', error)
      alert('更改发布状态失败')
    }
  }, [rooms, loadRooms])

  const handleRename = (roomId: string, currentName: string) => {
    setEditingId(roomId)
    setEditingName(currentName)
  }

  const submitRename = () => {
    if (editingId && editingName.trim()) {
      renameRoom(editingId, editingName.trim())
    }
    setEditingId(null)
    setEditingName('')
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffTime = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
      return '今天'
    } else if (diffDays === 1) {
      return '昨天'
    } else if (diffDays < 7) {
      return `${diffDays}天前`
    } else {
      return date.toLocaleDateString()
    }
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#f8f9fa',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        padding: '1.5rem 2rem',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: 'white'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <h1 style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: '600',
            color: '#111827'
          }}>
            画廊
          </h1>
          {/* 顶部用户名/登录入口：点击进入“我的画廊”，未登录则弹出登录 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {user ? (
              <button
                onClick={() => {
                  try {
                    const uid = user?.id || 'anonymous'
                    ;(window as any).showUserGallery?.(uid)
                  } catch {}
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid #d1d5db',
                  borderRadius: '9999px',
                  padding: '6px 12px',
                  fontSize: '0.875rem',
                  color: '#2563eb',
                  cursor: 'pointer'
                }}
                title="我的画廊"
              >
                {user?.fullName || user?.username || '未登录'}
              </button>
            ) : (
              <SignInButton mode="modal">
                <button
                  style={{
                    background: 'transparent',
                    border: '1px solid #d1d5db',
                    borderRadius: '9999px',
                    padding: '6px 12px',
                    fontSize: '0.875rem',
                    color: '#ef4444',
                    cursor: 'pointer'
                  }}
                  title="未登录，点击登录"
                >
                  未登录
                </button>
              </SignInButton>
            )}
          
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                color: '#6b7280',
                padding: '0.5rem'
              }}
            >
              ×
            </button>
          )}
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          {[
            { key: 'all', label: '全部' },
            { key: 'my', label: '我的白板' },
            { key: 'shared', label: '共享白板' },
            { key: 'published', label: '发布白板' },
            { key: 'plaza', label: '广场' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                if (!user && (tab.key === 'my' || tab.key === 'shared')) {
                  try { openSignIn?.({}); } catch {}
                  return
                }
                setFilterMode(tab.key as FilterMode)
              }}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: filterMode === tab.key ? '#3b82f6' : 'transparent',
                color: !user && (tab.key === 'my' || tab.key === 'shared')
                  ? '#9ca3af' // 登录前提示性样式更浅
                  : (filterMode === tab.key ? 'white' : '#6b7280'),
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
              title={!user && (tab.key === 'my' || tab.key === 'shared') ? '登录后查看' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索白板..."
              style={{
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                width: '200px'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* View mode toggle */}
            <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '6px' }}>
              <button
                onClick={() => setViewMode('card')}
                style={{
                  padding: '0.5rem',
                  backgroundColor: viewMode === 'card' ? '#f3f4f6' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '6px 0 0 6px'
                }}
              >
                ⊞
              </button>
              <button
                onClick={() => setViewMode('list')}
                style={{
                  padding: '0.5rem',
                  backgroundColor: viewMode === 'list' ? '#f3f4f6' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '0 6px 6px 0'
                }}
              >
                ☰
              </button>
            </div>

            {/* Sort dropdown */}
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              style={{
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem'
              }}
            >
              <option value="recent">最近修改</option>
              <option value="name">名称</option>
              <option value="created">创建时间</option>
            </select>
          </div>
        </div>
      </div>


      {/* Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '1rem 2rem'
      }}>
        {viewMode === 'card' ? (
          <CardView 
            rooms={filteredAndSortedRooms}
            currentRoomId={currentRoomId}
            onRoomChange={handleRoomChange}
            onRoomDelete={deleteRoom}
            onRoomRename={renameRoom}
            formatDate={formatDate}
            formatTime={formatTime}
            editingId={editingId}
            editingName={editingName}
            handleRename={handleRename}
            submitRename={submitRename}
            setEditingId={setEditingId}
            setEditingName={setEditingName}
            onClose={onClose}
            setCoverSelectorRoom={setCoverSelectorRoom}
            toggleRoomPublished={toggleRoomPublished}
            toggleRoomPlaza={toggleRoomPlaza}
            isRoomOwner={isRoomOwner}
            hasEditPermission={hasEditPermission}
            getCurrentUserPermission={getCurrentUserPermission}
            filterMode={filterMode}
            starredMap={starredMap}
            onToggleStar={toggleStar}
            setShareRoomId={(id: string) => setShareRoomId(id)}
          />
        ) : (
          <ListView 
            rooms={filteredAndSortedRooms}
            currentRoomId={currentRoomId}
            onRoomChange={handleRoomChange}
            onRoomDelete={deleteRoom}
            onRoomRename={renameRoom}
            formatDate={formatDate}
            formatTime={formatTime}
            editingId={editingId}
            editingName={editingName}
            handleRename={handleRename}
            submitRename={submitRename}
            setEditingId={setEditingId}
            setEditingName={setEditingName}
            onClose={onClose}
            setCoverSelectorRoom={setCoverSelectorRoom}
            toggleRoomPublished={toggleRoomPublished}
            toggleRoomPlaza={toggleRoomPlaza}
            isRoomOwner={isRoomOwner}
            hasEditPermission={hasEditPermission}
            getCurrentUserPermission={getCurrentUserPermission}
            filterMode={filterMode}
            starredMap={starredMap}
            onToggleStar={toggleStar}
            setShareRoomId={(id: string) => setShareRoomId(id)}
          />
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '1rem 2rem',
        borderTop: '1px solid #e5e7eb',
        backgroundColor: 'white',
        fontSize: '0.875rem',
        color: '#6b7280'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {filterMode === 'my' && `共 ${filteredAndSortedRooms.length} 个我的白板`}
            {filterMode === 'shared' && `共 ${filteredAndSortedRooms.length} 个已共享的白板`}
            {filterMode === 'published' && `共 ${filteredAndSortedRooms.length} 个发布白板`}
            {filterMode === 'plaza' && `共 ${filteredAndSortedRooms.length} 个广场白板`}
            {filterMode === 'all' && `共 ${filteredAndSortedRooms.length} 个白板`}
          </div>
          {user && (
            <UserStatsDisplay userId={user.id} />
          )}
        </div>
      </div>

      {/* Cover Page Selector Modal */}
      {coverSelectorRoom && (
        <CoverPageSelector
          room={coverSelectorRoom}
          onSelectCover={(pageId) => setCoverPage(coverSelectorRoom.id, pageId)}
          onClose={() => setCoverSelectorRoom(null)}
          isModal={true}
        />
      )}
      {/* 房间设置：直接在画廊内弹窗，editor 可为空，仅用于房间信息编辑 */}
      {roomSettingsRoomId && (
        <RoomSettings
          isOpen={true}
          onClose={() => setRoomSettingsRoomId(null)}
          roomId={roomSettingsRoomId}
          editor={undefined}
        />
      )}

      {roomInfoModal && (
        <RoomInfo
          room={roomInfoModal}
          onClose={() => setRoomInfoModal(null)}
          onRoomUpdate={() => {}}
        />
      )}
      {/* 分享面板（画廊内弹出） */}
      {shareRoomId && (
        <SharePanel
          isOpen={true}
          onClose={() => setShareRoomId(null)}
          roomId={shareRoomId}
          editor={undefined}
        />
      )}
    </div>
  )
}

// User Stats Display Component
function UserStatsDisplay({ userId }: { userId: string }) {
  const userStats = roomUserStatsManager.getUserStatsSummary(userId)
  
  return (
    <div style={{ 
      display: 'flex', 
      gap: '1rem', 
      alignItems: 'center',
      fontSize: '0.8rem',
      color: '#6b7280'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <span>⭐</span>
        <span>{userStats.totalStars}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <span>👁️</span>
        <span>{userStats.totalVisits}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <span>🔗</span>
        <span>{userStats.totalShares}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <span>💬</span>
        <span>{userStats.totalComments}</span>
      </div>
    </div>
  )
}

// Room Stats Display Component
function RoomStatsDisplay({ roomId }: { roomId: string }) {
  const roomStats = roomUserStatsManager.getRoomStatsSummary(roomId)
  
  return (
    <>
      {roomStats.totalStars > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span>⭐</span>
          <span>{roomStats.totalStars}</span>
        </div>
      )}
      {roomStats.totalVisits > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span>👁️</span>
          <span>{roomStats.totalVisits}</span>
        </div>
      )}
      {roomStats.totalShares > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span>🔗</span>
          <span>{roomStats.totalShares}</span>
        </div>
      )}
      {roomStats.totalComments > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span>💬</span>
          <span>{roomStats.totalComments}</span>
        </div>
      )}
    </>
  )
}

// Card View Component
function CardView({ 
  rooms, 
  currentRoomId, 
  onRoomChange, 
  onRoomDelete, 
  onRoomRename, 
  formatDate, 
  formatTime,
  editingId,
  editingName,
  handleRename,
  submitRename,
  setEditingId,
  setEditingName,
  onClose,
  setCoverSelectorRoom,
  toggleRoomPublished,
  toggleRoomPlaza,
  isRoomOwner,
  hasEditPermission,
  getCurrentUserPermission,
  filterMode,
  starredMap,
  onToggleStar,
  setShareRoomId
}: {
  rooms: Room[]
  currentRoomId: string
  onRoomChange: (roomId: string, accessType?: 'my' | 'shared' | 'published') => void
  filterMode: FilterMode
  onRoomDelete: (roomId: string) => void
  onRoomRename: (roomId: string, newName: string) => void
  formatDate: (timestamp: number) => string
  formatTime: (timestamp: number) => string
  editingId: string | null
  editingName: string
  handleRename: (roomId: string, currentName: string) => void
  submitRename: () => void
  setEditingId: (id: string | null) => void
  setEditingName: (name: string) => void
  onClose?: () => void
  setCoverSelectorRoom: (room: Room | null) => void
  toggleRoomPublished: (roomId: string) => void
  toggleRoomPlaza: (roomId: string) => void
  isRoomOwner: (room: Room) => boolean
  hasEditPermission: (room: Room) => boolean
  getCurrentUserPermission: (room: Room) => 'owner' | 'editor' | 'viewer',
  starredMap: Record<string, boolean>,
  onToggleStar: (roomId: string) => void,
  setShareRoomId: (roomId: string) => void
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: '1rem'
    }}>
      {rooms.map(room => (
        <div
          key={room.id}
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: 'white',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: room.id === currentRoomId ? '0 0 0 2px #3b82f6' : '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
          }}
          onClick={() => {
            onRoomChange(room.id)
            onClose?.()
          }}
        >
          {/* Thumbnail */}
          <div style={{
            height: '150px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <RoomThumbnail 
              roomId={room.id} 
              width={280} 
              height={150}
              onClick={() => {
                onRoomChange(room.id)
                onClose?.()
              }}
            />
          </div>

          {/* Content */}
          <div style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                {editingId === room.id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={submitRename}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        submitRename()
                      } else if (e.key === 'Escape') {
                        setEditingId(null)
                        setEditingName('')
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      padding: '0.25rem',
                      border: '1px solid #3b82f6',
                      borderRadius: '4px',
                      fontSize: '1rem',
                      fontWeight: '600'
                    }}
                    autoFocus
                  />
                ) : (
                  <h3 style={{
                    margin: 0,
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#111827',
                    marginBottom: '0.5rem'
                  }}>
                    {room.name}
                  </h3>
                )}

                {/* 元信息：房主 + 时间 */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.5rem', color: '#6b7280', fontSize: '0.875rem' }}>
                  <span>
                    房主：
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        try {
                          const uid = room.ownerId || room.owner
                          ;(window as any).showUserGallery?.(uid)
                        } catch {}
                      }}
                      title={`查看 ${room.ownerName || '用户'} 的画廊`}
                      style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0 }}
                    >
                      {room.ownerName || room.ownerId}
                    </button>
                  </span>
                  <span>· {formatDate(room.lastModified)} {formatTime(room.lastModified)}</span>
                </div>

                {/* 房间统计数据 */}
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem', color: '#6b7280', fontSize: '0.8rem' }}>
                  <RoomStatsDisplay roomId={room.id} />
                </div>

                {room.shared && (
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#10b981',
                    fontWeight: '500',
                    marginBottom: '0.5rem'
                  }}>
                    🌐 已共享
                  </div>
                )}

                {room.publish && (
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#f59e0b',
                    fontWeight: '500',
                    marginBottom: '0.5rem'
                  }}>
                    🏛️ 发布房间
                  </div>
                )}
              </div>

              {/* 收藏 / 分享 / 删除（删除仅房主显示，且双重确认） */}
              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                {/* 收藏 */}
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleStar(room.id) }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', fontSize: '0.875rem',
                    color: starredMap[room.id] ? '#f59e0b' : '#6b7280'
                  }}
                  title={starredMap[room.id] ? '取消收藏' : '收藏'}
                >
                  {starredMap[room.id] ? '★' : '☆'}
                </button>

                {/* 分享：统一打开当前房间的分享入口（复用顶栏行为） */}
                <button
                  onClick={(e) => { e.stopPropagation(); setShareRoomId(room.id) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', fontSize: '0.875rem', color: '#2563eb' }}
                  title="分享"
                >
                  🔗
                </button>

                {/* 删除（只对房主显示） */}
                {isRoomOwner(room) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRoomDelete(room.id) }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', fontSize: '0.875rem',
                      color: '#ef4444'
                    }}
                    title="删除"
                  >
                    🗑️
                  </button>
                )}

              {SHOW_ROOM_CARD_ACTIONS && (
                <>
                
                {/* 重命名 - 只有有编辑权限的用户才能重命名 */}
                {hasEditPermission(room) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRename(room.id, room.name)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#6b7280',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      fontSize: '0.875rem'
                    }}
                    title="重命名"
                  >
                    ✏️
                  </button>
                )}
                
                {/* 设置封面 - 只有有编辑权限的用户才能设置封面 */}
                {hasEditPermission(room) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setCoverSelectorRoom(room)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#6b7280',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      fontSize: '0.875rem'
                    }}
                    title="设置封面"
                  >
                    🖼️
                  </button>
                )}
                
                {/* 共享/取消共享 - 只有房主才能共享 */}
                {isRoomOwner(room) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleRoomPublished(room.id)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: room.shared ? '#10b981' : '#6b7280',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      fontSize: '0.875rem'
                    }}
                    title={room.shared ? "取消共享" : "共享"}
                  >
                    {room.shared ? '🌐' : '🔒'}
                  </button>
                )}
                
                {/* 发布/取消发布 - 只有房主才能设置 */}
                {isRoomOwner(room) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleRoomPlaza(room.id)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: room.publish ? '#f59e0b' : '#6b7280',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      fontSize: '0.875rem'
                    }}
                    title={room.publish ? "取消发布" : "设为发布"}
                  >
                    {room.publish ? '🏛️' : '🏠'}
                  </button>
                )}
                
                {/* 删除 - 只有房主才能删除，且不能删除默认房间 */}
                {isRoomOwner(room) && room.id !== 'default-room' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRoomDelete(room.id)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      fontSize: '0.875rem'
                    }}
                    title="删除"
                  >
                    🗑️
                  </button>
                )}
                </>
              )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// List View Component
function ListView({ 
  rooms, 
  currentRoomId, 
  onRoomChange, 
  onRoomDelete, 
  onRoomRename, 
  formatDate, 
  formatTime,
  editingId,
  editingName,
  handleRename,
  submitRename,
  setEditingId,
  setEditingName,
  onClose,
  setCoverSelectorRoom,
  toggleRoomPublished,
  toggleRoomPlaza,
  isRoomOwner,
  hasEditPermission,
  getCurrentUserPermission,
  starredMap,
  onToggleStar,
  setShareRoomId
}: {
  rooms: Room[]
  currentRoomId: string
  onRoomChange: (roomId: string) => void
  onRoomDelete: (roomId: string) => void
  onRoomRename: (roomId: string, newName: string) => void
  formatDate: (timestamp: number) => string
  formatTime: (timestamp: number) => string
  editingId: string | null
  editingName: string
  handleRename: (roomId: string, currentName: string) => void
  submitRename: () => void
  setEditingId: (id: string | null) => void
  setEditingName: (name: string) => void
  onClose?: () => void
  setCoverSelectorRoom: (room: Room | null) => void
  toggleRoomPublished: (roomId: string) => void
  toggleRoomPlaza: (roomId: string) => void
  isRoomOwner: (room: Room) => boolean
  hasEditPermission: (room: Room) => boolean
  getCurrentUserPermission: (room: Room) => 'owner' | 'editor' | 'viewer'
  starredMap: Record<string, boolean>
  onToggleStar: (roomId: string) => void
  setShareRoomId: (roomId: string) => void
}) {
  return (
    <div style={{
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      overflow: 'hidden',
      backgroundColor: 'white'
    }}>
      {/* Table Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 160px 150px 150px 100px',
        gap: '1rem',
        padding: '0.75rem 1rem',
        backgroundColor: '#f9fafb',
        borderBottom: '1px solid #e5e7eb',
        fontSize: '0.875rem',
        fontWeight: '500',
        color: '#6b7280'
      }}>
        <div>名称</div>
        <div>房主</div>
        <div>修改时间</div>
        <div>创建时间</div>
        <div>操作</div>
      </div>

      {/* Table Body */}
      {rooms.map(room => (
        <div
          key={room.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 160px 150px 150px 100px',
            gap: '1rem',
            padding: '0.75rem 1rem',
            borderBottom: '1px solid #f3f4f6',
            cursor: 'pointer',
            backgroundColor: room.id === currentRoomId ? '#eff6ff' : 'white',
            transition: 'background-color 0.2s ease'
          }}
          onClick={() => {
            onRoomChange(room.id)
            onClose?.()
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <RoomThumbnail roomId={room.id} width={40} height={30} />
            <div>
              {editingId === room.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={submitRename}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      submitRename()
                    } else if (e.key === 'Escape') {
                      setEditingId(null)
                      setEditingName('')
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: '100%',
                    padding: '0.25rem',
                    border: '1px solid #3b82f6',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                  autoFocus
                />
              ) : (
                <div>
                  <div style={{
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    color: '#111827'
                  }}>
                    {room.name}
                  </div>
                  {room.shared && (
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#10b981',
                      fontWeight: '500'
                    }}>
                      🌐 已共享
                    </div>
                  )}
                  {room.publish && (
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#f59e0b',
                      fontWeight: '500'
                    }}>
                      🏛️ 发布房间
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 房主列 */}
          <div style={{ display: 'flex', alignItems: 'center', color: '#2563eb', fontSize: '0.875rem' }}>
            <button
              onClick={(e) => {
                e.stopPropagation()
                try { (window as any).showUserGallery?.(room.ownerId || room.owner) } catch {}
              }}
              style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0 }}
              title={`查看 ${room.ownerName || '用户'} 的画廊`}
            >
              {room.ownerName || room.ownerId}
            </button>
          </div>

          <div style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center'
          }}>
            {formatDate(room.lastModified)}
          </div>

          <div style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center'
          }}>
            {formatDate(room.createdAt)}
          </div>

          <div style={{
            display: 'flex',
            gap: '0.25rem',
            alignItems: 'center'
          }}>
            {/* 收藏 */}
                <button
              onClick={(e) => { e.stopPropagation(); onToggleStar(room.id) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', fontSize: '0.875rem',
                color: starredMap[room.id] ? '#f59e0b' : '#6b7280'
              }}
              title={starredMap[room.id] ? '取消收藏' : '收藏'}
            >
              {starredMap[room.id] ? '★' : '☆'}
            </button>
            {/* 分享 */}
            <button
              onClick={(e) => { e.stopPropagation(); setShareRoomId(room.id) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', fontSize: '0.875rem', color: '#2563eb' }}
              title="分享"
            >
              🔗
            </button>

            {/* 删除（只对房主显示） */}
            {isRoomOwner(room) && (
              <button
                onClick={(e) => { e.stopPropagation(); onRoomDelete(room.id) }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', fontSize: '0.875rem',
                  color: '#ef4444'
                }}
                title="删除"
              >
                🗑️
              </button>
            )}

          {SHOW_ROOM_CARD_ACTIONS && (
            <>
              {/* 重命名 */}
              {hasEditPermission(room) && (
                <button onClick={(e) => { e.stopPropagation(); handleRename(room.id, room.name) }}
                  style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '0.25rem', fontSize: '0.875rem' }} title="重命名">✏️</button>
              )}
              {/* 设置封面 */}
              {hasEditPermission(room) && (
                <button onClick={(e) => { e.stopPropagation(); setCoverSelectorRoom?.(room) }}
                  style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '0.25rem', fontSize: '0.875rem' }} title="设置封面">🖼️</button>
              )}
              {/* 共享/取消共享 */}
              {isRoomOwner(room) && (
                <button onClick={(e) => { e.stopPropagation(); toggleRoomPublished(room.id) }}
                  style={{ background: 'none', border: 'none', color: room.shared ? '#10b981' : '#6b7280', cursor: 'pointer', padding: '0.25rem', fontSize: '0.875rem' }} title={room.shared ? '取消共享' : '共享'}>
                  {room.shared ? '🌐' : '🔒'}
                </button>
              )}
              {/* 发布/取消发布 */}
              {isRoomOwner(room) && (
                <button onClick={(e) => { e.stopPropagation(); toggleRoomPlaza(room.id) }}
                  style={{ background: 'none', border: 'none', color: room.publish ? '#f59e0b' : '#6b7280', cursor: 'pointer', padding: '0.25rem', fontSize: '0.875rem' }} title={room.publish ? '取消广场' : '设为广场'}>
                  {room.publish ? '🏛️' : '🏠'}
                </button>
              )}
              {/* 删除 */}
              {isRoomOwner(room) && room.id !== 'default-room' && (
                <button onClick={(e) => { e.stopPropagation(); onRoomDelete(room.id) }}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.25rem', fontSize: '0.875rem' }} title="删除">🗑️</button>
              )}
            </>
          )}
          </div>
        </div>
      ))}
    </div>
  )
}