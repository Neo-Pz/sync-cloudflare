import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { interactionTracker } from './interactionTracker'
import { useUser } from '@clerk/clerk-react'
import { RoomThumbnail } from './RoomThumbnail'
import { roomUtils } from './roomUtils'
import { followSystem, type FollowRelationship, type UserFollowStats } from './followSystem'
import { SharePanel } from './SharePanel'
import { RoomInfo } from './RoomInfo'
import { RoomSettings } from './RoomSettings'
import type { Room as GalleryRoom } from './RoomManager'

// Extended Room interface with user relationship tracking
export interface UserRoom {
  id: string
  name: string
  createdAt: number
  lastModified: number
  ownerId: string
  ownerName: string
  permission: 'viewer' | 'editor' | 'assist'
  publish: boolean
  thumbnail?: string
  coverPageId?: string
  description?: string
  tags?: string[]
  
  // User relationship tracking
  relationshipType: 'owner' | 'collaborator' | 'visitor'
  userRole: 'creator' | 'editor' | 'assistant' | 'visitor'
  
  // Collaboration tracking
  collaborators: {
    userId: string
    userName: string
    role: 'editor' | 'assistant'
    joinedAt: number
    lastActive: number
  }[]
  
  // Interaction tracking
  interactions: {
    userId: string
    userName: string
    visited: boolean
    visitedAt?: number
    starred: boolean
    starredAt?: number
    commented: boolean
    lastCommentAt?: number
    reported: boolean
    reportedAt?: number
    shared: boolean
    sharedAt?: number
  }[]
}

interface UserRoomProps {
  currentUserId?: string
  targetUserId?: string // If viewing another user's gallery
  onRoomChange: (roomId: string, accessType?: 'my' | 'shared' | 'plaza') => void
  onClose?: () => void
  onShowUserGallery?: (targetUserId: string) => void // 统一的画廊查看函数
}

type ViewMode = 'card' | 'list'
type SortMode = 'recent' | 'name' | 'created'
type CategoryMode = 'all' | 'collaboration' | 'interaction' | 'following' | 'followers'
type CollaborationType = 'created' | 'edited' | 'assisted'
type InteractionType = 'visited' | 'starred' | 'commented' | 'reported' | 'shared'

