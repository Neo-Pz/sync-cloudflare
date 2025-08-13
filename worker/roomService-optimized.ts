// 生产环境优化版本 - RoomService
export interface Room {
  id: string
  name: string
  createdAt: number
  lastModified: number
  ownerId: string
  ownerName: string
  published: boolean
  permission: 'viewer' | 'editor' | 'assist'
  historyLocked?: boolean
  publish?: boolean
  description?: string
  tags?: string[]
}

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

export class RoomService {
  private db: D1Database

  constructor(db: D1Database) {
    this.db = db
  }

  // === 房间管理 ===
  async getAllRooms(published?: boolean, publish?: boolean): Promise<Room[]> {
    let sql = 'SELECT * FROM rooms WHERE 1=1'
    const params: any[] = []
    
    if (published !== undefined) {
      sql += ' AND published = ?'
      params.push(published ? 1 : 0)
    }
    if (publish !== undefined) {
      sql += ' AND publish = ?'
      params.push(publish ? 1 : 0)
    }
    
    sql += ' ORDER BY last_modified DESC'
    
    const result = await this.db.prepare(sql).bind(...params).all()
    return result.results.map(row => this.mapRowToRoom(row))
  }

  async getRoom(roomId: string): Promise<Room | null> {
    const result = await this.db.prepare('SELECT * FROM rooms WHERE id = ?').bind(roomId).first()
    return result ? this.mapRowToRoom(result) : null
  }

