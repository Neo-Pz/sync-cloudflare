// .tldr 文件管理服务 - 处理文件存储和元数据管理
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

export class TldrFileManager {
  private db: D1Database

  constructor(database: D1Database) {
    this.db = database
  }

  /**
   * 保存 .tldr 文件内容和元数据
   */
  async saveTldrFile(fileData: {
    name: string
    roomId: string
    ownerId: string
    ownerName: string
    content: TldrFileContent
    isPublic?: boolean
  }): Promise<TldrFile> {
    try {
      const fileId = this.generateFileId()
      const contentString = JSON.stringify(fileData.content)
      const contentHash = await this.generateContentHash(contentString)
      const fileSize = new TextEncoder().encode(contentString).length

      // 存储文件元数据到数据库
      const fileRecord: TldrFile = {
        id: fileId,
        name: fileData.name,
        roomId: fileData.roomId,
        ownerId: fileData.ownerId,
        ownerName: fileData.ownerName,
        fileSize,
        createdAt: Date.now(),
        lastModified: Date.now(),
        contentHash,
        isPublic: fileData.isPublic || false,
        downloadCount: 0
      }

      // 插入元数据
      const metaStmt = this.db.prepare(`
        INSERT INTO tldr_files (
          id, name, room_id, owner_id, owner_name, file_size,
          created_at, last_modified, content_hash, is_public, download_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      await metaStmt.bind(
        fileRecord.id,
        fileRecord.name,
        fileRecord.roomId,
        fileRecord.ownerId,
        fileRecord.ownerName,
        fileRecord.fileSize,
        fileRecord.createdAt,
        fileRecord.lastModified,
        fileRecord.contentHash,
        fileRecord.isPublic ? 1 : 0,
        fileRecord.downloadCount
      ).run()

      // 存储文件内容
      const contentStmt = this.db.prepare(`
        INSERT INTO tldr_file_contents (file_id, content, compressed)
        VALUES (?, ?, ?)
      `)

      // 可以选择压缩大文件
      const shouldCompress = fileSize > 10240 // 10KB
      const finalContent = shouldCompress ? 
        await this.compressContent(contentString) : 
        contentString

      await contentStmt.bind(
        fileId,
        finalContent,
        shouldCompress ? 1 : 0
      ).run()

      console.log(`✅ .tldr 文件已保存: ${fileData.name} (${fileId})`)
      return fileRecord
    } catch (error) {
      console.error('❌ 保存 .tldr 文件失败:', error)
      throw new Error('保存文件失败')
    }
  }

  /**
   * 获取 .tldr 文件内容
   */
  async getTldrFileContent(fileId: string): Promise<TldrFileContent | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT tfc.content, tfc.compressed, tf.name
        FROM tldr_file_contents tfc
        JOIN tldr_files tf ON tf.id = tfc.file_id
        WHERE tfc.file_id = ?
      `)

      const result = await stmt.bind(fileId).first()
      if (!result) return null

      let content = result.content as string
      if (result.compressed) {
        content = await this.decompressContent(content)
      }

      return JSON.parse(content) as TldrFileContent
    } catch (error) {
      console.error(`❌ 获取文件内容失败 (${fileId}):`, error)
      return null
    }
  }

  /**
   * 获取用户的 .tldr 文件列表
   */
  async getUserTldrFiles(userId: string, limit: number = 20): Promise<TldrFile[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM tldr_files
        WHERE owner_id = ?
        ORDER BY last_modified DESC
        LIMIT ?
      `)

      const result = await stmt.bind(userId, limit).all()
      return result.results.map(row => this.mapRowToTldrFile(row))
    } catch (error) {
      console.error(`❌ 获取用户文件列表失败 (${userId}):`, error)
      return []
    }
  }

  /**
   * 获取房间相关的 .tldr 文件
   */
  async getRoomTldrFiles(roomId: string): Promise<TldrFile[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM tldr_files
        WHERE room_id = ?
        ORDER BY created_at DESC
      `)

