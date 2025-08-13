// 发布申请管理服务
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

export class PublishRequestService {
  constructor(private env: any) {}

  /**
   * 创建发布申请表
   */
  async initDatabase() {
    await this.env.DB.exec(`
      CREATE TABLE IF NOT EXISTS publish_requests (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        room_name TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        requested_plaza INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        submitted_at INTEGER NOT NULL,
        reviewed_at INTEGER,
        reviewed_by TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_publish_requests_room_id ON publish_requests(room_id);
      CREATE INDEX IF NOT EXISTS idx_publish_requests_status ON publish_requests(status);
      CREATE INDEX IF NOT EXISTS idx_publish_requests_submitted_at ON publish_requests(submitted_at);
    `)
  }

  /**
   * 提交发布申请
   */
  async submitPublishRequest(data: {
    roomId: string
    roomName: string
    userId: string
    userName: string
    requestedPlaza: boolean
    submittedAt: number
  }): Promise<PublishRequest> {
    // 检查是否已有待审核的申请
    const existing = await this.env.DB.prepare(`
      SELECT * FROM publish_requests 
      WHERE room_id = ? AND status = 'pending'
    `).bind(data.roomId).first()

    if (existing) {
      throw new Error('该房间已有待审核的发布申请')
    }

    const id = crypto.randomUUID()
    
    await this.env.DB.prepare(`
      INSERT INTO publish_requests (
        id, room_id, room_name, user_id, user_name, 
        requested_plaza, status, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).bind(
      id,
      data.roomId,
      data.roomName,
      data.userId,
      data.userName,
      data.requestedPlaza ? 1 : 0,
      data.submittedAt
    ).run()

    return {
      id,
      roomId: data.roomId,
      roomName: data.roomName,
      userId: data.userId,
      userName: data.userName,
      requestedPlaza: data.requestedPlaza,
      status: 'pending',
      submittedAt: data.submittedAt
    }
  }

  /**
   * 获取所有发布申请
   */
  async getAllPublishRequests(): Promise<PublishRequest[]> {
    const results = await this.env.DB.prepare(`
      SELECT * FROM publish_requests 
      ORDER BY submitted_at DESC
    `).all()

    return results.results.map(this.mapRowToRequest)
  }

  /**
   * 获取待审核的发布申请
   */
  async getPendingPublishRequests(): Promise<PublishRequest[]> {
    const results = await this.env.DB.prepare(`
      SELECT * FROM publish_requests 
      WHERE status = 'pending'
      ORDER BY submitted_at ASC
    `).all()

    return results.results.map(this.mapRowToRequest)
  }

  /**
   * 获取特定房间的发布申请状态
   */
  async getRoomPublishStatus(roomId: string): Promise<{ status: 'none' | 'pending' | 'approved' | 'rejected' }> {
    const result = await this.env.DB.prepare(`
      SELECT status FROM publish_requests 
      WHERE room_id = ? 
      ORDER BY submitted_at DESC 
      LIMIT 1
    `).bind(roomId).first()

    return {
      status: result?.status || 'none'
    }
  }

  /**
   * 审核发布申请
   */
  async reviewPublishRequest(
    requestId: string, 
    action: 'approve' | 'reject', 
    reviewedBy: string
  ): Promise<PublishRequest | null> {
    const now = Date.now()
    
    await this.env.DB.prepare(`
      UPDATE publish_requests 
      SET status = ?, reviewed_at = ?, reviewed_by = ?
      WHERE id = ?
    `).bind(
      action === 'approve' ? 'approved' : 'rejected',
      now,
      reviewedBy,
      requestId
    ).run()

    const result = await this.env.DB.prepare(`
      SELECT * FROM publish_requests WHERE id = ?
    `).bind(requestId).first()

    return result ? this.mapRowToRequest(result) : null
  }

  /**
   * 删除发布申请
   */
  async deletePublishRequest(requestId: string): Promise<boolean> {
    const result = await this.env.DB.prepare(`
      DELETE FROM publish_requests WHERE id = ?
    `).bind(requestId).run()

    return result.changes > 0
  }

  /**
   * 将数据库行映射为PublishRequest对象
   */
  private mapRowToRequest(row: any): PublishRequest {
    return {
      id: row.id,
      roomId: row.room_id,
      roomName: row.room_name,
      userId: row.user_id,
      userName: row.user_name,
      requestedPlaza: Boolean(row.requested_plaza),
      status: row.status,
      submittedAt: row.submitted_at,
      reviewedAt: row.reviewed_at || undefined,
      reviewedBy: row.reviewed_by || undefined
    }
  }
}