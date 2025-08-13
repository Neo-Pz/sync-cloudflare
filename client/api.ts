// 生产环境优化版本 - 统一API客户端
export interface Room {
  id: string
  name: string
  createdAt: number
  lastModified: number
  ownerId: string
  ownerName: string
  shared: boolean
  permission: 'viewer' | 'editor' | 'assist'
  maxPermission?: 'viewer' | 'editor' | 'assist' // 房主设定的最大权限
  historyLocked?: boolean
  historyLockTimestamp?: number
  historyLockedBy?: string
  historyLockedByName?: string
  plaza?: boolean
  description?: string
  tags?: string[]
}

export interface UserActivity {
  userId: string
  userName?: string
  activityType: 'room_visit' | 'room_create' | 'room_edit' | 'room_share'
  roomId: string
  roomName?: string
  activityTimestamp: number
  sessionDuration?: number
  interactionCount?: number
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
}

class APIClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
      ? 'http://localhost:8787' 
      : ''
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    }

    try {
      const response = await fetch(url, config)
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }))
        throw new Error(error.error || `HTTP ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error)
      throw error
    }
  }

  // === 房间API ===
  async getRooms(filters?: { shared?: boolean; plaza?: boolean }): Promise<Room[]> {
    const params = new URLSearchParams()
    if (filters?.shared !== undefined) params.set('shared', String(filters.shared))
    if (filters?.plaza !== undefined) params.set('plaza', String(filters.plaza))
    
    const query = params.toString() ? `?${params}` : ''
    return this.request<Room[]>(`/api/rooms${query}`)
  }

  async getRoom(roomId: string): Promise<Room> {
    return this.request<Room>(`/api/rooms/${roomId}`)
  }

  async createRoom(room: Omit<Room, 'id' | 'createdAt' | 'lastModified'>): Promise<Room> {
    const roomData = {
      ...room,
      id: this.generateId(),
      createdAt: Date.now(),
      lastModified: Date.now(),
    }
    return this.request<Room>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(roomData),
    })
  }

  async updateRoom(roomId: string, updates: Partial<Room>): Promise<Room> {
    return this.request<Room>(`/api/rooms/${roomId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.request(`/api/rooms/${roomId}`, { method: 'DELETE' })
  }

  // === 用户活动API ===
  async recordActivity(activity: UserActivity): Promise<void> {
    try {
      await this.request('/api/activities', {
        method: 'POST',
        body: JSON.stringify(activity),
      })
    } catch (error) {
      // 静默失败，用户活动记录不应阻塞主要功能
      console.warn('Failed to record user activity:', error)
    }
  }

  async getUserRecentRooms(userId: string, limit: number = 20): Promise<UserRoomStats[]> {
    return this.request<UserRoomStats[]>(`/api/users/${userId}/recent-rooms?limit=${limit}`)
  }

  async getRoomStats(roomId: string): Promise<{ visits: number; uniqueUsers: number; lastActivity: number }> {
    return this.request(`/api/rooms/${roomId}/stats`)
  }

  // === 便捷方法 ===
  async recordRoomVisit(userId: string, userName: string, roomId: string, roomName: string): Promise<void> {
    return this.recordActivity({
      userId,
      userName,
      activityType: 'room_visit',
      roomId,
      roomName,
      activityTimestamp: Date.now(),
      interactionCount: 0,
    })
  }

  async recordRoomCreate(userId: string, userName: string, roomId: string, roomName: string): Promise<void> {
    return this.recordActivity({
      userId,
      userName,
      activityType: 'room_create',
      roomId,
      roomName,
      activityTimestamp: Date.now(),
      interactionCount: 1,
    })
  }

  // === 房间管理便捷方法 ===
  async getSharedRooms(): Promise<Room[]> {
    return this.getRooms({ shared: true })
  }

  async getPlazaRooms(): Promise<Room[]> {
    return this.getRooms({ plaza: true })
  }

  async shareRoom(roomId: string): Promise<Room> {
    return this.updateRoom(roomId, { shared: true })
  }

  async unshareRoom(roomId: string): Promise<Room> {
    return this.updateRoom(roomId, { shared: false })
  }

  async lockHistory(roomId: string): Promise<Room> {
    return this.updateRoom(roomId, { historyLocked: true })
  }

  async unlockHistory(roomId: string): Promise<Room> {
    return this.updateRoom(roomId, { historyLocked: false })
  }

  async setPlaza(roomId: string, isPlaza: boolean): Promise<Room> {
    return this.updateRoom(roomId, { plaza: isPlaza })
  }

  // === 工具方法 ===
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
  }
}