      const result = await stmt.bind(roomId).all()
      return result.results.map(row => this.mapRowToTldrFile(row))
    } catch (error) {
      console.error(`❌ 获取房间文件列表失败 (${roomId}):`, error)
      return []
    }
  }

  /**
   * 删除 .tldr 文件
   */
  async deleteTldrFile(fileId: string, userId: string): Promise<boolean> {
    try {
      // 验证文件所有权
      const ownerCheck = this.db.prepare(`
        SELECT owner_id FROM tldr_files WHERE id = ?
      `)
      const ownerResult = await ownerCheck.bind(fileId).first()
      
      if (!ownerResult || ownerResult.owner_id !== userId) {
        throw new Error('没有权限删除此文件')
      }

      // 删除文件内容
      const deleteContentStmt = this.db.prepare(`
        DELETE FROM tldr_file_contents WHERE file_id = ?
      `)
      await deleteContentStmt.bind(fileId).run()

      // 删除文件元数据
      const deleteMetaStmt = this.db.prepare(`
        DELETE FROM tldr_files WHERE id = ?
      `)
      const deleteResult = await deleteMetaStmt.bind(fileId).run()

      return deleteResult.changes > 0
    } catch (error) {
      console.error(`❌ 删除文件失败 (${fileId}):`, error)
      throw error
    }
  }

  /**
   * 更新下载计数
   */
  async incrementDownloadCount(fileId: string): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        UPDATE tldr_files 
        SET download_count = download_count + 1,
            last_modified = ?
        WHERE id = ?
      `)
      await stmt.bind(Date.now(), fileId).run()
    } catch (error) {
      console.error(`❌ 更新下载计数失败 (${fileId}):`, error)
    }
  }

  /**
   * 获取公开的 .tldr 文件列表
   */
  async getPublicTldrFiles(limit: number = 50): Promise<TldrFile[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM tldr_files
        WHERE is_public = 1
        ORDER BY download_count DESC, created_at DESC
        LIMIT ?
      `)

      const result = await stmt.bind(limit).all()
      return result.results.map(row => this.mapRowToTldrFile(row))
    } catch (error) {
      console.error('❌ 获取公开文件列表失败:', error)
      return []
    }
  }

  /**
   * 更新文件公开状态
   */
  async updateFilePublicStatus(fileId: string, userId: string, isPublic: boolean): Promise<boolean> {
    try {
      const stmt = this.db.prepare(`
        UPDATE tldr_files 
        SET is_public = ?, last_modified = ?
        WHERE id = ? AND owner_id = ?
      `)
      
      const result = await stmt.bind(
        isPublic ? 1 : 0,
        Date.now(),
        fileId,
        userId
      ).run()

      return result.changes > 0
    } catch (error) {
      console.error(`❌ 更新文件公开状态失败 (${fileId}):`, error)
      return false
    }
  }

  /**
   * 生成文件ID
   */
  private generateFileId(): string {
    return 'tldr_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
  }

  /**
   * 生成内容哈希
   */
  private async generateContentHash(content: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * 压缩内容（简单示例，实际可用更好的压缩算法）
   */
  private async compressContent(content: string): Promise<string> {
    // 这里可以实现实际的压缩逻辑
    // 简单示例：使用 gzip 或其他压缩算法
    return content // 暂时不压缩
  }

  /**
   * 解压内容
   */
  private async decompressContent(content: string): Promise<string> {
    // 对应的解压逻辑
    return content // 暂时不解压
  }

  /**
   * 将数据库行映射为 TldrFile 对象
   */
  private mapRowToTldrFile(row: any): TldrFile {
    return {
      id: row.id,
      name: row.name,
      roomId: row.room_id,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      fileSize: row.file_size,
      createdAt: row.created_at,
      lastModified: row.last_modified,
      contentHash: row.content_hash,
      isPublic: Boolean(row.is_public),
      downloadCount: row.download_count || 0
    }
  }
}