  async createRoom(room: Room): Promise<Room> {
    const stmt = this.db.prepare(`
      INSERT INTO rooms (id, name, created_at, last_modified, owner_id, owner_name, published, permission, history_locked, publish, description, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    await stmt.bind(
      room.id, room.name, room.createdAt, room.lastModified, room.ownerId, room.ownerName,
      room.published ? 1 : 0, room.permission, room.historyLocked ? 1 : 0, room.publish ? 1 : 0,
      room.description || null, room.tags ? JSON.stringify(room.tags) : null
    ).run()

    return room
  }

  async updateRoom(roomId: string, updates: Partial<Room>): Promise<Room> {
    const existing = await this.getRoom(roomId)
    if (!existing) throw new Error(`Room not found: ${roomId}`)

    const updated = { ...existing, ...updates, lastModified: Date.now() }
    
    // 尝试使用新的 publish 字段，如果失败则使用兼容性更新
    try {
      const stmt = this.db.prepare(`
        UPDATE rooms SET name = ?, last_modified = ?, published = ?, permission = ?, 
                        history_locked = ?, publish = ?, description = ?, tags = ?
        WHERE id = ?
      `)

      await stmt.bind(
        updated.name, updated.lastModified, updated.published ? 1 : 0, updated.permission,
        updated.historyLocked ? 1 : 0, updated.publish ? 1 : 0, 
        updated.description || null, updated.tags ? JSON.stringify(updated.tags) : null,
        roomId
      ).run()
    } catch (error) {
      // 如果新字段不存在，回退到兼容模式（使用plaza字段）
      console.warn('Falling back to compatibility mode for room update:', error)
      const stmt = this.db.prepare(`
        UPDATE rooms SET name = ?, last_modified = ?, published = ?, permission = ?, 
                        history_locked = ?, plaza = ?, description = ?, tags = ?
        WHERE id = ?
      `)

      await stmt.bind(
        updated.name, updated.lastModified, updated.published ? 1 : 0, updated.permission,
        updated.historyLocked ? 1 : 0, updated.publish ? 1 : 0, 
        updated.description || null, updated.tags ? JSON.stringify(updated.tags) : null,
        roomId
      ).run()
    }

    return updated
  }

  async deleteRoom(roomId: string): Promise<void> {
    console.log(`🗑️ [DELETE_ROOM] Starting deletion for room: ${roomId}`)
    
    try {
      // 删除关联数据
      console.log(`🗑️ [DELETE_ROOM] Deleting related data for room: ${roomId}`)
      await this.db.prepare('DELETE FROM tldr_file_contents WHERE file_id IN (SELECT id FROM tldr_files WHERE room_id = ?)').bind(roomId).run()
      await this.db.prepare('DELETE FROM tldr_files WHERE room_id = ?').bind(roomId).run()
      await this.db.prepare('DELETE FROM share_configs WHERE roomId = ?').bind(roomId).run()
      await this.db.prepare('DELETE FROM publish_requests WHERE room_id = ?').bind(roomId).run()
      await this.db.prepare('DELETE FROM user_activities WHERE room_id = ?').bind(roomId).run()
      
      // 最后删除房间记录
      console.log(`🗑️ [DELETE_ROOM] Deleting room record: ${roomId}`)
      const result = await this.db.prepare('DELETE FROM rooms WHERE id = ?').bind(roomId).run()
      
      // 验证删除是否成功
      if (result.meta?.changes === 0) {
        console.warn(`🗑️ [DELETE_ROOM] Room ${roomId} not found or already deleted`)
      } else {
        console.log(`🗑️ [DELETE_ROOM] Successfully deleted room ${roomId}, changes: ${result.meta?.changes}`)
      }
    } catch (error) {
      console.error(`🗑️ [DELETE_ROOM] Error deleting room ${roomId}:`, error)
      throw error
    }
  }

  // 获取广场房间
  async getPlazaRooms(): Promise<Room[]> {
    const result = await this.db.prepare(`
      SELECT * FROM rooms 
      WHERE plaza = 1 AND admin_published = 1
      ORDER BY last_modified DESC
    `).all()
    
    return result.results.map(row => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      lastModified: row.last_modified,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      published: Boolean(row.published),
      permission: row.permission || 'viewer',
      historyLocked: Boolean(row.history_locked),
      publish: Boolean(row.publish || row.plaza), // 兼容性字段
      description: row.description,
      tags: row.tags ? JSON.parse(row.tags) : []
    }))
  }

  // === 用户活动记录 ===
  async recordActivity(activity: UserActivity): Promise<UserActivity> {
    const stmt = this.db.prepare(`
      INSERT INTO user_activities (user_id, user_name, activity_type, room_id, room_name, activity_timestamp, session_duration, interaction_count, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = await stmt.bind(
      activity.userId, activity.userName || null, activity.activityType, activity.roomId, activity.roomName || null,
      activity.activityTimestamp, activity.sessionDuration || null, activity.interactionCount || 0, activity.metadata || null
    ).run()

    return { ...activity, id: result.meta.last_row_id as number }
  }

  async getUserRecentRooms(userId: string, limit: number = 20): Promise<UserRoomStats[]> {
    const result = await this.db.prepare(`
      SELECT user_id, room_id, room_name, visit_count, last_visit, total_duration, total_interactions
      FROM user_room_stats 
      WHERE user_id = ? 
      LIMIT ?
    `).bind(userId, limit).all()

    return result.results.map(row => ({
      userId: row.user_id as string,
      roomId: row.room_id as string,
      roomName: row.room_name as string || undefined,
      visitCount: row.visit_count as number,
      lastVisit: row.last_visit as number,
      totalDuration: row.total_duration as number || undefined,
      totalInteractions: row.total_interactions as number || undefined
    }))
  }

  async getRoomStats(roomId: string): Promise<{ visits: number, uniqueUsers: number, lastActivity: number }> {
    const result = await this.db.prepare(`
      SELECT COUNT(*) as visits, COUNT(DISTINCT user_id) as unique_users, MAX(activity_timestamp) as last_activity
      FROM user_activities 
      WHERE room_id = ? AND activity_type = 'room_visit'
    `).bind(roomId).first()

    return {
      visits: result?.visits as number || 0,
      uniqueUsers: result?.unique_users as number || 0,
      lastActivity: result?.last_activity as number || 0
    }
  }

  // === 管理功能 ===
  async getAdminSetting(key: string): Promise<string | null> {
    const result = await this.db.prepare('SELECT setting_value FROM admin_settings WHERE setting_key = ?').bind(key).first()
    return result?.setting_value as string || null
  }

  async setAdminSetting(key: string, value: string | null, adminId: string): Promise<void> {
    await this.db.prepare(`
      INSERT OR REPLACE INTO admin_settings (setting_key, setting_value, admin_id, updated_at)
      VALUES (?, ?, ?, ?)
    `).bind(key, value, adminId, Date.now()).run()
  }

  // === 清理维护 ===
  async cleanupOldActivities(daysToKeep: number = 90): Promise<number> {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)
    const result = await this.db.prepare('DELETE FROM user_activities WHERE activity_timestamp < ?').bind(cutoffTime).run()
    return result.meta.changes || 0
  }

  // === 辅助方法 ===
  private mapRowToRoom(row: any): Room {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      lastModified: row.last_modified,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      published: Boolean(row.published),
      permission: row.permission,
      historyLocked: Boolean(row.history_locked),
      // 向后兼容：优先使用publish字段，如果不存在则使用plaza字段
      publish: Boolean(row.publish !== undefined ? row.publish : row.plaza),
      description: row.description || undefined,
      tags: row.tags ? JSON.parse(row.tags) : undefined
    }
  }
}