// 导出单例
export const api = new APIClient()

// 向后兼容的导出
export const roomUtils = {
  getAllRooms: () => api.getRooms(),
  getRoom: (id: string) => api.getRoom(id),
  addRoom: (room: any) => api.createRoom(room),
  updateRoom: (id: string, updates: any) => api.updateRoom(id, updates),
  deleteRoom: (id: string) => api.deleteRoom(id),
  getPlazaRooms: () => api.getPlazaRooms(),
  getSharedRooms: () => api.getSharedRooms(),
  updateRoomLastModified: (id: string) => api.updateRoom(id, { lastModified: Date.now() }),
}

export const userActivityAPI = {
  recordRoomVisit: api.recordRoomVisit.bind(api),
  recordRoomCreate: api.recordRoomCreate.bind(api),
  getUserRecentRooms: api.getUserRecentRooms.bind(api),
}

// .tldr 文件相关类型
export interface TldrFile {
  id: string
  name: string
  roomId: string
  ownerId: string
  ownerName: string
  fileSize: number
  createdAt: number
  lastModified: number
  contentHash: string
  isPublic: boolean
  downloadCount: number
}

export interface TldrFileContent {
  tldrawFileFormatVersion: number
  schema: any
  records: any[]
}

// .tldr 文件 API
export const tldrFileAPI = {
  // 保存 .tldr 文件
  async saveTldrFile(fileData: {
    name: string
    roomId: string
    ownerId: string
    ownerName: string
    content: TldrFileContent
    isPublic?: boolean
  }): Promise<TldrFile> {
    return api.request<TldrFile>('/api/tldr-files', {
      method: 'POST',
      body: JSON.stringify(fileData)
    })
  },

  // 获取 .tldr 文件内容
  async getTldrFileContent(fileId: string): Promise<TldrFileContent> {
    return api.request<TldrFileContent>(`/api/tldr-files/${fileId}`)
  },

  // 下载 .tldr 文件
  async downloadTldrFile(fileId: string): Promise<Blob> {
    const url = `${api.baseUrl}/api/tldr-files/${fileId}/download`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`)
    }
    return response.blob()
  },

  // 获取用户的 .tldr 文件列表
  async getUserTldrFiles(userId: string, limit?: number): Promise<TldrFile[]> {
    const params = limit ? `?limit=${limit}` : ''
    return api.request<TldrFile[]>(`/api/users/${userId}/tldr-files${params}`)
  },

  // 获取房间相关的 .tldr 文件
  async getRoomTldrFiles(roomId: string): Promise<TldrFile[]> {
    return api.request<TldrFile[]>(`/api/rooms/${roomId}/tldr-files`)
  },

  // 删除 .tldr 文件
  async deleteTldrFile(fileId: string, userId: string): Promise<void> {
    await api.request(`/api/tldr-files/${fileId}`, {
      method: 'DELETE',
      headers: { 'X-User-ID': userId }
    })
  },

  // 获取公开的 .tldr 文件列表
  async getPublicTldrFiles(limit?: number): Promise<TldrFile[]> {
    const params = limit ? `?limit=${limit}` : ''
    return api.request<TldrFile[]>(`/api/tldr-files/public${params}`)
  },

  // 更新文件公开状态
  async updateFilePublicStatus(fileId: string, userId: string, isPublic: boolean): Promise<void> {
    await api.request(`/api/tldr-files/${fileId}/public`, {
      method: 'PUT',
      headers: { 'X-User-ID': userId },
      body: JSON.stringify({ isPublic })
    })
  }
}