// Room-User Statistics Manager - 房间与用户的双向统计管理
// 负责收集、存储和查询房间与用户之间的互动统计数据

export interface UserAction {
  userId: string
  userName: string
  timestamp: number
  metadata?: any
}

export interface RoomUserStats {
  roomId: string
  // 按用户分组的统计
  starredUsers: Map<string, UserAction>     // 收藏此房间的用户
  visitedUsers: Map<string, UserAction[]>   // 访问此房间的用户（可能多次访问）
  sharedUsers: Map<string, UserAction[]>    // 分享此房间的用户（可能多次分享）
  commentedUsers: Map<string, UserAction[]> // 评论此房间的用户（可能多条评论）
  
  // 统计汇总
  totalStars: number
  totalVisits: number
  totalShares: number
  totalComments: number
  uniqueVisitors: number
}

export interface UserRoomStats {
  userId: string
  // 按房间分组的统计
  starredRooms: Set<string>        // 用户收藏的房间
  visitedRooms: Map<string, UserAction[]>  // 用户访问的房间
  sharedRooms: Map<string, UserAction[]>   // 用户分享的房间
  commentedRooms: Map<string, UserAction[]> // 用户评论的房间
  
  // 统计汇总
  totalStars: number
  totalVisits: number
  totalShares: number
  totalComments: number
  uniqueRoomsVisited: number
}

class RoomUserStatsManager {
  private static instance: RoomUserStatsManager
  private roomStats = new Map<string, RoomUserStats>()
  private userStats = new Map<string, UserRoomStats>()
  private storageKey = 'room-user-stats'

  static getInstance(): RoomUserStatsManager {
    if (!RoomUserStatsManager.instance) {
      RoomUserStatsManager.instance = new RoomUserStatsManager()
    }
    return RoomUserStatsManager.instance
  }

  constructor() {
    this.loadFromStorage()
  }

  // 存储管理
  // 通知统计数据变化
  private notifyStatsChange(): void {
    window.dispatchEvent(new CustomEvent('roomStatsChanged'))
  }

  private saveToStorage(): void {
    try {
      const data = {
        roomStats: Object.fromEntries(
          Array.from(this.roomStats.entries()).map(([roomId, stats]) => [
            roomId,
            {
              ...stats,
              starredUsers: Object.fromEntries(stats.starredUsers),
              visitedUsers: Object.fromEntries(stats.visitedUsers),
              sharedUsers: Object.fromEntries(stats.sharedUsers),
              commentedUsers: Object.fromEntries(stats.commentedUsers)
            }
          ])
        ),
        userStats: Object.fromEntries(
          Array.from(this.userStats.entries()).map(([userId, stats]) => [
            userId,
            {
              ...stats,
              starredRooms: Array.from(stats.starredRooms),
              visitedRooms: Object.fromEntries(stats.visitedRooms),
              sharedRooms: Object.fromEntries(stats.sharedRooms),
              commentedRooms: Object.fromEntries(stats.commentedRooms)
            }
          ])
        )
      }
      localStorage.setItem(this.storageKey, JSON.stringify(data))
    } catch (error) {
      console.error('Error saving room-user stats:', error)
    }
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.storageKey)
      if (!data) return

      const parsed = JSON.parse(data)
      
      // 恢复房间统计
      if (parsed.roomStats) {
        for (const [roomId, stats] of Object.entries(parsed.roomStats as any)) {
          this.roomStats.set(roomId, {
            ...stats,
            starredUsers: new Map(Object.entries(stats.starredUsers || {})),
            visitedUsers: new Map(Object.entries(stats.visitedUsers || {})),
            sharedUsers: new Map(Object.entries(stats.sharedUsers || {})),
            commentedUsers: new Map(Object.entries(stats.commentedUsers || {}))
          })
        }
      }

