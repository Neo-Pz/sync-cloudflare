// Room Statistics Aggregator - 统一聚合房间统计数据
import { interactionTracker } from './interactionTracker'
import { roomUtils } from './roomUtils'

export interface RoomStats {
  // 基本信息（来自roomService.ts）
  roomId: string
  roomName: string
  ownerName: string
  ownerId: string
  description?: string
  tags?: string[]
  published: boolean // 兼容旧字段，不再用于显示
  // 新：仅以 publish 作为是否发布
  publish?: boolean
  shared?: boolean
  permission: 'viewer' | 'editor' | 'assist'
  historyLocked?: boolean
  createdAt: number
  lastModified: number
  
  // 统计数据（多源聚合）
  totalStars: number      // 所有用户的star总数
  totalShares: number     // 总分享次数
  totalComments: number   // 总评论数
  totalVisits: number     // 总访问次数
  
  // 当前用户状态（来自interactionTracker.ts）
  userHasStarred: boolean
  userHasShared: boolean
  userHasCommented: boolean
  userHasVisited: boolean
  userVisitCount: number
  
  // 最新交互数据
  recentComments: CommentData[]
  recentStars: StarData[]
  recentShares: ShareData[]
}

export interface CommentData {
  userId: string
  userName: string
  comment: string
  timestamp: number
}

export interface StarData {
  userId: string
  userName: string
  timestamp: number
}

export interface ShareData {
  userId: string
  userName: string
  shareMethod: string
  timestamp: number
}

export class RoomStatsAggregator {
  private static instance: RoomStatsAggregator
  private statsCache: Map<string, { stats: RoomStats, timestamp: number }> = new Map()
  private readonly CACHE_DURATION = 5 * 60 * 1000 // 5分钟缓存

  static getInstance(): RoomStatsAggregator {
    if (!RoomStatsAggregator.instance) {
      RoomStatsAggregator.instance = new RoomStatsAggregator()
    }
    return RoomStatsAggregator.instance
  }

  // 获取房间完整统计信息
  async getRoomStats(roomId: string, userId: string): Promise<RoomStats | null> {
    // 检查缓存
    const cached = this.statsCache.get(roomId)
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.stats
    }

