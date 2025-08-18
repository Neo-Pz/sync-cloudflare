// Cloudflare Worker service for room management

export interface Room {
  id: string
  name: string
  createdAt: number
  lastModified: number
  owner: string
  ownerId: string
  ownerName: string
  isShared: boolean
  shared: boolean
  permission: 'viewer' | 'editor' | 'assist'
  thumbnail?: string
  coverPageId?: string
  shareStatus?: 'private' | 'shared' | 'unlisted'
  description?: string
  tags?: string[]
  publishRequestStatus?: 'none' | 'pending' | 'approved' | 'rejected'
  publishRequestDate?: number
  adminPublished?: boolean
  publishNotes?: string
  historyLocked?: boolean
  publish?: boolean  // 是否在发布包中显示
  plaza?: boolean   // 是否在广场显示
  plaza_request?: boolean  // 是否申请广场 (0=未申请, 1=已申请)
}

export interface PublishRequest {
  id: string
  roomId: string
  roomName: string
  userId: string
  userName: string
  requestedPlaza: boolean
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: number
  reviewedAt?: number
  reviewedBy?: string
}

export interface Comment {
  id: string
  roomId: string
  userId: string
  userName: string
  userEmail?: string
  comment: string
  createdAt: number
  updatedAt?: number
  isDeleted: boolean
  parentCommentId?: string
  likeCount: number
  replyCount: number
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

export class RoomService {
  private db: D1Database

  constructor(db: D1Database) {
    this.db = db
  }

  // Transfer room ownership (admin only)
  async transferRoomOwner(roomId: string, newOwnerId: string, newOwnerName?: string): Promise<Room> {
    const existing = await this.getRoom(roomId)
    if (!existing) {
      throw new Error(`Room not found: ${roomId}`)
    }

    const targetOwnerName = newOwnerName || existing.ownerName || 'User'

    // 复用通用更新逻辑，确保 lastModified 一并更新
    const updated = await this.updateRoom(roomId, {
      ownerId: newOwnerId,
      owner: newOwnerId,
      ownerName: targetOwnerName,
    })

    return updated
  }

  // Get all rooms
  async getAllRooms(): Promise<Room[]> {
    const result = await this.db.prepare('SELECT * FROM rooms ORDER BY last_modified DESC').all()
    return result.results.map(row => this.mapRowToRoom(row))
  }

  // Get room by ID
  async getRoom(roomId: string): Promise<Room | null> {
    const result = await this.db.prepare('SELECT * FROM rooms WHERE id = ?').bind(roomId).first()
    return result ? this.mapRowToRoom(result) : null
  }