      // 恢复用户统计
      if (parsed.userStats) {
        for (const [userId, stats] of Object.entries(parsed.userStats as any)) {
          this.userStats.set(userId, {
            ...stats,
            starredRooms: new Set(stats.starredRooms || []),
            visitedRooms: new Map(Object.entries(stats.visitedRooms || {})),
            sharedRooms: new Map(Object.entries(stats.sharedRooms || {})),
            commentedRooms: new Map(Object.entries(stats.commentedRooms || {}))
          })
        }
      }
    } catch (error) {
      console.error('Error loading room-user stats:', error)
    }
  }

  // 获取或创建房间统计
  private getOrCreateRoomStats(roomId: string): RoomUserStats {
    if (!this.roomStats.has(roomId)) {
      this.roomStats.set(roomId, {
        roomId,
        starredUsers: new Map(),
        visitedUsers: new Map(),
        sharedUsers: new Map(),
        commentedUsers: new Map(),
        totalStars: 0,
        totalVisits: 0,
        totalShares: 0,
        totalComments: 0,
        uniqueVisitors: 0
      })
    }
    return this.roomStats.get(roomId)!
  }

  // 获取或创建用户统计
  private getOrCreateUserStats(userId: string): UserRoomStats {
    if (!this.userStats.has(userId)) {
      this.userStats.set(userId, {
        userId,
        starredRooms: new Set(),
        visitedRooms: new Map(),
        sharedRooms: new Map(),
        commentedRooms: new Map(),
        totalStars: 0,
        totalVisits: 0,
        totalShares: 0,
        totalComments: 0,
        uniqueRoomsVisited: 0
      })
    }
    return this.userStats.get(userId)!
  }

  // 记录收藏操作
  recordStar(roomId: string, userId: string, userName: string, starred: boolean): void {
    const roomStats = this.getOrCreateRoomStats(roomId)
    const userStats = this.getOrCreateUserStats(userId)

    if (starred) {
      // 添加收藏
      roomStats.starredUsers.set(userId, {
        userId,
        userName,
        timestamp: Date.now()
      })
      userStats.starredRooms.add(roomId)
      roomStats.totalStars++
      userStats.totalStars++
    } else {
      // 取消收藏
      roomStats.starredUsers.delete(userId)
      userStats.starredRooms.delete(roomId)
      roomStats.totalStars = Math.max(0, roomStats.totalStars - 1)
      userStats.totalStars = Math.max(0, userStats.totalStars - 1)
    }

    this.saveToStorage()
    this.notifyStatsChange()
  }

  // 记录访问操作
  recordVisit(roomId: string, userId: string, userName: string): void {
    const roomStats = this.getOrCreateRoomStats(roomId)
    const userStats = this.getOrCreateUserStats(userId)

    const action: UserAction = {
      userId,
      userName,
      timestamp: Date.now()
    }

    // 添加到房间的访问记录
    if (!roomStats.visitedUsers.has(userId)) {
      roomStats.visitedUsers.set(userId, [])
    }
    roomStats.visitedUsers.get(userId)!.push(action)
    roomStats.totalVisits++

    // 更新独立访客数
    roomStats.uniqueVisitors = roomStats.visitedUsers.size

    // 添加到用户的访问记录
    if (!userStats.visitedRooms.has(roomId)) {
      userStats.visitedRooms.set(roomId, [])
    }
    userStats.visitedRooms.get(roomId)!.push(action)
    userStats.totalVisits++
    userStats.uniqueRoomsVisited = userStats.visitedRooms.size

    this.saveToStorage()
    this.notifyStatsChange()
  }

  // 记录分享操作
  recordShare(roomId: string, userId: string, userName: string, method: string): void {
    const roomStats = this.getOrCreateRoomStats(roomId)
    const userStats = this.getOrCreateUserStats(userId)

    const action: UserAction = {
      userId,
      userName,
      timestamp: Date.now(),
      metadata: { method }
    }

    // 添加到房间的分享记录
    if (!roomStats.sharedUsers.has(userId)) {
      roomStats.sharedUsers.set(userId, [])
    }
    roomStats.sharedUsers.get(userId)!.push(action)
    roomStats.totalShares++

    // 添加到用户的分享记录
    if (!userStats.sharedRooms.has(roomId)) {
      userStats.sharedRooms.set(roomId, [])
    }
    userStats.sharedRooms.get(roomId)!.push(action)
    userStats.totalShares++

    this.saveToStorage()
    this.notifyStatsChange()
  }

  // 记录评论操作
  recordComment(roomId: string, userId: string, userName: string, comment: string): void {
    const roomStats = this.getOrCreateRoomStats(roomId)
    const userStats = this.getOrCreateUserStats(userId)

    const action: UserAction = {
      userId,
      userName,
      timestamp: Date.now(),
      metadata: { comment }
    }

    // 添加到房间的评论记录
    if (!roomStats.commentedUsers.has(userId)) {
      roomStats.commentedUsers.set(userId, [])
    }
    roomStats.commentedUsers.get(userId)!.push(action)
    roomStats.totalComments++

    // 添加到用户的评论记录
    if (!userStats.commentedRooms.has(roomId)) {
      userStats.commentedRooms.set(roomId, [])
    }
    userStats.commentedRooms.get(roomId)!.push(action)
    userStats.totalComments++

    this.saveToStorage()
    this.notifyStatsChange()
  }

  // 查询方法
  getRoomStats(roomId: string): RoomUserStats | null {
    return this.roomStats.get(roomId) || null
  }

  getUserStats(userId: string): UserRoomStats | null {
    return this.userStats.get(userId) || null
  }

  // 检查用户是否收藏了房间
  hasUserStarredRoom(userId: string, roomId: string): boolean {
    const roomStats = this.roomStats.get(roomId)
    return roomStats?.starredUsers.has(userId) || false
  }

  // 获取房间的收藏用户列表
  getRoomStarredUsers(roomId: string): UserAction[] {
    const roomStats = this.roomStats.get(roomId)
    return roomStats ? Array.from(roomStats.starredUsers.values()) : []
  }

  // 获取用户收藏的房间列表
  getUserStarredRooms(userId: string): string[] {
    const userStats = this.userStats.get(userId)
    return userStats ? Array.from(userStats.starredRooms) : []
  }

  // 获取房间的统计摘要
  getRoomStatsSummary(roomId: string) {
    const stats = this.getRoomStats(roomId)
    if (!stats) {
      return {
        totalStars: 0,
        totalVisits: 0,
        totalShares: 0,
        totalComments: 0,
        uniqueVisitors: 0
      }
    }
    
    return {
      totalStars: stats.totalStars,
      totalVisits: stats.totalVisits,
      totalShares: stats.totalShares,
      totalComments: stats.totalComments,
      uniqueVisitors: stats.uniqueVisitors
    }
  }

  // 获取用户的统计摘要
  getUserStatsSummary(userId: string) {
    const stats = this.getUserStats(userId)
    if (!stats) {
      return {
        totalStars: 0,
        totalVisits: 0,
        totalShares: 0,
        totalComments: 0,
        uniqueRoomsVisited: 0
      }
    }
    
    return {
      totalStars: stats.totalStars,
      totalVisits: stats.totalVisits,
      totalShares: stats.totalShares,
      totalComments: stats.totalComments,
      uniqueRoomsVisited: stats.uniqueRoomsVisited
    }
  }
}

// 导出单例实例
export const roomUserStatsManager = RoomUserStatsManager.getInstance()