    try {
      // 1. 获取房间基本信息（从roomService.ts）
      let roomData = await roomUtils.getRoom(roomId)
      
      // 如果找不到房间数据，为默认房间创建基本信息
      if (!roomData) {
        console.warn(`Room ${roomId} not found in storage, creating default room info`)
        roomData = {
          id: roomId,
          name: this.getDefaultRoomName(roomId),
          ownerId: 'system',
          owner: 'system', 
          ownerName: 'System',
          description: '默认房间',
          tags: [],
          published: false,
          permission: 'editor' as const,
          createdAt: Date.now(),
          lastModified: Date.now()
        }
      }

      // 2. 获取当前用户的交互状态（从interactionTracker.ts）
      const userMetrics = interactionTracker.getMetrics(roomId)
      const userInteractions = this.getUserInteractionStatus(roomId, userId)

      // 3. 聚合所有用户的统计数据
      const aggregatedStats = await this.aggregateAllUserStats(roomId)

      // 4. 获取最新交互数据
      const recentInteractions = await this.getRecentInteractions(roomId)

      // 5. 构建完整的房间统计信息
      const roomStats: RoomStats = {
        // 基本信息
        roomId: roomData.id,
        roomName: roomData.name,
        ownerName: roomData.ownerName || 'Unknown',
        ownerId: roomData.ownerId || roomData.owner || 'unknown',
        description: roomData.description,
        tags: roomData.tags,
        published: roomData.published || false,
        permission: roomData.permission || 'viewer',
        historyLocked: roomData.historyLocked || false,
        createdAt: roomData.createdAt,
        lastModified: roomData.lastModified,
        
        // 聚合统计
        totalStars: aggregatedStats.totalStars,
        totalShares: aggregatedStats.totalShares,
        totalComments: aggregatedStats.totalComments,
        totalVisits: aggregatedStats.totalVisits,
        
        // 当前用户状态
        userHasStarred: userInteractions.hasStarred,
        userHasShared: userInteractions.hasShared,
        userHasCommented: userInteractions.hasCommented,
        userHasVisited: userInteractions.hasVisited,
        userVisitCount: userMetrics?.visitCount || 0,
        
        // 最新交互
        recentComments: recentInteractions.comments,
        recentStars: recentInteractions.stars,
        recentShares: recentInteractions.shares
      }

      // 缓存结果
      this.statsCache.set(roomId, {
        stats: roomStats,
        timestamp: Date.now()
      })

      return roomStats
    } catch (error) {
      console.error('Error aggregating room stats:', error)
      return null
    }
  }

  // 获取当前用户的交互状态
  private getUserInteractionStatus(roomId: string, userId: string): {
    hasStarred: boolean
    hasShared: boolean
    hasCommented: boolean
    hasVisited: boolean
  } {
    const hasStarred = interactionTracker.hasInteraction(roomId, 'star')
    const hasShared = interactionTracker.hasInteraction(roomId, 'share')
    const hasCommented = interactionTracker.hasInteraction(roomId, 'comment')
    const hasVisited = interactionTracker.hasInteraction(roomId, 'visit')

    return {
      hasStarred,
      hasShared,
      hasCommented,
      hasVisited
    }
  }

  // 聚合所有用户的统计数据
  private async aggregateAllUserStats(roomId: string): Promise<{
    totalStars: number
    totalShares: number
    totalComments: number
    totalVisits: number
  }> {
    try {
      // 从localStorage聚合所有用户的交互数据
      const allInteractionKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('interaction-events') || key.startsWith('interaction-metrics')
      )

      let totalStars = 0
      let totalShares = 0
      let totalComments = 0
      let totalVisits = 0

      // 聚合interaction-events数据
      allInteractionKeys.forEach(key => {
        try {
          if (key.startsWith('interaction-events')) {
            const events = JSON.parse(localStorage.getItem(key) || '[]')
            events.forEach((event: any) => {
              if (event.roomId === roomId) {
                switch (event.interactionType) {
                  case 'star':
                    totalStars++
                    break
                  case 'share':
                    totalShares++
                    break
                  case 'comment':
                    totalComments++
                    break
                  case 'visit':
                    totalVisits++
                    break
                }
              }
            })
          }
        } catch (error) {
          console.warn('Error parsing interaction data:', error)
        }
      })

      // 从当前interactionTracker获取额外数据
      const currentUserMetrics = interactionTracker.getMetrics(roomId)
      if (currentUserMetrics) {
        if (currentUserMetrics.isStarred) totalStars++
        if (currentUserMetrics.hasShared) totalShares += currentUserMetrics.shareCount
        if (currentUserMetrics.hasCommented) totalComments++
        totalVisits += currentUserMetrics.visitCount
      }

      return {
        totalStars,
        totalShares, 
        totalComments,
        totalVisits
      }
    } catch (error) {
      console.error('Error aggregating user stats:', error)
      return {
        totalStars: 0,
        totalShares: 0,
        totalComments: 0,
        totalVisits: 0
      }
    }
  }

  // 获取最新交互数据
  private async getRecentInteractions(roomId: string, limit: number = 5): Promise<{
    comments: CommentData[]
    stars: StarData[]
    shares: ShareData[]
  }> {
    const comments: CommentData[] = []
    const stars: StarData[] = []
    const shares: ShareData[] = []

    try {
      // 从数据库获取评论
      try {
        const commentsResponse = await fetch(`/api/rooms/${roomId}/comments`)
        if (commentsResponse.ok) {
          const dbComments = await commentsResponse.json()
          dbComments.slice(0, limit).forEach((comment: any) => {
            comments.push({
              userId: comment.userId,
              userName: comment.userName,
              comment: comment.comment,
              timestamp: comment.createdAt
            })
          })
        }
      } catch (error) {
        console.warn('Error fetching comments from database:', error)
      }

      // 从localStorage收集其他交互事件（星标和分享）
      const allInteractionKeys = Object.keys(localStorage).filter(key => 
        key.startsWith('interaction-events')
      )

      const allEvents: any[] = []
      
      allInteractionKeys.forEach(key => {
        try {
          const events = JSON.parse(localStorage.getItem(key) || '[]')
          allEvents.push(...events.filter((e: any) => e.roomId === roomId))
        } catch (error) {
          console.warn('Error parsing interaction events:', error)
        }
      })

      // 按时间戳排序
      allEvents.sort((a, b) => b.timestamp - a.timestamp)

      // 分类收集最新交互（不包括评论，因为评论已从数据库获取）
      allEvents.forEach(event => {
        switch (event.interactionType) {
          case 'star':
            if (stars.length < limit) {
              stars.push({
                userId: event.userId,
                userName: event.userName,
                timestamp: event.timestamp
              })
            }
            break
          case 'share':
            if (shares.length < limit) {
              shares.push({
                userId: event.userId,
                userName: event.userName,
                shareMethod: event.metadata?.shareMethod || 'unknown',
                timestamp: event.timestamp
              })
            }
            break
        }
      })

      return { comments, stars, shares }
    } catch (error) {
      console.error('Error getting recent interactions:', error)
      return { comments: [], stars: [], shares: [] }
    }
  }

  // 刷新房间统计缓存
  async refreshRoomStats(roomId: string, userId: string): Promise<RoomStats | null> {
    this.statsCache.delete(roomId)
    return this.getRoomStats(roomId, userId)
  }

  // 清除所有缓存
  clearCache(): void {
    this.statsCache.clear()
  }

  // 获取默认房间名称
  private getDefaultRoomName(roomId: string): string {
    switch (roomId) {
      case 'default-room':
        return '默认房间'
      case 'shared-room':
        return '共享房间'
      default:
        return roomId.length > 20 ? `房间 ${roomId.substring(0, 8)}...` : `房间 ${roomId}`
    }
  }

  // 获取房间简要统计（用于快速显示）
  async getRoomQuickStats(roomId: string): Promise<{
    starCount: number
    shareCount: number
    commentCount: number
  } | null> {
    try {
      const cached = this.statsCache.get(roomId)
      if (cached) {
        return {
          starCount: cached.stats.totalStars,
          shareCount: cached.stats.totalShares,
          commentCount: cached.stats.totalComments
        }
      }

      // 快速聚合（不包含详细信息）
      const quickStats = await this.aggregateAllUserStats(roomId)
      return {
        starCount: quickStats.totalStars,
        shareCount: quickStats.totalShares,
        commentCount: quickStats.totalComments
      }
    } catch (error) {
      console.error('Error getting quick stats:', error)
      return null
    }
  }
}

// 导出单例实例
export const roomStatsAggregator = RoomStatsAggregator.getInstance()

// 工具函数
export const formatInteractionTime = (timestamp: number): string => {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚才'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return new Date(timestamp).toLocaleDateString()
}

export const formatCount = (count: number): string => {
  if (count < 1000) return count.toString()
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`
  return `${Math.floor(count / 1000)}k`
}