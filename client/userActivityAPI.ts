// 用户行为记录API客户端
export interface UserActivity {
  id?: number
  userId: string
  userName?: string
  activityType: 'room_visit' | 'room_create' | 'room_edit' | 'room_share'
  roomId: string
  roomName?: string
  activityTimestamp: number
  sessionDuration?: number
  interactionCount?: number
  lastPageId?: string
  lastPageName?: string
  metadata?: string
}

export interface UserRoomStats {
  userId: string
  roomId: string
  roomName?: string
  visitCount: number
  lastVisit: number
  totalDuration?: number
  totalInteractions?: number
  avgSessionDuration?: number
}

class UserActivityAPI {
  private baseUrl: string

  constructor() {
    // 自动检测API基础URL
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        this.baseUrl = 'http://localhost:8787'
      } else {
        this.baseUrl = '' // 使用相对路径，让浏览器自动解析
      }
    } else {
      this.baseUrl = ''
    }
  }

  // 记录用户活动
  async recordActivity(activity: Omit<UserActivity, 'id'>): Promise<UserActivity> {
    try {
      const response = await fetch(`${this.baseUrl}/api/activities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(activity)
      })

      if (!response.ok) {
        throw new Error(`Failed to record activity: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error recording user activity:', error)
      throw error
    }
  }

  // 获取用户最近访问的房间
  async getUserRecentRooms(userId: string, limit: number = 20): Promise<UserRoomStats[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/activities/recent/${userId}?limit=${limit}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch recent rooms: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error fetching user recent rooms:', error)
      throw error
    }
  }

  // 获取用户在特定房间的活动历史
  async getUserRoomActivities(userId: string, roomId: string, limit: number = 50): Promise<UserActivity[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/activities/${userId}/${roomId}?limit=${limit}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch room activities: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error fetching user room activities:', error)
      throw error
    }
  }

  // 获取房间访问统计
  async getRoomStats(roomId: string, limit: number = 100): Promise<UserActivity[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/rooms/${roomId}/stats?limit=${limit}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch room stats: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error fetching room stats:', error)
      throw error
    }
  }

  // 更新用户活动
  async updateActivity(activityId: number, updates: Partial<UserActivity>): Promise<UserActivity> {
    try {
      const response = await fetch(`${this.baseUrl}/api/activities/${activityId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates)
      })

      if (!response.ok) {
        throw new Error(`Failed to update activity: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error updating user activity:', error)
      throw error
    }
  }

  // 便捷方法：记录房间访问
  async recordRoomVisit(userId: string, userName: string, roomId: string, roomName: string, pageId?: string, pageName?: string): Promise<UserActivity> {
    return this.recordActivity({
      userId,
      userName,
      activityType: 'room_visit',
      roomId,
      roomName,
      activityTimestamp: Date.now(),
      lastPageId: pageId,
      lastPageName: pageName,
      interactionCount: 0
    })
  }

  // 便捷方法：记录房间创建
  async recordRoomCreate(userId: string, userName: string, roomId: string, roomName: string): Promise<UserActivity> {
    return this.recordActivity({
      userId,
      userName,
      activityType: 'room_create',
      roomId,
      roomName,
      activityTimestamp: Date.now(),
      interactionCount: 1
    })
  }

  // 便捷方法：记录房间编辑
  async recordRoomEdit(userId: string, userName: string, roomId: string, roomName: string, interactionCount: number = 1): Promise<UserActivity> {
    return this.recordActivity({
      userId,
      userName,
      activityType: 'room_edit',
      roomId,
      roomName,
      activityTimestamp: Date.now(),
      interactionCount
    })
  }

  // 便捷方法：记录房间分享
  async recordRoomShare(userId: string, userName: string, roomId: string, roomName: string): Promise<UserActivity> {
    return this.recordActivity({
      userId,
      userName,
      activityType: 'room_share',
      roomId,
      roomName,
      activityTimestamp: Date.now(),
      interactionCount: 1
    })
  }
}

// 导出单例实例
export const userActivityAPI = new UserActivityAPI()