  // Create a new room
  async createRoom(room: Room): Promise<Room> {
    // 先检查是否已存在相同ID的房间
    const existingRoom = await this.getRoom(room.id)
    if (existingRoom) {
      throw new Error(`Room with ID ${room.id} already exists`)
    }
    
    const stmt = this.db.prepare(`
      INSERT INTO rooms (
        id, name, created_at, last_modified, owner, owner_id, owner_name,
        is_shared, shared, published, permission, thumbnail, cover_page_id, 
        publish_status, description, tags, publish, plaza, plaza_request
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    await stmt.bind(
      room.id,
      room.name,
      room.createdAt,
      room.lastModified,
      room.owner,
      room.ownerId,
      room.ownerName,
      room.isShared ? 1 : 0,
      room.shared ? 1 : 0,
      room.published ? 1 : 0,
      room.permission,
      room.thumbnail || null,
      room.coverPageId || null,
      room.publishStatus || 'private',
      room.description || null,
      room.tags ? JSON.stringify(room.tags) : null,
      room.publish ? 1 : 0,
      0, // plaza 默认为 0
      0  // plaza_request 默认为 0
    ).run()

    return room
  }

  // Update a room
  async updateRoom(roomId: string, updates: Partial<Room>): Promise<Room> {
    const existing = await this.getRoom(roomId)
    if (!existing) {
      throw new Error(`Room not found: ${roomId}`)
    }

    const updatedRoom = { ...existing, ...updates, lastModified: Date.now() }

    const stmt = this.db.prepare(`
      UPDATE rooms SET 
        name = ?, last_modified = ?, owner = ?, owner_id = ?, owner_name = ?,
        is_shared = ?, shared = ?, permission = ?, thumbnail = ?, 
        cover_page_id = ?, publish_status = ?, description = ?, tags = ?, publish = ?
      WHERE id = ?
    `)

    await stmt.bind(
      updatedRoom.name,
      updatedRoom.lastModified,
      updatedRoom.owner,
      updatedRoom.ownerId,
      updatedRoom.ownerName,
      updatedRoom.isShared ? 1 : 0,
      updatedRoom.shared ? 1 : 0,
      updatedRoom.permission,
      updatedRoom.thumbnail || null,
      updatedRoom.coverPageId || null,
      updatedRoom.publishStatus || 'private',
      updatedRoom.description || null,
      updatedRoom.tags ? JSON.stringify(updatedRoom.tags) : null,
      updatedRoom.publish ? 1 : 0,
      roomId
    ).run()

    return updatedRoom
  }

  // Delete a room
  async deleteRoom(roomId: string): Promise<void> {
    console.log(`🗑️ [DELETE_ROOM] Starting deletion for room: ${roomId}`)
    
    try {
      // 为避免外键约束失败，先清理依赖此房间的记录
      // 说明：部分表未开启 ON DELETE CASCADE（如 publish_requests），需要手动删除
      console.log(`🗑️ [DELETE_ROOM] Deleting related data for room: ${roomId}`)
      
      // 安全删除：检查表是否存在再执行删除
      try {
        await this.db.prepare('DELETE FROM publish_requests WHERE room_id = ?').bind(roomId).run()
        console.log(`🗑️ [DELETE_ROOM] Deleted publish_requests for room: ${roomId}`)
      } catch (e) {
        console.warn(`🗑️ [DELETE_ROOM] Could not delete from publish_requests:`, e.message)
      }
      
      try {
        await this.db.prepare('DELETE FROM comments WHERE room_id = ?').bind(roomId).run()
        console.log(`🗑️ [DELETE_ROOM] Deleted comments for room: ${roomId}`)
      } catch (e) {
        console.warn(`🗑️ [DELETE_ROOM] Could not delete from comments:`, e.message)
      }
      
      try {
        await this.db.prepare('DELETE FROM share_configs WHERE roomId = ?').bind(roomId).run()
        console.log(`🗑️ [DELETE_ROOM] Deleted share_configs for room: ${roomId}`)
      } catch (e) {
        console.warn(`🗑️ [DELETE_ROOM] Could not delete from share_configs:`, e.message)
      }
      
      try {
        await this.db.prepare('DELETE FROM user_activities WHERE room_id = ?').bind(roomId).run()
        console.log(`🗑️ [DELETE_ROOM] Deleted user_activities for room: ${roomId}`)
      } catch (e) {
        console.warn(`🗑️ [DELETE_ROOM] Could not delete from user_activities:`, e.message)
      }
      
      // tldr_files 和 tldr_file_contents 可能不存在于生产环境
      try {
        await this.db.prepare('DELETE FROM tldr_files WHERE room_id = ?').bind(roomId).run()
        console.log(`🗑️ [DELETE_ROOM] Deleted tldr_files for room: ${roomId}`)
      } catch (e) {
        console.warn(`🗑️ [DELETE_ROOM] Could not delete from tldr_files (table may not exist):`, e.message)
      }

      // 最后删除房间本身
      console.log(`🗑️ [DELETE_ROOM] Deleting room record: ${roomId}`)
      const result = await this.db.prepare('DELETE FROM rooms WHERE id = ?').bind(roomId).run()
      
      // 验证删除是否成功
      if (result.meta?.changes === 0) {
        console.warn(`🗑️ [DELETE_ROOM] Room ${roomId} not found or already deleted`)
        throw new Error(`Room ${roomId} not found`)
      } else {
        console.log(`🗑️ [DELETE_ROOM] Successfully deleted room ${roomId}, changes: ${result.meta?.changes}`)
      }
    } catch (error) {
      console.error(`🗑️ [DELETE_ROOM] Error deleting room ${roomId}:`, error)
      throw error
    }
  }

  // Get shared rooms only
  async getSharedRooms(): Promise<Room[]> {
    const result = await this.db.prepare('SELECT * FROM rooms WHERE shared = 1 ORDER BY last_modified DESC').all()
    return result.results.map(row => this.mapRowToRoom(row))
  }

  // Get rooms by owner
  async getRoomsByOwner(ownerId: string): Promise<Room[]> {
    const result = await this.db.prepare('SELECT * FROM rooms WHERE owner_id = ? ORDER BY last_modified DESC').bind(ownerId).all()
    return result.results.map(row => this.mapRowToRoom(row))
  }

  // Admin function: Toggle publish permission for a room
  async toggleAdminPublish(roomId: string, adminPublished: boolean, adminId: string, notes?: string): Promise<Room> {
    const existing = await this.getRoom(roomId)
    if (!existing) {
      throw new Error(`Room not found: ${roomId}`)
    }

    const stmt = this.db.prepare(`
      UPDATE rooms SET 
        admin_published = ?, 
        publish_notes = ?,
        last_modified = ?
      WHERE id = ?
    `)

    await stmt.bind(
      adminPublished ? 1 : 0,
      notes || null,
      Date.now(),
      roomId
    ).run()

    return { ...existing, adminPublished, publishNotes: notes }
  }

  // 发布到共享空间（简化版本，取消审核）
  async publishToShared(roomId: string, userId: string, userName: string): Promise<void> {
    const now = Date.now();;
    
    await this.db.prepare(`
      UPDATE rooms SET 
        shared = 1,
        admin_published = 1,
        last_modified = ?
      WHERE id = ?
    `).bind(now, roomId).run()
    
    console.log(`📤 房间 ${roomId} 已共享到共享空间`)
  }

  // 取消共享空间共享
  async unshareFromShared(roomId: string): Promise<void> {
    const now = Date.now();
    
    await this.db.prepare(`
      UPDATE rooms SET 
        shared = 0,
        admin_published = 0,
        last_modified = ?
      WHERE id = ?
    `).bind(now, roomId).run()
    
    console.log(`🔒 房间 ${roomId} 已取消共享空间共享`)
  }

  // 发布到广场（简化版本，取消审核）
  async publishToPlaza(roomId: string, userId: string, userName: string): Promise<void> {
    const now = Date.now();
    
    await this.db.prepare(`
      UPDATE rooms SET 
        publish = 1,
        last_modified = ?
      WHERE id = ?
    `).bind(now, roomId).run()
    
    console.log(`🎨 房间 ${roomId} 已发布到广场`)
  }

  // 取消广场发布
  async unpublishFromPlaza(roomId: string): Promise<void> {
    const now = Date.now();
    
    await this.db.prepare(`
      UPDATE rooms SET 
        publish = 0,
        last_modified = ?
      WHERE id = ?
    `).bind(now, roomId).run()
    
    console.log(`🏠 房间 ${roomId} 已取消广场发布`)
  }

  // 同步房间到广场 - 更新广场版本信息
  async syncRoomToPlaza(roomId: string, syncInfo: {
    version: string
    sharedBy: string
    sharedAt: number
    lastSynced: number
  }): Promise<void> {
    const { version, sharedBy, sharedAt, lastSynced } = syncInfo
    
    // 检查房间是否已发布到广场
    const room = await this.getRoom(roomId)
    if (!room || !room.publish) {
      throw new Error('房间未发布到广场，无法同步')
    }
    
    // 更新房间的广场同步信息
    // 这里可以扩展存储更多同步元数据
    await this.db.prepare(`
      UPDATE rooms SET 
        last_modified = ?,
        description = COALESCE(description, '') || CHAR(10) || '最新版本 ' || ? || ' (同步于 ' || datetime(?, 'unixepoch') || ')'
      WHERE id = ?
    `).bind(lastSynced, version, Math.floor(lastSynced / 1000), roomId).run()
    
    console.log(`🔄 房间 ${roomId} 已同步到广场，版本 ${version}`)
  }

  // Create a publish request (保留用于兼容性)
  async createPublishRequest(roomId: string, roomName: string, userId: string, userName: string, requestedPlaza: boolean = false, submittedAt?: number): Promise<PublishRequest> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = submittedAt || Date.now()
    
    // 现在所有请求都自动通过
    const request: PublishRequest = {
      id: requestId,
      roomId,
      roomName,
      userId,
      userName,
      requestedPlaza,
      status: 'approved', // 自动通过
      submittedAt: now,
      reviewedAt: now,
      reviewedBy: 'SYSTEM'
    }

    // Insert the request
    const stmt = this.db.prepare(`
      INSERT INTO publish_requests (
        id, room_id, room_name, user_id, user_name, requested_publish, request_date, status, review_date, admin_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    await stmt.bind(
      request.id,
      request.roomId,
      request.roomName,
      request.userId,
      request.userName,
      request.requestedPlaza ? 1 : 0,
      request.submittedAt,
      request.status,
      request.reviewedAt,
      request.reviewedBy
    ).run()

    // 直接更新房间状态
    if (requestedPlaza) {
      await this.publishToPlaza(roomId, userId, userName)
    } else {
      await this.publishToShared(roomId, userId, userName)
    }

    return request
  }

  // Get all publish requests
  async getPublishRequests(): Promise<PublishRequest[]> {
    const result = await this.db.prepare(`
      SELECT * FROM publish_requests 
      ORDER BY submitted_at DESC
    `).all()
    
    return result.results.map(row => this.mapRowToPublishRequest(row))
  }

  // Handle publish request (approve/reject)
  async handlePublishRequest(requestId: string, status: 'approved' | 'rejected', adminId: string, adminName: string, notes?: string): Promise<PublishRequest> {
    const now = Date.now();
    
    // Update the request
    const stmt = this.db.prepare(`
      UPDATE publish_requests SET 
        status = ?, review_date = ?, admin_name = ?
      WHERE id = ?
    `)
    
    await stmt.bind(status, now, adminName, requestId).run()

    // Get the updated request
    const requestResult = await this.db.prepare('SELECT * FROM publish_requests WHERE id = ?').bind(requestId).first()
    if (!requestResult) {
      throw new Error(`Request not found: ${requestId}`)
    }

    const request = this.mapRowToPublishRequest(requestResult)

    // Update the room status - only for publish requests
    if (request.requestedPlaza) {
      await this.db.prepare(`
        UPDATE rooms SET 
          publish_request_status = ?,
          publish = ?,
          publish_notes = ?
        WHERE id = ?
      `).bind(status, status === 'approved' ? 1 : 0, notes || null, request.roomId).run()
    } else {
      // For publish requests, just update the status
      await this.db.prepare(`
        UPDATE rooms SET 
          publish_request_status = ?,
          admin_published = ?,
          publish_notes = ?
        WHERE id = ?
      `).bind(status, status === 'approved' ? 1 : 0, notes || null, request.roomId).run()
    }

    return request
  }

    // Comment methods
  async getRoomComments(roomId: string): Promise<Comment[]> {
    const result = await this.db.prepare(`
      SELECT * FROM comments 
      WHERE room_id = ? AND is_deleted = 0
      ORDER BY created_at ASC
    `).bind(roomId).all()
    
    return result.results.map(row => this.mapRowToComment(row))
  }

  async createComment(roomId: string, userId: string, userName: string, userEmail: string, comment: string, parentCommentId?: string): Promise<Comment> {
    const commentId = `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = Date.now();
    
    const newComment: Comment = {
      id: commentId,
      roomId,
      userId,
      userName,
      userEmail,
      comment,
      createdAt: now,
      isDeleted: false,
      parentCommentId,
      likeCount: 0,
      replyCount: 0
    }

    const stmt = this.db.prepare(`
      INSERT INTO comments (id, room_id, user_id, user_name, user_email, comment, created_at, parent_comment_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    
    await stmt.bind(
      commentId, roomId, userId, userName, userEmail || null, comment, now, parentCommentId || null
    ).run()

    return newComment
  }

  private mapRowToComment(row: any): Comment {
    return {
      id: row.id,
      roomId: row.room_id,
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
      comment: row.comment,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isDeleted: Boolean(row.is_deleted),
      parentCommentId: row.parent_comment_id,
      likeCount: row.like_count || 0,
      replyCount: row.reply_count || 0
    }
  }

  // Get publish request by room
  async getPublishRequestByRoom(roomId: string): Promise<PublishRequest | null> {
    const result = await this.db.prepare(`
      SELECT * FROM publish_requests 
      WHERE room_id = ? 
      ORDER BY submitted_at DESC 
      LIMIT 1
    `).bind(roomId).first()
    
    return result ? this.mapRowToPublishRequest(result) : null
  }

  private mapRowToPublishRequest(row: any): PublishRequest {
    return {
      id: row.id,
      roomId: row.room_id,
      roomName: row.room_name || '未命名房间',
      userId: row.user_id,
      userName: row.user_name,
      requestedPlaza: Boolean(row.requested_publish),
      status: row.status,
      submittedAt: row.request_date,
      reviewedAt: row.review_date,
      reviewedBy: row.admin_name
    }
  }





  // Helper method to map database row to Room object
  private mapRowToRoom(row: any): Room {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      lastModified: row.last_modified,
      owner: row.owner,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      isShared: Boolean(row.is_shared),
      shared: Boolean(row.shared),
      permission: row.permission as 'viewer' | 'editor',
      thumbnail: row.thumbnail || undefined,
      coverPageId: row.cover_page_id || undefined,
      shareStatus: row.share_status || 'private',
      description: row.description || undefined,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      publishRequestStatus: row.publish_request_status || 'none',
      publishRequestDate: row.publish_request_date || undefined,
      adminPublished: Boolean(row.admin_published),
      publishNotes: row.publish_notes || undefined,
      historyLocked: Boolean(row.history_locked),
      publish: Boolean(row.publish),
      plaza: Boolean(row.plaza),
      plaza_request: Boolean(row.plaza_request)
    }
  }



  // Admin settings management
  async setAdminSetting(key: string, value: string | null, adminId: string): Promise<void> {
    const now = Date.now();
    
    // Use INSERT OR REPLACE to handle both insert and update cases
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO admin_settings (
        setting_key, setting_value, admin_id, updated_at
      ) VALUES (?, ?, ?, ?)
    `)

    await stmt.bind(key, value, adminId, now).run()
  }

  async getAdminSetting(key: string): Promise<string | null> {
    const result = await this.db.prepare(`
      SELECT setting_value FROM admin_settings 
      WHERE setting_key = ?
    `).bind(key).first()

    return result ? (result.setting_value as string | null) : null
  }

  async getAllAdminSettings(): Promise<Record<string, string>> {
    const result = await this.db.prepare(`
      SELECT setting_key, setting_value FROM admin_settings
    `).all()

    const settings: Record<string, string> = {}
    result.results.forEach((row: any) => {
      if (row.setting_value !== null) {
        settings[row.setting_key] = row.setting_value as string
      }
    })

    return settings
  }

  async deleteAdminSetting(key: string): Promise<void> {
    await this.db.prepare(`
      DELETE FROM admin_settings WHERE setting_key = ?
    `).bind(key).run()
  }

  // 获取广场房间
  async getPlazaRooms(): Promise<Room[]> {
    const result = await this.db.prepare(`
      SELECT * FROM rooms 
      WHERE plaza = 1 AND admin_published = 1
      ORDER BY last_modified DESC
    `).all()
    
    return result.results.map(row => this.mapRowToRoom(row))
  }

  // 更新房间的共享状态
  async updateRoomSharedStatus(roomId: string, isShared: boolean): Promise<Room> {
    const existing = await this.getRoom(roomId)
    if (!existing) {
      throw new Error(`Room not found: ${roomId}`)
    }

    const updatedRoom = { ...existing, shared: isShared, lastModified: Date.now() }

    await this.db.prepare(`
      UPDATE rooms SET is_shared = ?, last_modified = ?
      WHERE id = ?
    `).bind(isShared ? 1 : 0, updatedRoom.lastModified, roomId).run()

    return updatedRoom
  }

  // 更新房间的广场状态
  async updateRoomPlazaStatus(roomId: string, isPlaza: boolean): Promise<Room> {
    const existing = await this.getRoom(roomId)
    if (!existing) {
      throw new Error(`Room not found: ${roomId}`)
    }

    const updatedRoom = { ...existing, plaza: isPlaza, lastModified: Date.now() }

    await this.db.prepare(`
      UPDATE rooms SET plaza = ?, last_modified = ?
      WHERE id = ?
    `).bind(isPlaza ? 1 : 0, updatedRoom.lastModified, roomId).run()

    return updatedRoom
  }

  // 更新房间的广场申请状态
  async updateRoomPlazaRequest(roomId: string, plazaRequest: boolean): Promise<Room> {
    const existing = await this.getRoom(roomId)
    if (!existing) {
      throw new Error(`Room not found: ${roomId}`)
    }

    const updatedRoom = { ...existing, plaza_request: plazaRequest, lastModified: Date.now() }

    await this.db.prepare(`
      UPDATE rooms SET plaza_request = ?, last_modified = ?
      WHERE id = ?
    `).bind(plazaRequest ? 1 : 0, updatedRoom.lastModified, roomId).run()

    return updatedRoom
  }


  // === 用户行为记录相关方法 ===

  // 记录用户活动
  async recordUserActivity(activity: UserActivity): Promise<UserActivity> {
    const stmt = this.db.prepare(`
      INSERT INTO user_activities (
        user_id, user_name, activity_type, room_id, room_name,
        activity_timestamp, session_duration, interaction_count,
        last_page_id, last_page_name, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = await stmt.bind(
      activity.userId,
      activity.userName || null,
      activity.activityType,
      activity.roomId,
      activity.roomName || null,
      activity.activityTimestamp,
      activity.sessionDuration || null,
      activity.interactionCount || 0,
      activity.lastPageId || null,
      activity.lastPageName || null,
      activity.metadata || null
    ).run()

    return { ...activity, id: result.meta.last_row_id as number }
  }

  // 获取用户最近访问的房间
  async getUserRecentRooms(userId: string, limit: number = 20): Promise<UserRoomStats[]> {
    const stmt = this.db.prepare(`
      SELECT 
        user_id,
        room_id,
        room_name,
        COUNT(*) as visit_count,
        MAX(activity_timestamp) as last_visit,
        SUM(session_duration) as total_duration,
        SUM(interaction_count) as total_interactions,
        AVG(session_duration) as avg_session_duration
      FROM user_activities 
      WHERE user_id = ? AND activity_type = 'room_visit'
      GROUP BY user_id, room_id
      ORDER BY last_visit DESC
      LIMIT ?
    `)

    const result = await stmt.bind(userId, limit).all()
    return result.results.map(row => this.mapRowToUserRoomStats(row))
  }

  // 获取用户在特定房间的活动历史
  async getUserRoomActivities(userId: string, roomId: string, limit: number = 50): Promise<UserActivity[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM user_activities 
      WHERE user_id = ? AND room_id = ?
      ORDER BY activity_timestamp DESC
      LIMIT ?
    `)

    const result = await stmt.bind(userId, roomId, limit).all()
    return result.results.map(row => this.mapRowToUserActivity(row))
  }

  // 获取房间的访问统计
  async getRoomVisitStats(roomId: string, limit: number = 100): Promise<UserActivity[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM user_activities 
      WHERE room_id = ? AND activity_type = 'room_visit'
      ORDER BY activity_timestamp DESC
      LIMIT ?
    `)

    const result = await stmt.bind(roomId, limit).all()
    return result.results.map(row => this.mapRowToUserActivity(row))
  }

  // 更新用户活动（用于更新会话时长等）
  async updateUserActivity(activityId: number, updates: Partial<UserActivity>): Promise<UserActivity> {
    const existing = await this.db.prepare('SELECT * FROM user_activities WHERE id = ?').bind(activityId).first()
    if (!existing) {
      throw new Error(`Activity not found: ${activityId}`)
    }

    const updatedActivity = { ...this.mapRowToUserActivity(existing), ...updates }

    const stmt = this.db.prepare(`
      UPDATE user_activities SET 
        session_duration = ?, interaction_count = ?, last_page_id = ?, 
        last_page_name = ?, metadata = ?, updated_at = ?
      WHERE id = ?
    `)

    await stmt.bind(
      updatedActivity.sessionDuration || null,
      updatedActivity.interactionCount || 0,
      updatedActivity.lastPageId || null,
      updatedActivity.lastPageName || null,
      updatedActivity.metadata || null,
      Date.now(),
      activityId
    ).run()

    return updatedActivity
  }

  // 清理旧的用户活动记录（定期维护）
  async cleanupOldActivities(daysToKeep: number = 90): Promise<number> {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)
    const stmt = this.db.prepare(`
      DELETE FROM user_activities 
      WHERE activity_timestamp < ?
    `)
    
    const result = await stmt.bind(cutoffTime).run()
    return result.meta.changes || 0
  }

  // Helper methods for mapping database rows
  private mapRowToUserActivity(row: any): UserActivity {
    return {
      id: row.id,
      userId: row.user_id,
      userName: row.user_name || undefined,
      activityType: row.activity_type as UserActivity['activityType'],
      roomId: row.room_id,
      roomName: row.room_name || undefined,
      activityTimestamp: row.activity_timestamp,
      sessionDuration: row.session_duration || undefined,
      interactionCount: row.interaction_count || 0,
      lastPageId: row.last_page_id || undefined,
      lastPageName: row.last_page_name || undefined,
      metadata: row.metadata || undefined
    }
  }

  private mapRowToUserRoomStats(row: any): UserRoomStats {
    return {
      userId: row.user_id,
      roomId: row.room_id,
      roomName: row.room_name || undefined,
      visitCount: row.visit_count,
      lastVisit: row.last_visit,
      totalDuration: row.total_duration || undefined,
      totalInteractions: row.total_interactions || undefined,
      avgSessionDuration: row.avg_session_duration || undefined
    }
  }
}
