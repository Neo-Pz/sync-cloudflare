// Current Room Info - 当前房间信息展示组件
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useUser } from '@clerk/clerk-react'
import { Editor, useEditor } from 'tldraw'
import { roomStatsAggregator, RoomStats, formatInteractionTime, formatCount } from './roomStatsAggregator'
import { interactionTracker, trackStar, trackComment, trackShare, getRecentVisitors } from './interactionTracker'
import { roomUserStatsManager } from './roomUserStatsManager'
import { SharePanel } from './SharePanel'
// RoomSettings 入口已在画廊提供，这里不再引入
import { roomUtils } from './roomUtils'
import { formatPermissionInfo, type PermissionInfo } from './permissionUtils'
import { followSystem, type UserFollowStats } from './followSystem'

interface CurrentRoomInfoProps {
  roomId: string
  editor?: Editor | null
  onClose?: () => void
  onShowUserGallery?: (targetUserId: string) => void
  onShowRoomManager?: () => void
  permission?: 'viewer' | 'editor' | 'assist'
}

export function CurrentRoomInfo({ roomId, editor, onClose, onShowUserGallery, onShowRoomManager, permission = 'editor' }: CurrentRoomInfoProps) {
  const { user } = useUser()
  
  // 获取用户信息 - 必须在所有useEffect之前声明
  const userId = user?.id || 'anonymous'
  // 优先使用邮箱前缀作为用户名
  const userName = user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 
                   user?.fullName || 
                   user?.username || 
                   'Anonymous'
  
  // 移除useEditor调用，因为组件现在在Tldraw外部
  // 立即初始化默认统计数据，避免加载状态
  const [roomStats, setRoomStats] = useState<RoomStats | null>(() => ({
    roomId,
    roomName: roomId === 'default-room' ? 'Welcome Board' : `Room ${roomId}`,
    ownerName: 'System',
    ownerId: 'system',
    description: '默认房间',
    tags: ['default'],
    published: true,
    shared: false,
    permission: 'editor',
    historyLocked: false,
    createdAt: Date.now(),
    lastModified: Date.now(),
    totalStars: 0,
    totalShares: 0,
    totalComments: 0,
    totalVisits: 1,
    userHasStarred: false,
    userHasShared: false,
    userHasCommented: false,
    userHasVisited: true,
    userVisitCount: 1,
    recentComments: [],
    recentStars: [],
    recentShares: []
  }))
  const [isLoading, setIsLoading] = useState(false)
  const [quickStats, setQuickStats] = useState<{ starCount: number, shareCount: number, commentCount: number } | null>(null)
  const [newComment, setNewComment] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [showCommentBox, setShowCommentBox] = useState(false)
  const [showSharePanel, setShowSharePanel] = useState(false)
  // 收藏状态（与画廊中的收藏状态保持一致）
  const [isStarred, setIsStarred] = useState(false)
  // 房间设置入口已移至画廊
  // 允许外部触发分享面板（画廊分享按钮）
  useEffect(() => {
    const handler = (e: Event) => {
      const { roomId: targetId } = (e as CustomEvent).detail || {}
      // 若不传或传匹配当前房间都打开
      if (!targetId || targetId === roomId) setShowSharePanel(true)
    }
    window.addEventListener('openSharePanel', handler as EventListener)
    return () => window.removeEventListener('openSharePanel', handler as EventListener)
  }, [roomId])
  
  // 初始化收藏状态
  useEffect(() => {
    try {
      // 优先从新的统计管理器获取数据
      const isStarredInStats = roomUserStatsManager.hasUserStarredRoom(userId, roomId)
      setIsStarred(isStarredInStats)
      
      // 如果新统计管理器没有数据，则从旧系统获取（向后兼容）
      if (!isStarredInStats) {
        const metrics = interactionTracker.getMetrics?.(roomId)
        setIsStarred(!!metrics?.isStarred)
      }
    } catch {
      setIsStarred(false)
    }
  }, [roomId, userId])

  // 加载房间快速统计 - 必须在使用之前声明，避免“Cannot access before initialization”
  const loadQuickStats = useCallback(async () => {
    try {
      const roomStats = roomUserStatsManager.getRoomStatsSummary(roomId)
      console.log('📈 从统计管理器加载房间统计:', roomStats)
      setQuickStats({
        starCount: roomStats.totalStars,
        shareCount: roomStats.totalShares,
        commentCount: roomStats.totalComments,
      })
    } catch (error) {
      console.error('加载统计数据失败:', error)
      setQuickStats({ starCount: 0, shareCount: 0, commentCount: 0 })
    }
  }, [roomId])

  // 监听收藏状态变化（当用户在其他地方如画廊中收藏/取消收藏时同步更新）
  useEffect(() => {
    const handleStarChange = (event: Event) => {
      const customEvent = event as CustomEvent
      const { roomId: changedRoomId, starred } = customEvent.detail || {}
      if (changedRoomId === roomId) {
        setIsStarred(!!starred)
        // 重新加载统计数据
        loadQuickStats()
      }
    }
    
    window.addEventListener('starChanged', handleStarChange)
    return () => window.removeEventListener('starChanged', handleStarChange)
  }, [roomId, loadQuickStats])

  // 监听统计数据变化
  useEffect(() => {
    const handleStatsChange = () => {
      loadQuickStats()
    }
    
    window.addEventListener('roomStatsChanged', handleStatsChange)
    return () => window.removeEventListener('roomStatsChanged', handleStatsChange)
  }, [loadQuickStats])
  
  // 房间设置入口已移至画廊，不再监听
  const [isRoomOwner, setIsRoomOwner] = useState(false)
  // 移除内部的isPopoverOpen状态，改为始终显示面板内容
  const popoverRef = useRef<HTMLDivElement>(null)
  
  // 关注系统相关状态
  const [followStats, setFollowStats] = useState<UserFollowStats>({
    followingCount: 0,
    followersCount: 0,
    isFollowing: false
  })
  const [isLoadingFollow, setIsLoadingFollow] = useState(false)

  // 添加 roomPermissionData 状态以保持与 App.tsx 同步
  const [roomPermissionData, setRoomPermissionData] = useState<{
    published: boolean, 
    permission: 'viewer' | 'editor' | 'assist', 
    historyLocked?: boolean,
  } | null>(null)

  // 加载完整房间统计（以房间设置为准，从本地数据源同步） - 必须在所有useEffect之前声明
  const loadRoomStats = useCallback(async () => {
    try {
      let room = await roomUtils.getRoom(roomId)
      
      // 如果房间不存在且用户已登录，创建新房间
      if (!room && user) {
        console.log(`🏗️ 房间 ${roomId} 不存在，创建新房间`)
        const newRoom = {
          id: roomId,
          name: `Room ${roomId}`, // 默认名称，用户可以在设置中修改
          createdAt: Date.now(),
          lastModified: Date.now(),
          owner: user.id,
          ownerId: user.id,
          ownerName: user.fullName || user.firstName || user.username || 'User',
          isShared: false,
          shared: false,
          published: false,
          permission: 'editor' as const,
          publishStatus: 'private' as const,
          description: '',
          tags: [],
          publish: false
        }
        
        await roomUtils.addRoom(newRoom)
        room = newRoom
        console.log(`✅ 新房间创建完成:`, newRoom.name)
      }
      
      const roomName = room?.name || (roomId === 'default-room' ? 'Welcome Board' : `Room ${roomId}`)
      const ownerName = (room as any)?.ownerName || user?.fullName || user?.firstName || 'System'
      const ownerId = (room as any)?.ownerId || user?.id || 'system'
      const description = (room as any)?.description || ''
      const tags = Array.isArray((room as any)?.tags) ? (room as any).tags : []
      // 仅使用 publish 作为"发布"的依据
      const published = !!((room as any)?.publish || (room as any)?.published)
      const shared = !!(room as any)?.shared
      const permission = (room as any)?.permission || 'editor'
      const historyLocked = !!(room as any)?.historyLocked
      const createdAt = (room as any)?.createdAt || Date.now()
      const lastModified = (room as any)?.lastModified || Date.now()

      setRoomStats({
        roomId,
        roomName,
        ownerName,
        ownerId,
        description,
        tags,
        published,
        shared,
        permission,
        historyLocked,
        createdAt,
        lastModified,
        totalStars: 0,
        totalShares: 0,
        totalComments: 0,
        totalVisits: 1,
        userHasStarred: false,
        userHasShared: false,
        userHasCommented: false,
        userHasVisited: true,
        userVisitCount: 1,
        recentComments: [],
        recentStars: [],
        recentShares: []
      })
    } catch (err) {
      console.error('Failed to load room stats from local room data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [roomId, userId, user])

  // 加载房主关注数据 - 必须在所有useEffect之前声明
  const loadOwnerFollowStats = useCallback(async () => {
    try {
      if (!roomStats?.ownerId) return
      const stats = await followSystem.getUserFollowStats(roomStats.ownerId, userId)
      setFollowStats(stats)
    } catch (e) {
      setFollowStats({ followingCount: 0, followersCount: 0, isFollowing: false })
    }
  }, [roomStats?.ownerId, userId])

  // 处理关注/取消关注房主 - 必须在所有useEffect之前声明
  const handleToggleFollowOwner = useCallback(async () => {
    if (!user || !roomStats?.ownerId || roomStats.ownerId === userId) return
    
    setIsLoadingFollow(true)
    try {
      const userName = user.fullName || user.firstName || user.username || 'User'
      const ownerName = roomStats.ownerName || 'Unknown'
      
      if (followStats.isFollowing) {
        await followSystem.unfollowUser(userId, roomStats.ownerId)
      } else {
        await followSystem.followUser(userId, userName, roomStats.ownerId, ownerName)
      }
      
      // 重新加载关注数据
      await loadOwnerFollowStats()
    } catch (error) {
      console.error('Error toggling follow:', error)
    } finally {
      setIsLoadingFollow(false)
    }
  }, [user, userId, roomStats?.ownerId, roomStats?.ownerName, followStats.isFollowing, loadOwnerFollowStats])

  // 点击外部关闭面板
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // 检查点击的是否是按钮本身
      const target = event.target as Node
      const buttonElement = document.querySelector('[data-testid="current-room-button"]')
      
      
             // 房间设置面板已移除
      
       // 检查是否点击了分享面板
       const sharePanelModal = document.querySelector('.share-panel-modal')
       if (sharePanelModal && sharePanelModal.contains(target)) {
         return // 如果点击了分享面板，不关闭面板
       }
      
      if (popoverRef.current && 
          !popoverRef.current.contains(target) && 
          !buttonElement?.contains(target)) {
        // 通过全局函数关闭面板
        if ((window as any).toggleCurrentRoomExpansion) {
          (window as any).toggleCurrentRoomExpansion()
        }
      }
    }

    // 始终监听点击外部事件
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // 初始加载快速统计和房间统计
  useEffect(() => {
    console.log('🚀 CurrentRoomInfo: 初始化加载房间数据')
    loadQuickStats()
    loadRoomStats() // 确保房间统计也被加载
  }, [loadQuickStats, loadRoomStats])

  // 监听房间更新事件
  useEffect(() => {
    const handleRoomUpdate = () => {
      loadQuickStats()
      loadRoomStats() // 始终加载房间统计
    }

    window.addEventListener('roomsUpdated', handleRoomUpdate)
    window.addEventListener('roomDataChanged', handleRoomUpdate)
    
    return () => {
      window.removeEventListener('roomsUpdated', handleRoomUpdate)
      window.removeEventListener('roomDataChanged', handleRoomUpdate)
    }
  }, [loadQuickStats, loadRoomStats])


  // 加载完整统计和权限设置
  useEffect(() => {
    loadRoomStats()
    loadOwnerFollowStats()
    
    // 同时从 roomUtils 获取最新的权限设置 - 临时禁用
    console.log('🔐 权限设置加载已临时禁用')
    // 设置默认权限，避免API调用
    setRoomPermissionData({
      published: true,
      permission: 'editor',
      historyLocked: false,
    })
  }, [loadRoomStats, loadOwnerFollowStats, roomId])
  
  // 监听房间权限变化
  useEffect(() => {
    const handleRoomDataChanged = (event: CustomEvent) => {
      const detail = event.detail
      if (detail && detail.roomId === roomId) {
        console.log('Room data changed detected in CurrentRoomInfo:', detail)
        loadRoomStats()
        
        if (detail.permission) {
          setRoomPermissionData(prev => ({
            ...prev,
            permission: detail.permission,
            published: detail.published !== undefined ? detail.published : prev?.published || false,
            historyLocked: detail.historyLocked !== undefined ? detail.historyLocked : prev?.historyLocked || false,
          }))
        }
      }
    }
    
    window.addEventListener('roomDataChanged', handleRoomDataChanged as EventListener)
    return () => {
      window.removeEventListener('roomDataChanged', handleRoomDataChanged as EventListener)
    }
  }, [roomId, loadRoomStats])

  // 权限模式描述函数
  const getPermissionDescription = (permission: 'viewer' | 'editor' | 'assist', historyLocked?: boolean) => {
    switch (permission) {
      case 'editor':
        return '可以完全修改和删除所有内容'
      case 'assist':
        return historyLocked 
          ? '只能新增内容，不能修改历史内容' 
          : '可以添加或修改内容，但权限受限'
      case 'viewer':
      default:
        return '只能查看，不能编辑内容'
    }
  }

  // 检查用户是否为房间所有者
  useEffect(() => {
    const checkOwnership = async () => {
      if (!user || !roomId) return
      
      try {
        const room = await roomUtils.getRoom(roomId)
        if (room) {
          setIsRoomOwner(room.ownerId === user.id || room.owner === user.id)
        }
      } catch (error) {
        console.error('Error checking room ownership:', error)
      }
    }
    
    checkOwnership()
  }, [user, roomId])

  // 刷新数据
  const handleRefresh = useCallback(async () => {
    setIsLoading(true)
    try {
      await roomStatsAggregator.refreshRoomStats(roomId, userId)
      await loadQuickStats()
      await loadRoomStats()
    } catch (error) {
      console.error('Error refreshing stats:', error)
    } finally {
      setIsLoading(false)
    }
  }, [roomId, userId, loadQuickStats, loadRoomStats])

  // 打开房主画廊
  const handleOwnerClick = useCallback(() => {
    if (roomStats?.ownerId && onShowUserGallery) {
      onShowUserGallery(roomStats.ownerId)
      // 通过全局函数关闭面板
      if ((window as any).toggleCurrentRoomExpansion) {
        (window as any).toggleCurrentRoomExpansion()
      }
    }
  }, [roomStats?.ownerId, onShowUserGallery])

  // 切换收藏状态（与画廊中的收藏逻辑保持一致）
  const handleToggleStar = useCallback(async () => {
    // 检查用户是否已登录
    if (!user) {
      alert('请先登录后再收藏房间')
      return
    }
    
    const newStarredState = !isStarred
    
    console.log(`🌟 Toggling star: ${roomId} by ${userId} (${userName}) - ${newStarredState ? 'starring' : 'unstarring'}`)
    
    try {
      // 使用与画廊相同的逻辑：直接调用 interactionTracker.toggleStar
      await interactionTracker.toggleStar(roomId, userId, userName, newStarredState)
      
      // 立即更新本地状态
      setIsStarred(newStarredState)
      
      // 同时更新快速统计中的收藏数（可选，用于UI显示）
      setQuickStats(prev => prev ? {
        ...prev,
        starCount: newStarredState ? prev.starCount + 1 : Math.max(0, prev.starCount - 1)
      } : null)
      
      // 触发全局事件，通知其他组件收藏状态已变化
      window.dispatchEvent(new CustomEvent('starChanged', {
        detail: { roomId, starred: newStarredState }
      }))
      
      console.log(`✅ Star toggled successfully: ${roomId} <-> ${userId}`)
      
    } catch (error) {
      console.error('Error toggling star:', error)
      alert('收藏操作失败，请重试')
    }
  }, [user, roomId, userId, userName, isStarred])

  // 提交评论
  const handleSubmitComment = useCallback(async () => {
    // 检查用户是否已登录
    if (!user) {
      alert('请先登录后再发表评论')
      return
    }
    
    if (!newComment.trim()) return
    
    console.log(`💬 Submitting comment: ${roomId} by ${userId} (${userName})`)
    
    setIsSubmittingComment(true)
    try {
      // 提交到数据库
      const response = await fetch(`/api/rooms/${roomId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          userName,
          userEmail: user.emailAddresses?.[0]?.emailAddress,
          comment: newComment.trim()
        })
      })

      if (response.ok) {
        // 记录用户与房间的互动关系
        await trackComment(roomId, userId, userName, newComment.trim())
        console.log(`✅ Comment submitted and recorded: ${roomId} <-> ${userId}`)
        
        setNewComment('')
        setShowCommentBox(false)
        
        // 刷新数据以显示新评论
        await loadRoomStats()
        await loadQuickStats()
      } else {
        throw new Error('评论提交失败')
      }
    } catch (error) {
      console.error('Error submitting comment:', error)
      alert('评论提交失败，请重试')
    } finally {
      setIsSubmittingComment(false)
    }
  }, [user, roomId, userId, userName, newComment, loadRoomStats, loadQuickStats])

  // 基础按钮样式
  const buttonStyle = {
    background: '#f8f9fa',
    border: '1px solid #e9ecef',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'all 0.2s ease'
  }

  const primaryButtonStyle = {
    ...buttonStyle,
    background: '#007bff',
    color: 'white',
    border: '1px solid #007bff'
  }

  return (
    <div 
      onClick={() => console.log('CurrentRoomInfo容器被点击')}
      style={{ 
        position: 'fixed',
        top: '45px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',  // 水平居中
        gap: '8px', 
        // 移除背景色和边框，使用原生UI样式
        borderRadius: '8px',
        padding: '0.25rem 0.75rem',
        minHeight: '40px',
        minWidth: '300px',
        zIndex: 1002, // 高于容器的zIndex
        pointerEvents: 'auto', // 确保可以接收点击事件
        cursor: 'auto'
      }}>
      {/* 当前房间信息面板 - 直接显示内容 */}
      <div style={{ position: 'relative' }}>
        <div
          ref={popoverRef}
          style={{
            position: 'static',
            minWidth: '320px',
            maxWidth: '400px',
            maxHeight: '70vh', // 限制最大高度为视口高度的70%
            overflowY: 'auto', // 添加垂直滚动
            background: 'white',
            border: '1px solid #e9ecef',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000
          }}
        >
            {/* 顶层交互统计和刷新按钮 */}
            {quickStats && roomStats && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid #f3f4f6'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}>
                  {/* 浏览次数 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    color: '#6b7280',
                    fontSize: '14px',
                    fontWeight: '500',
                    padding: '4px',
                    borderRadius: '4px',
                    backgroundColor: '#f9fafb'
                  }}>
                    <span>👁️</span>
                    <span>{formatCount(quickStats ? roomUserStatsManager.getRoomStatsSummary(roomId).totalVisits : 0)}</span>
                    <span style={{ fontSize: '12px', color: '#9ca3af' }}>访问</span>
                  </div>
                  
                  {/* 收藏 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      handleToggleStar()
                    }}
                    style={{
                      background: isStarred ? '#fef3c7' : 'none',
                      border: '1px solid',
                      borderColor: isStarred ? '#f59e0b' : '#e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: isStarred ? '#f59e0b' : '#9ca3af',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = isStarred ? '#fde68a' : '#f9fafb'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isStarred ? '#fef3c7' : 'transparent'
                    }}
                    title={isStarred ? '取消收藏' : '收藏房间'}
                  >
                    <span>{isStarred ? '⭐' : '☆'}</span>
                    <span>{formatCount(quickStats?.starCount || 0)}</span>
                    <span style={{ fontSize: '12px' }}>收藏</span>
                  </button>
                  
                  {/* 分享 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      setShowSharePanel((prev) => !prev)
                    }}
                    style={{
                      background: showSharePanel ? '#dbeafe' : 'none',
                      border: '1px solid',
                      borderColor: showSharePanel ? '#3b82f6' : '#e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#3b82f6',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = showSharePanel ? '#bfdbfe' : '#f9fafb'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = showSharePanel ? '#dbeafe' : 'transparent'
                    }}
                    title="分享房间"
                  >
                    <span>🔗</span>
                    <span>{formatCount(quickStats.shareCount || 0)}</span>
                    <span style={{ fontSize: '12px' }}>分享</span>
                  </button>
                  
                  {/* 设置按钮已移除，统一在画廊中提供入口 */}
                </div>
                
                {/* 刷新按钮 */}
                <button
                  onClick={handleRefresh}
                  disabled={isLoading}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    color: '#6b7280',
                    opacity: isLoading ? 0.5 : 1,
                    padding: '4px',
                    borderRadius: '4px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) {
                      e.currentTarget.style.backgroundColor = '#f9fafb'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                  title="刷新数据"
                >
                  🔄
                </button>
              </div>
            )}

            {/* 面板内容 */}
            <div style={{ padding: '16px' }}>

              {roomStats ? (
                <div>
                  {/* 房间名称 */}
                  <div style={{
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#111827',
                    marginBottom: '12px',
                    borderBottom: '2px solid #f3f4f6',
                    paddingBottom: '8px'
                  }}>
                    {roomStats.roomName}
                  </div>
                  
                  {/* 房主信息 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    <button
                      onClick={handleOwnerClick}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#3b82f6',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0
                      }}
                      title="查看房主的画廊"
                    >
                      {roomStats.ownerName}
                    </button>
                    
                    {/* 关注按钮 - 只在查看其他用户房间时显示 */}
                    {user && roomStats.ownerId !== userId && (
                      <button
                        onClick={handleToggleFollowOwner}
                        disabled={isLoadingFollow}
                        style={{
                          background: followStats.isFollowing ? '#ef4444' : '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: isLoadingFollow ? 'not-allowed' : 'pointer',
                          opacity: isLoadingFollow ? 0.6 : 1,
                          transition: 'background-color 0.2s ease'
                        }}
                        title={followStats.isFollowing ? '取消关注' : '关注房主'}
                      >
                        {isLoadingFollow ? '...' : (followStats.isFollowing ? '取消关注' : '关注')}
                      </button>
                    )}
                  </div>

                  {/* 最近访客 */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '6px' }}>最近访客</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {getRecentVisitors(roomId, 8).map((v) => (
                        <span
                          key={v.userId}
                          style={{
                            fontSize: '12px',
                            color: '#374151',
                            background: '#f3f4f6',
                            padding: '2px 6px',
                            borderRadius: '999px',
                          }}
                          title={new Date(v.lastAt).toLocaleString('zh-CN')}
                        >
                          {v.userName || v.userId}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 状态显示：已发布/未发布 | plaza | edit/assist/view */}
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{ color: '#6b7280' }}>状态：</span>
                      {(() => {
                        // 判断发布选项（仅使用 publish 字段）
                        const publishOptions = []
                        const isShared = (roomStats as any).shared
                        const isPublished = (roomStats as any).publish || roomStats.published
                        
                        // 调试日志
                        console.log('🔍 状态显示调试:', {
                          roomId: roomStats.roomId,
                          shared: (roomStats as any).shared,
                          published: (roomStats as any).publish ?? roomStats.published,
                          publish: (roomStats as any).publish,
                          isShared,
                          isPublished
                        })
                        
                        if (isShared) publishOptions.push('共享')
                        if (isPublished) publishOptions.push('发布')
                        
                        // 判断权限设置
                        const permissionMap = {
                          'editor': { label: '编辑', color: '#059669' },
                          'assist': { label: '辅作', color: '#f59e0b' },
                          'viewer': { label: '浏览', color: '#6b7280' }
                        }
                        
                        const permission = permissionMap[roomStats.permission] || permissionMap.viewer
                        
                        return (
                          <>
                            {/* 发布选项部分 */}
                            {publishOptions.length > 0 && (
                              <>
                                <span style={{ 
                                  color: isPublished ? '#065f46' : '#3b82f6' 
                                }}>
                                  {publishOptions.join(' ')}
                                </span>
                                <span style={{ color: '#6b7280' }}>|</span>
                              </>
                            )}
                            
                            {/* 权限设置部分 */}
                            <span style={{ color: permission.color }}>
                              {permission.label}
                            </span>
                          </>
                        )
                      })()}
                    </div>
                    
                    {/* 历史锁定提示 */}
                    {roomStats.historyLocked && (
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#f59e0b',
                        marginTop: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <span>🔒</span>
                        <span>历史已锁定</span>
                      </div>
                    )}
                  </div>

                  {/* 房间简介 */}
                  {roomStats.description && (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#374151',
                        marginBottom: '4px'
                      }}>
                        📝 简介
                      </div>
                      <div style={{
                        fontSize: '14px',
                        color: '#6b7280',
                        lineHeight: '1.4',
                        padding: '8px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '4px'
                      }}>
                        {roomStats.description}
                      </div>
                    </div>
                  )}

                  {/* 标签 */}
                  {roomStats.tags && roomStats.tags.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#374151',
                        marginBottom: '4px'
                      }}>
                        🏷️ 标签
                      </div>
                      <div style={{
                        display: 'flex',
                        gap: '4px',
                        flexWrap: 'wrap'
                      }}>
                        {roomStats.tags.map((tag, index) => (
                          <span
                            key={index}
                            style={{
                              fontSize: '12px',
                              padding: '2px 6px',
                              backgroundColor: '#e5e7eb',
                              color: '#374151',
                              borderRadius: '4px'
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 评论区域 */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: '#374151',
                      marginBottom: '8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!user) {
                              alert('请先登录后再发表评论')
                              return
                            }
                            setShowCommentBox(!showCommentBox)
                          }}
                          style={{
                            background: showCommentBox ? '#dcfce7' : 'transparent',
                            border: '1px solid #10b981',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            color: '#059669',
                            cursor: 'pointer',
                            fontWeight: '500'
                          }}
                          title="添加评论"
                        >
                          {showCommentBox ? '📝 编写中' : '💬 添加评论'}
                        </button>
                      </div>
                    </div>
                    
                    {/* 评论输入框 */}
                    {showCommentBox && (
                      <div style={{ marginBottom: '12px' }}>
                        <textarea
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder="分享你的想法..."
                          style={{
                            width: '100%',
                            minHeight: '60px',
                            padding: '8px',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '12px',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            boxSizing: 'border-box'
                          }}
                          maxLength={500}
                        />
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: '8px'
                        }}>
                          <span style={{
                            fontSize: '10px',
                            color: '#9ca3af'
                          }}>
                            {newComment.length}/500
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => {
                                setShowCommentBox(false)
                                setNewComment('')
                              }}
                              style={{
                                background: 'transparent',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '12px',
                                color: '#6b7280',
                                cursor: 'pointer'
                              }}
                            >
                              取消
                            </button>
                            <button
                              onClick={handleSubmitComment}
                              disabled={!newComment.trim() || isSubmittingComment}
                              style={{
                                background: !newComment.trim() || isSubmittingComment ? '#f3f4f6' : '#10b981',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '12px',
                                color: !newComment.trim() || isSubmittingComment ? '#9ca3af' : 'white',
                                cursor: !newComment.trim() || isSubmittingComment ? 'not-allowed' : 'pointer',
                                fontWeight: '500'
                              }}
                            >
                              {isSubmittingComment ? '提交中...' : '提交'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* 最新评论列表 */}
                    {roomStats.recentComments.length > 0 && (
                      <div style={{
                        maxHeight: '120px',
                        overflowY: 'auto'
                      }}>
                        {roomStats.recentComments.slice(0, 3).map((comment, index) => (
                          <div
                            key={index}
                            style={{
                              padding: '8px',
                              backgroundColor: '#f9fafb',
                              borderRadius: '4px',
                              marginBottom: '4px',
                              fontSize: '12px'
                            }}
                          >
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              marginBottom: '4px'
                            }}>
                              <span style={{
                                fontWeight: '500',
                                color: '#374151'
                              }}>
                                {comment.userName}
                              </span>
                              <span style={{
                                color: '#9ca3af'
                              }}>
                                {formatInteractionTime(comment.timestamp)}
                              </span>
                            </div>
                            <div style={{
                              color: '#6b7280',
                              lineHeight: '1.3'
                            }}>
                              {comment.comment}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  {/* 显示基本房间信息，即使没有完整统计 */}
                  <div style={{
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#111827',
                    marginBottom: '12px',
                    borderBottom: '2px solid #f3f4f6',
                    paddingBottom: '8px'
                  }}>
                    {roomId === 'default-room' ? 'Welcome Board' : `Room ${roomId}`}
                  </div>
                  
                  <div style={{
                    fontSize: '14px',
                    color: '#6b7280',
                    marginBottom: '16px'
                  }}>
                    正在加载房间详细信息...
                  </div>
                  
                  {/* 基本操作按钮 */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setShowSharePanel(true)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 12px',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      🔗 分享
                    </button>
                    
                    {/* 设置按钮已移除，统一在画廊中提供入口 */}
                  </div>
                </div>
              )}
            </div>
          </div>
      </div>



      {/* Share Panel 弹窗 */}
      {showSharePanel && (
        <SharePanel
          isOpen={showSharePanel}
          onClose={() => setShowSharePanel(false)}
          roomId={roomId}
          editor={editor}
        />
      )}

      {/* 房间设置入口移除 */}

    </div>
  )
}