export function UserRoom({ currentUserId, targetUserId, onRoomChange, onClose, onShowUserGallery }: UserRoomProps) {
  const { user, isLoaded } = useUser()
  const [userRooms, setUserRooms] = useState<UserRoom[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('card')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [categoryMode, setCategoryMode] = useState<CategoryMode>('all')
  const [collaborationFilter, setCollaborationFilter] = useState<CollaborationType | 'all'>('all')
  const [interactionFilter, setInteractionFilter] = useState<InteractionType | 'all'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [shareRoomId, setShareRoomId] = useState<string | null>(null)
  
  // 关注系统相关状态
  const [followStats, setFollowStats] = useState<UserFollowStats>({
    followingCount: 0,
    followersCount: 0,
    isFollowing: false
  })
  const [followingList, setFollowingList] = useState<FollowRelationship[]>([])
  const [followersList, setFollowersList] = useState<FollowRelationship[]>([])
  const [isLoadingFollows, setIsLoadingFollows] = useState(false)

  const [roomInfoModal, setRoomInfoModal] = useState<GalleryRoom | null>(null)
  const [roomSettingsRoomId, setRoomSettingsRoomId] = useState<string | null>(null)
  
  // 监听从缩略图发来的“openRoomInfo”事件，行为与RoomManager保持一致
  useEffect(() => {
    const handler = (e: Event) => {
      const { roomId } = (e as CustomEvent).detail || {}
      if (!roomId) return
      const room = userRooms.find(r => r.id === roomId)
      if (!room) return
      const isOwner = currentUserId === room.ownerId
      if (isOwner) {
        setRoomSettingsRoomId(roomId)
      } else {
        // 映射到GalleryRoom结构
        setRoomInfoModal({
          id: room.id,
          name: room.name,
          createdAt: room.createdAt,
          lastModified: room.lastModified,
          owner: room.ownerId,
          ownerId: room.ownerId,
          ownerName: room.ownerName || '',
          isShared: false,
          shared: false,
          published: room.publish,
          permission: room.permission as any,
          thumbnail: room.thumbnail,
          coverPageId: room.coverPageId
        })
      }
    }
    window.addEventListener('openRoomInfo', handler as EventListener)
    return () => window.removeEventListener('openRoomInfo', handler as EventListener)
  }, [userRooms, currentUserId])

  const userId = currentUserId || user?.id || 'anonymous'
  const isViewingOtherUser = targetUserId && targetUserId !== userId
  const displayUserId = targetUserId || userId

  // 统一的用户画廊处理函数
  const handleUserGalleryClick = useCallback((targetUserId: string) => {
    // 如果提供了回调函数，使用回调函数
    if (onShowUserGallery) {
      onShowUserGallery(targetUserId)
    } else {
      // 回退到全局函数（向后兼容）
      if ((window as any).showUserGallery) {
        (window as any).showUserGallery(targetUserId)
      }
    }
    // 只有在非关注/粉丝列表模式下才关闭当前画廊
    // 在关注/粉丝列表中点击用户名时，不应该关闭画廊，而是切换到目标用户画廊
    if (categoryMode !== 'followers' && categoryMode !== 'following') {
      onClose?.()
    }
  }, [onShowUserGallery, onClose, categoryMode])

  // 加载关注数据
  const loadFollowData = useCallback(async () => {
    if (!displayUserId) return
    
    setIsLoadingFollows(true)
    try {
      const [stats, following, followers] = await Promise.all([
        followSystem.getUserFollowStats(displayUserId, userId),
        followSystem.getFollowingList(displayUserId),
        followSystem.getFollowersList(displayUserId)
      ])
      
      setFollowStats(stats)
      setFollowingList(following)
      setFollowersList(followers)
    } catch (error) {
      console.error('Error loading follow data:', error)
    } finally {
      setIsLoadingFollows(false)
    }
  }, [displayUserId, userId])

  // 处理关注/取消关注
  const handleToggleFollow = useCallback(async () => {
    if (!user || !displayUserId || displayUserId === userId) return
    
    try {
      const userName = user.fullName || user.firstName || user.username || 'User'
      const targetUserName = followStats.isFollowing ? 'Unknown' : 'Unknown' // 这里可以从房间数据中获取
      
      if (followStats.isFollowing) {
        await followSystem.unfollowUser(userId, displayUserId)
      } else {
        await followSystem.followUser(userId, userName, displayUserId, targetUserName)
      }
      
      // 重新加载关注数据
      await loadFollowData()
    } catch (error) {
      console.error('Error toggling follow:', error)
    }
  }, [user, userId, displayUserId, followStats.isFollowing, loadFollowData])

  // 处理取消关注
  const handleUnfollow = useCallback(async (followerId: string, followingId: string) => {
    try {
      await followSystem.unfollowUser(followerId, followingId)
      // 重新加载关注数据
      await loadFollowData()
    } catch (error) {
      console.error('Error unfollowing user:', error)
    }
  }, [loadFollowData])

  // 处理移除粉丝
  const handleRemoveFollower = useCallback(async (followerId: string, followingId: string) => {
    try {
      await followSystem.unfollowUser(followerId, followingId)
      // 重新加载关注数据
      await loadFollowData()
    } catch (error) {
      console.error('Error removing follower:', error)
    }
  }, [loadFollowData])

  // 处理添加备注
  const handleAddNote = useCallback(async (userId: string, note: string) => {
    try {
      // 这里可以添加备注功能，暂时只是console.log
      console.log('Adding note for user:', userId, 'Note:', note)
      // 重新加载关注数据
      await loadFollowData()
    } catch (error) {
      console.error('Error adding note:', error)
    }
  }, [loadFollowData])

  // Load user rooms and relationships
  const loadUserRooms = useCallback(async () => {
    setIsLoading(true)
    try {
      // 首先清理已删除的房间
      await roomUtils.forceCleanupDeletedRooms()
      
      // Get all rooms from storage
      const allRooms = await roomUtils.getAllRooms()
      
      // Get user relationships data from localStorage or API
      const userRelationships = JSON.parse(localStorage.getItem(`user-relationships-${displayUserId}`) || '{}')
      
      // 统一改为从 interactionTracker 读取当前登录用户的互动（收藏/访问/评论/分享）
      // 这样与缩略图上的“收藏”按钮、房间信息面板保持一致
      const metrics = interactionTracker.getAllMetrics?.() || []
      const userInteractions: Record<string, any> = {}
      for (const m of metrics) {
        userInteractions[m.roomId] = {
          visited: m.visitCount > 0,
          visitedAt: m.lastVisitAt,
          starred: m.isStarred,
          starredAt: m.starredAt,
          commented: m.hasCommented,
          lastCommentAt: m.lastCommentAt,
          shared: m.hasShared,
          sharedAt: m.lastSharedAt
        }
      }
      
      // Transform rooms to UserRoom format with relationship data
      const userRoomsData: UserRoom[] = allRooms.map(room => {
        const relationship = userRelationships[room.id] || { type: 'visitor', role: 'visitor' }
        const interactions = userInteractions[room.id] || {}
        
        // Determine relationship type and role
        let relationshipType: 'owner' | 'collaborator' | 'visitor' = 'visitor'
        let userRole: 'creator' | 'editor' | 'assistant' | 'visitor' = 'visitor'
        
        if (room.ownerId === displayUserId) {
          relationshipType = 'owner'
          userRole = 'creator'
        } else if (relationship.role === 'editor' || relationship.role === 'assistant') {
          relationshipType = 'collaborator'
          userRole = relationship.role
        }
        
        // published 可能在存储中缺省，这里统一补默认值 false，避免类型不兼容
        return {
          ...room,
  publish: !!(room as any).publish,
          relationshipType,
          userRole,
          collaborators: relationship.collaborators || [],
          interactions: [
            {
              userId: displayUserId,
              userName: user?.fullName || user?.firstName || 'User',
              visited: !!interactions.visited,
              visitedAt: interactions.visitedAt,
              starred: !!interactions.starred,
              starredAt: interactions.starredAt,
              commented: !!interactions.commented,
              lastCommentAt: interactions.lastCommentAt,
              reported: !!interactions.reported,
              reportedAt: interactions.reportedAt,
              shared: !!interactions.shared,
              sharedAt: interactions.sharedAt
            }
          ]
        }
      })
      
      // Filter rooms based on user relationships
      const filteredRooms = userRoomsData.filter(room => {
        // Always include owned rooms
        if (room.relationshipType === 'owner') return true
        
        // Include collaborated rooms
        if (room.relationshipType === 'collaborator') return true
        
        // Include rooms with interactions
        const hasInteractions = room.interactions[0] && (
          room.interactions[0].visited ||
          room.interactions[0].starred ||
          room.interactions[0].commented ||
          room.interactions[0].shared
        )
        if (hasInteractions) return true
        
  // Include published rooms if viewing other user's gallery
  if (isViewingOtherUser && (room as any).publish) return true
        
        return false
      })
      
      setUserRooms(filteredRooms)
    } catch (error) {
      console.error('Error loading user rooms:', error)
      setUserRooms([])
    } finally {
      setIsLoading(false)
    }
  }, [displayUserId, isViewingOtherUser, user])

  useEffect(() => {
    if (isLoaded) {
      loadUserRooms()
      loadFollowData()
    }
  }, [loadUserRooms, loadFollowData, isLoaded])

  // Update interaction when user visits a room
  const updateInteraction = useCallback(async (roomId: string, interactionType: InteractionType) => {
    try {
      const userInteractions = JSON.parse(localStorage.getItem(`user-interactions-${userId}`) || '{}')
      
      if (!userInteractions[roomId]) {
        userInteractions[roomId] = {}
      }
      
      userInteractions[roomId][interactionType] = true
      userInteractions[roomId][`${interactionType}At`] = Date.now()
      
      // Special handling for visit tracking
      if (interactionType === 'visited') {
        userInteractions[roomId].visitCount = (userInteractions[roomId].visitCount || 0) + 1
      }
      
      localStorage.setItem(`user-interactions-${userId}`, JSON.stringify(userInteractions))
      
      // Reload user rooms to reflect the change
      loadUserRooms()
    } catch (error) {
      console.error('Error updating interaction:', error)
    }
  }, [userId, loadUserRooms])

  // Filter and sort rooms
  const filteredAndSortedRooms = useMemo(() => {
    let filtered = userRooms

    // Apply category filter
    if (categoryMode === 'collaboration') {
      filtered = userRooms.filter(room => 
        room.relationshipType === 'owner' || room.relationshipType === 'collaborator'
      )
      
      // Apply collaboration sub-filter
      if (collaborationFilter !== 'all') {
        filtered = filtered.filter(room => {
          switch (collaborationFilter) {
            case 'created':
              return room.userRole === 'creator'
            case 'edited':
              return room.userRole === 'editor'
            case 'assisted':
              return room.userRole === 'assistant'
            default:
              return true
          }
        })
      }
    } else if (categoryMode === 'interaction') {
      filtered = userRooms.filter(room => {
        const interaction = room.interactions[0]
        if (!interaction) return false
        
        return interaction.visited || interaction.starred || 
               interaction.commented || interaction.shared
      })
      
      // Apply interaction sub-filter
      if (interactionFilter !== 'all') {
        filtered = filtered.filter(room => {
          const interaction = room.interactions[0]
          if (!interaction) return false
          
          switch (interactionFilter) {
            case 'visited':
              return interaction.visited
            case 'starred':
              return interaction.starred
            case 'commented':
              return interaction.commented
            case 'reported':
              return interaction.reported
            case 'shared':
              return interaction.shared
            default:
              return true
          }
        })
      }
    }

    // Apply search
    if (searchTerm) {
      filtered = filtered.filter(room => 
        room.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        room.ownerName.toLowerCase().includes(searchTerm.toLowerCase())
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
  }, [userRooms, categoryMode, collaborationFilter, interactionFilter, searchTerm, sortMode])

  const handleRoomClick = useCallback((roomId: string) => {
    // 优先尝试从本地映射找到发布slug，若存在则在新标签打开发布页；否则进入编辑页
    const publishedSlug = localStorage.getItem(`publishedSlug_${roomId}`)
    updateInteraction(roomId, 'visited')
    if (publishedSlug) {
      window.open(`/p/${publishedSlug}`, '_blank')
      return
    }
    onRoomChange(roomId)
    onClose?.()
  }, [updateInteraction, onRoomChange, onClose])

  const toggleStar = useCallback((roomId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    
    const room = userRooms.find(r => r.id === roomId)
    const isStarred = room?.interactions[0]?.starred
    
    if (isStarred) {
      // Remove star
      const userInteractions = JSON.parse(localStorage.getItem(`user-interactions-${userId}`) || '{}')
      if (userInteractions[roomId]) {
        userInteractions[roomId].starred = false
        delete userInteractions[roomId].starredAt
        localStorage.setItem(`user-interactions-${userId}`, JSON.stringify(userInteractions))
      }
    } else {
      // Add star
      updateInteraction(roomId, 'starred')
    }
  }, [userRooms, userId, updateInteraction])

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '400px',
        color: '#6b7280'
      }}>
        Loading user rooms...
      </div>
    )
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
            {isViewingOtherUser ? '用户画廊' : '我的画廊'}
          </h1>
          {/* 右侧显示用户ID */}
          <div style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ color: '#9ca3af' }}>用户ID:</span>
            <code style={{
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              padding: '2px 6px',
              color: '#374151'
            }}>{displayUserId}</code>
            {isViewingOtherUser && (
              <button
                onClick={handleToggleFollow}
                title={followStats.isFollowing ? '已关注' : '关注'}
                disabled={isLoadingFollows}
                style={{
                  background: followStats.isFollowing ? '#10b981' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: isLoadingFollows ? 'not-allowed' : 'pointer',
                  opacity: isLoadingFollows ? 0.6 : 1
                }}
              >
                {isLoadingFollows ? '...' : (followStats.isFollowing ? '已关注' : '关注')}
              </button>
            )}
          </div>
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

        {/* Category tabs */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          {[
            { key: 'all', label: '全部' },
            { key: 'collaboration', label: '协作' },
            { key: 'interaction', label: '互动' },
            { key: 'following', label: `关注 (${followStats.followingCount})` },
            { key: 'followers', label: `粉丝 (${followStats.followersCount})` }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setCategoryMode(tab.key as CategoryMode)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: categoryMode === tab.key ? '#3b82f6' : 'transparent',
                color: categoryMode === tab.key ? 'white' : '#6b7280',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sub-filters */}
        {categoryMode === 'collaboration' && (
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1rem'
          }}>
            {[
              { key: 'all', label: '全部' },
              { key: 'created', label: '创建' },
              { key: 'edited', label: '编辑' },
              { key: 'assisted', label: '辅作' }
            ].map(filter => (
              <button
                key={filter.key}
                onClick={() => setCollaborationFilter(filter.key as CollaborationType | 'all')}
                style={{
                  padding: '0.25rem 0.75rem',
                  backgroundColor: collaborationFilter === filter.key ? '#10b981' : '#f3f4f6',
                  color: collaborationFilter === filter.key ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '500'
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}

        {categoryMode === 'interaction' && (
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1rem'
          }}>
            {[
              { key: 'all', label: '全部' },
              { key: 'visited', label: '访问过' },
              { key: 'starred', label: '收藏' },
              { key: 'commented', label: '评论' },
              { key: 'shared', label: '分享' }
            ].map(filter => (
              <button
                key={filter.key}
                onClick={() => setInteractionFilter(filter.key as InteractionType | 'all')}
                style={{
                  padding: '0.25rem 0.75rem',
                  backgroundColor: interactionFilter === filter.key ? '#f59e0b' : '#f3f4f6',
                  color: interactionFilter === filter.key ? 'white' : '#374151',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '500'
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}

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
              placeholder="搜索房间或创建者..."
              style={{
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '0.875rem',
                width: '250px'
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
                 {/* 关注列表 */}
         {categoryMode === 'following' && (
           <FollowingListView
             followingList={followingList}
             onUserClick={handleUserGalleryClick}
             onUnfollow={handleUnfollow}
           />
         )}
        
                 {/* 粉丝列表 */}
         {categoryMode === 'followers' && (
           <FollowersListView
             followersList={followersList}
             onUserClick={handleUserGalleryClick}
             onRemoveFollower={handleRemoveFollower}
             onAddNote={handleAddNote}
           />
         )}
        
        {/* 房间列表 */}
        {(categoryMode === 'all' || categoryMode === 'collaboration' || categoryMode === 'interaction') && (
          viewMode === 'card' ? (
            <UserRoomCardView 
              userRooms={filteredAndSortedRooms}
              onRoomClick={handleRoomClick}
              onToggleStar={toggleStar}
              onDelete={async (roomId: string) => {
                const a = confirm('确定删除该白板？')
                if (!a) return
                const b = confirm('再次确认：删除后无法恢复，是否继续？')
                if (!b) return
                await roomUtils.deleteRoom(roomId)
                // 重新加载
                loadUserRooms()
              }}
              onShare={(roomId: string) => setShareRoomId(roomId)}
              onOwnerClick={(ownerId: string) => handleUserGalleryClick(ownerId)}
              userId={userId}
            />
          ) : (
            <UserRoomListView 
              userRooms={filteredAndSortedRooms}
              onRoomClick={handleRoomClick}
              onToggleStar={toggleStar}
              onShare={(roomId: string) => setShareRoomId(roomId)}
              onDelete={async (roomId: string) => {
                const a = confirm('确定删除该白板？')
                if (!a) return
                const b = confirm('再次确认：删除后无法恢复，是否继续？')
                if (!b) return
                await roomUtils.deleteRoom(roomId)
                loadUserRooms()
              }}
              onOwnerClick={(ownerId: string) => handleUserGalleryClick(ownerId)}
              userId={userId}
            />
          )
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
        {categoryMode === 'collaboration' && `共 ${filteredAndSortedRooms.length} 个协作房间`}
        {categoryMode === 'interaction' && `共 ${filteredAndSortedRooms.length} 个互动房间`}
        {categoryMode === 'all' && `共 ${filteredAndSortedRooms.length} 个相关房间`}
        {categoryMode === 'following' && `共 ${followingList.length} 个关注用户`}
        {categoryMode === 'followers' && `共 ${followersList.length} 个粉丝`}
      </div>

      {/* Share panel (align with gallery) */}
      {shareRoomId && (
        <SharePanel isOpen={true} onClose={() => setShareRoomId(null)} roomId={shareRoomId} editor={undefined} />
      )}

      {/* 房间设置（用户画廊内弹出） */}
      {roomSettingsRoomId && (
        <RoomSettings
          isOpen={true}
          onClose={() => setRoomSettingsRoomId(null)}
          roomId={roomSettingsRoomId}
          editor={undefined}
        />
      )}

      {/* 房间信息（用户画廊内弹出） */}
      {roomInfoModal && (
        <RoomInfo
          room={roomInfoModal}
          onClose={() => setRoomInfoModal(null)}
          onRoomUpdate={() => {}}
        />
      )}
    </div>
  )
}

// Card View Component for UserRoom
function UserRoomCardView({ 
  userRooms, 
  onRoomClick,
  onToggleStar,
  onDelete,
  onShare,
  onOwnerClick,
  userId
}: {
  userRooms: UserRoom[]
  onRoomClick: (roomId: string) => void
  onToggleStar: (roomId: string, event: React.MouseEvent) => void
  onDelete: (roomId: string) => void
  onShare: (roomId: string) => void
  onOwnerClick: (ownerId: string) => void
  userId: string
}) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffTime = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return '今天'
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays}天前`
    return date.toLocaleDateString()
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '1rem'
    }}>
      {userRooms.map(room => {
        const interaction = room.interactions[0]
        const isStarred = interaction?.starred || false
        
        return (
          <div
            key={room.id}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden',
              backgroundColor: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
              width: '100%',
              flexShrink: 0
            }}
            onClick={() => onRoomClick(room.id)}
          >
            {/* Thumbnail */}
            <div style={{
              height: '150px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
              <RoomThumbnail 
                roomId={room.id} 
                width={300} 
                height={150}
              />
            </div>

            {/* Content */}
            <div style={{ padding: '1rem' }}>
              <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: '0.25rem'
                }}>
                  {room.name}
                </h3>
                {/* 操作区：与画廊一致 */}
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  <button onClick={(e) => onToggleStar(room.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', fontSize: '0.875rem', color: isStarred ? '#f59e0b' : '#9ca3af' }} title={isStarred ? '取消收藏' : '收藏'}>
                    {isStarred ? '★' : '☆'}
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onShare(room.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', fontSize: '0.875rem', color: '#2563eb' }} title="分享">🔗</button>
                  {room.userRole === 'creator' && (
                    <button onClick={(e) => { e.stopPropagation(); const a = confirm('确定删除该白板？'); if (!a) return; const b = confirm('再次确认：删除后无法恢复，是否继续？'); if (!b) return; onDelete(room.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', fontSize: '0.875rem', color: '#ef4444' }} title="删除">🗑️</button>
                  )}
                </div>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                房主: 
                <button
                  onClick={(e) => { e.stopPropagation(); onOwnerClick(room.ownerId) }}
                  style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontSize: '0.75rem' }}
                  title={`查看 ${room.ownerName || '用户'} 的画廊`}
                >
                  {room.ownerName}
                </button>
              </div>

              {/* Role and relationship badges */}
              <div style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '0.5rem',
                flexWrap: 'wrap'
              }}>
                {/* User role badge */}
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.125rem 0.375rem',
                  borderRadius: '0.25rem',
                  fontWeight: '500',
                  backgroundColor: 
                    room.userRole === 'creator' ? '#dbeafe' :
                    room.userRole === 'editor' ? '#d1fae5' :
                    room.userRole === 'assistant' ? '#fef3c7' : '#f3f4f6',
                  color:
                    room.userRole === 'creator' ? '#1e40af' :
                    room.userRole === 'editor' ? '#065f46' :
                    room.userRole === 'assistant' ? '#92400e' : '#374151'
                }}>
                  {room.userRole === 'creator' ? '创建者' :
                   room.userRole === 'editor' ? '编辑者' :
                   room.userRole === 'assistant' ? '辅作者' : '访客'}
                </span>

                {/* Published status */}
{(room as any).publish && (
                  <span style={{
                    fontSize: '0.75rem',
                    padding: '0.125rem 0.375rem',
                    borderRadius: '0.25rem',
                    fontWeight: '500',
                    backgroundColor: '#d1fae5',
                    color: '#065f46'
                  }}>
                    🌐 已发布
                  </span>
                )}
              </div>

              {/* Interaction indicators */}
              <div style={{
                display: 'flex',
                gap: '0.75rem',
                fontSize: '0.75rem',
                color: '#6b7280',
                marginBottom: '0.5rem'
              }}>
                {interaction?.visited && (
                  <span title="已访问">👁️ 已访问</span>
                )}
                {interaction?.commented && (
                  <span title="有评论">💬 已评论</span>
                )}
                {interaction?.shared && (
                  <span title="已分享">🔗 已分享</span>
                )}
              </div>

              <div style={{
                fontSize: '0.75rem',
                color: '#9ca3af'
              }}>
                {formatDate(room.lastModified)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// List View Component for UserRoom
function UserRoomListView({ 
  userRooms, 
  onRoomClick,
  onToggleStar,
  onShare,
  onDelete,
  onOwnerClick,
  userId
}: {
  userRooms: UserRoom[]
  onRoomClick: (roomId: string) => void
  onToggleStar: (roomId: string, event: React.MouseEvent) => void
  onShare: (roomId: string) => void
  onDelete: (roomId: string) => void
  onOwnerClick: (ownerId: string) => void
  userId: string
}) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString()
  }

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
        gridTemplateColumns: '1fr 120px 120px 100px 120px',
        gap: '1rem',
        padding: '0.75rem 1rem',
        backgroundColor: '#f9fafb',
        borderBottom: '1px solid #e5e7eb',
        fontSize: '0.875rem',
        fontWeight: '500',
        color: '#6b7280'
      }}>
        <div>房间信息</div>
        <div>角色</div>
        <div>修改时间</div>
        <div>创建者</div>
        <div>操作</div>
      </div>

      {/* Table Body */}
      {userRooms.map(room => {
        const interaction = room.interactions[0]
        const isStarred = interaction?.starred || false
        
        return (
          <div
            key={room.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 120px 120px 100px 80px',
              gap: '1rem',
              padding: '0.75rem 1rem',
              borderBottom: '1px solid #f3f4f6',
              cursor: 'pointer',
              backgroundColor: 'white',
              transition: 'background-color 0.2s ease'
            }}
            onClick={() => onRoomClick(room.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <RoomThumbnail roomId={room.id} width={40} height={30} />
              <div>
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  color: '#111827',
                  marginBottom: '0.25rem'
                }}>
                  {room.name}
                </div>
{(room as any).publish && (
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#10b981',
                    fontWeight: '500'
                  }}>
                    🌐 已发布
                  </div>
                )}
              </div>
            </div>

            <div style={{
              fontSize: '0.75rem',
              padding: '0.25rem 0.5rem',
              borderRadius: '0.25rem',
              fontWeight: '500',
              backgroundColor: 
                room.userRole === 'creator' ? '#dbeafe' :
                room.userRole === 'editor' ? '#d1fae5' :
                room.userRole === 'assistant' ? '#fef3c7' : '#f3f4f6',
              color:
                room.userRole === 'creator' ? '#1e40af' :
                room.userRole === 'editor' ? '#065f46' :
                room.userRole === 'assistant' ? '#92400e' : '#374151',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {room.userRole === 'creator' ? '创建者' :
               room.userRole === 'editor' ? '编辑者' :
               room.userRole === 'assistant' ? '辅作者' : '访客'}
            </div>

            <div style={{
              fontSize: '0.875rem',
              color: '#6b7280',
              display: 'flex',
              alignItems: 'center'
            }}>
              {formatDate(room.lastModified)}
            </div>

            <div style={{ fontSize: '0.875rem', color: '#6b7280', display: 'flex', alignItems: 'center' }}>
              <button
                onClick={(e) => { e.stopPropagation(); onOwnerClick(room.ownerId) }}
                style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, fontSize: '0.875rem' }}
                title={`查看 ${room.ownerName || '用户'} 的画廊`}
              >
                {room.ownerName}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', justifyContent: 'center' }}>
              <button onClick={(e) => onToggleStar(room.id, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', fontSize: '1rem', color: isStarred ? '#f59e0b' : '#9ca3af' }} title={isStarred ? '取消收藏' : '收藏'}>
                {isStarred ? '★' : '☆'}
              </button>
              <button onClick={(e) => { e.stopPropagation(); onShare(room.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', fontSize: '1rem', color: '#2563eb' }} title="分享">🔗</button>
              {room.userRole === 'creator' && (
                <button onClick={(e) => { e.stopPropagation(); const a = confirm('确定删除该白板？'); if (!a) return; const b = confirm('再次确认：删除后无法恢复，是否继续？'); if (!b) return; onDelete(room.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', fontSize: '1rem', color: '#ef4444' }} title="删除">🗑️</button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// 关注列表组件
function FollowingListView({ 
  followingList, 
  onUserClick,
  onUnfollow
}: {
  followingList: FollowRelationship[]
  onUserClick: (userId: string) => void
  onUnfollow: (followerId: string, followingId: string) => Promise<void>
}) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) return '今天'
    if (diffDays <= 7) return `${diffDays}天前`
    return date.toLocaleDateString()
  }

  if (followingList.length === 0) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '200px',
        color: '#6b7280',
        fontSize: '0.875rem'
      }}>
        暂无关注用户
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 120px 120px',
        gap: '1rem',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid #f3f4f6',
        backgroundColor: '#f9fafb',
        fontWeight: '500',
        fontSize: '0.875rem',
        color: '#374151'
      }}>
        <div>用户名</div>
        <div>关注时间</div>
        <div>操作</div>
      </div>
      
      {followingList.map((follow) => (
        <div
          key={`${follow.followerId}-${follow.followingId}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 120px 120px',
            gap: '1rem',
            padding: '0.75rem 1rem',
            borderBottom: '1px solid #f3f4f6',
            backgroundColor: 'white',
            transition: 'background-color 0.2s ease'
          }}
        >
          <div 
            style={{
              fontSize: '0.875rem',
              fontWeight: '500',
              color: '#111827',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer'
            }}
            onClick={() => onUserClick(follow.followingId)}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#3b82f6'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#111827'
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '0.75rem',
              fontWeight: '600'
            }}>
              {follow.followingName.charAt(0).toUpperCase()}
            </div>
            {follow.followingName}
          </div>

          <div style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center'
          }}>
            {formatDate(follow.followedAt)}
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center'
          }}>
            <button
              style={{
                padding: '0.25rem 0.5rem',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
              onClick={async (e) => {
                e.stopPropagation()
                await onUnfollow(follow.followerId, follow.followingId)
              }}
            >
              取消关注
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// 粉丝列表组件
function FollowersListView({ 
  followersList, 
  onUserClick,
  onRemoveFollower,
  onAddNote
}: {
  followersList: FollowRelationship[]
  onUserClick: (userId: string) => void
  onRemoveFollower: (followerId: string, followingId: string) => Promise<void>
  onAddNote: (userId: string, note: string) => Promise<void>
}) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) return '今天'
    if (diffDays <= 7) return `${diffDays}天前`
    return date.toLocaleDateString()
  }

  if (followersList.length === 0) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '200px',
        color: '#6b7280',
        fontSize: '0.875rem'
      }}>
        暂无粉丝
      </div>
    )
  }

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 120px 100px',
        gap: '1rem',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid #f3f4f6',
        backgroundColor: '#f9fafb',
        fontWeight: '500',
        fontSize: '0.875rem',
        color: '#374151'
      }}>
        <div>用户名</div>
        <div>关注时间</div>
        <div>操作</div>
      </div>
      
      {followersList.map((follow) => (
        <div
          key={`${follow.followerId}-${follow.followingId}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 120px 120px',
            gap: '1rem',
            padding: '0.75rem 1rem',
            borderBottom: '1px solid #f3f4f6',
            backgroundColor: 'white',
            transition: 'background-color 0.2s ease'
          }}
        >
          <div 
            style={{
              fontSize: '0.875rem',
              fontWeight: '500',
              color: '#111827',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer'
            }}
            onClick={() => onUserClick(follow.followerId)}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#3b82f6'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#111827'
            }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '0.75rem',
              fontWeight: '600'
            }}>
              {follow.followerName.charAt(0).toUpperCase()}
            </div>
            {follow.followerName}
          </div>

          <div style={{
            fontSize: '0.875rem',
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center'
          }}>
            {formatDate(follow.followedAt)}
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <button
              style={{
                padding: '0.25rem 0.5rem',
                backgroundColor: '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
              onClick={(e) => {
                e.stopPropagation()
                const note = prompt('请输入备注：')
                if (note !== null) {
                  onAddNote(follow.followerId, note)
                }
              }}
              title="添加备注"
            >
              备注
            </button>
            <button
              style={{
                padding: '0.25rem 0.5rem',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`确定要移除粉丝 "${follow.followerName}" 吗？`)) {
                  onRemoveFollower(follow.followerId, follow.followingId)
                }
              }}
              title="移除粉丝"
            >
              移除
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}