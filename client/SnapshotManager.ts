// 快照管理器 - 处理房间快照的保存和加载
import { Editor } from '@tldraw/editor'

export interface RoomSnapshot {
  roomId: string
  timestamp: number
  version: string
  data: {
    tldrawFileFormatVersion: number
    schema: any
    records: any[]
  }
  metadata: {
    pageCount: number
    shapeCount: number
    lastModified: number
    publishedBy?: string
  }
}

export interface PublishSnapshot {
  roomId: string
  publishedSlug: string
  timestamp: number
  version: string
  data: any // tldraw snapshot data
  metadata: {
    publishedBy: string
    publishedAt: number
    pageCount: number
    shapeCount: number
  }
}

export class SnapshotManager {
  /**
   * 保存房间当前状态为快照
   */
  static async saveSnapshot(editor: Editor, roomId: string, publishedBy?: string): Promise<string> {
    try {
      console.log('📸 开始保存房间快照:', roomId)
      
      // 获取编辑器完整状态
      const snapshot = editor.store.getSnapshot()
      const allRecords = Object.values(snapshot.store)
      
      // 分析数据
      const pages = allRecords.filter((record: any) => record.typeName === 'page')
      const shapes = allRecords.filter((record: any) => record.typeName === 'shape')
      
      console.log('📊 快照数据统计:', {
        totalRecords: allRecords.length,
        pages: pages.length,
        shapes: shapes.length
      })
      
      // 创建快照对象
      const roomSnapshot: RoomSnapshot = {
        roomId,
        timestamp: Date.now(),
        version: `v${Date.now()}`, // 版本号基于时间戳
        data: {
          tldrawFileFormatVersion: 1,
          schema: snapshot.schema,
          records: allRecords
        },
        metadata: {
          pageCount: pages.length,
          shapeCount: shapes.length,
          lastModified: Date.now(),
          publishedBy
        }
      }
      
      // 保存到localStorage（作为当前快照）
      const snapshotKey = `snapshot_${roomId}`
      localStorage.setItem(snapshotKey, JSON.stringify(roomSnapshot))
      
      // 同时保存到版本历史（最多保留10个版本）
      const historyKey = `snapshot_history_${roomId}`
      let history: RoomSnapshot[] = []
      
      try {
        const savedHistory = localStorage.getItem(historyKey)
        if (savedHistory) {
          history = JSON.parse(savedHistory)
        }
      } catch (e) {
        console.warn('无法解析快照历史')
      }
      
      // 添加新快照到历史
      history.unshift(roomSnapshot)
      // 限制历史记录数量
      history = history.slice(0, 10)
      
      localStorage.setItem(historyKey, JSON.stringify(history))
      
      console.log('✅ 快照保存成功:', {
        version: roomSnapshot.version,
        size: JSON.stringify(roomSnapshot).length,
        historyCount: history.length
      })
      
      return roomSnapshot.version
      
    } catch (error) {
      console.error('❌ 保存快照失败:', error)
      throw new Error(`保存快照失败: ${error}`)
    }
  }
  
  /**
   * 获取房间的当前快照
   */
  static getSnapshot(roomId: string): RoomSnapshot | null {
    try {
      const snapshotKey = `snapshot_${roomId}`
      const snapshotJson = localStorage.getItem(snapshotKey)
      
      if (!snapshotJson) {
        return null
      }
      
      return JSON.parse(snapshotJson)
    } catch (error) {
      console.error('❌ 获取快照失败:', error)
      return null
    }
  }
  
  /**
   * 获取房间的快照历史
   */
  static getSnapshotHistory(roomId: string): RoomSnapshot[] {
    try {
      const historyKey = `snapshot_history_${roomId}`
      const historyJson = localStorage.getItem(historyKey)
      
      if (!historyJson) {
        return []
      }
      
      return JSON.parse(historyJson)
    } catch (error) {
      console.error('❌ 获取快照历史失败:', error)
      return []
    }
  }
  
  /**
   * 将快照数据加载到编辑器
   */
  static async loadSnapshotToEditor(editor: Editor, snapshot: RoomSnapshot): Promise<boolean> {
    try {
      console.log('📂 开始加载快照到编辑器:', snapshot.version)
      
      // 验证快照数据
      if (!snapshot.data.records || !Array.isArray(snapshot.data.records)) {
        throw new Error('快照数据格式不正确')
      }
      
      // 等待编辑器就绪
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // 清空当前编辑器内容
      console.log('🧹 清空当前编辑器内容...')
      editor.selectAll()
      const selectedIds = editor.getSelectedShapeIds()
      if (selectedIds.length > 0) {
        editor.deleteShapes(selectedIds)
      }
      
      // 删除除第一页外的所有页面
      const currentPages = editor.getPages()
      if (currentPages.length > 1) {
        for (let i = 1; i < currentPages.length; i++) {
          editor.deletePage((currentPages[i] as any).id)
        }
      }
      
      // 加载快照数据
      console.log('📥 开始加载快照数据...')
      editor.store.mergeRemoteChanges(() => {
        // 删除当前所有非基础记录
        const currentRecords = editor.store.allRecords()
        const recordsToRemove = currentRecords.filter((r: any) => 
          r.typeName !== 'document' && 
          r.typeName !== 'camera' &&
          r.typeName !== 'instance' &&
          r.typeName !== 'instance_page_state' &&
          r.typeName !== 'pointer'
        )
        
        if (recordsToRemove.length > 0) {
          console.log('🗑️ 删除现有记录:', recordsToRemove.length, '个')
          editor.store.remove(recordsToRemove.map((r: any) => r.id))
        }
        
        // 加载快照记录
        let loadedCount = 0
        for (const record of snapshot.data.records) {
          try {
            if (record.typeName !== 'camera' && record.typeName !== 'instance') {
              editor.store.put([record])
              loadedCount++
            }
          } catch (recordError) {
            console.warn('⚠️ 跳过记录:', record.typeName, recordError)
          }
        }
        console.log('✅ 成功加载记录:', loadedCount, '个')
      })
      
      // 调整视图
      setTimeout(() => {
        try {
          const newPages = editor.getPages()
          if (newPages.length > 0) {
            console.log('📄 切换到第一个页面')
            editor.setCurrentPage((newPages[0] as any).id)
          }
          editor.zoomToFit()
          console.log('📐 视图已调整')
        } catch (zoomError) {
          console.warn('⚠️ 视图调整失败:', zoomError)
        }
      }, 300)
      
      console.log('🎉 快照加载完成!')
      return true
      
    } catch (error) {
      console.error('❌ 加载快照失败:', error)
      throw error
    }
  }
  
  /**
   * 删除房间的所有快照
   */
  static clearSnapshots(roomId: string): void {
    try {
      const snapshotKey = `snapshot_${roomId}`
      const historyKey = `snapshot_history_${roomId}`
      
      localStorage.removeItem(snapshotKey)
      localStorage.removeItem(historyKey)
      
      console.log('🧹 已清理房间快照:', roomId)
    } catch (error) {
      console.error('❌ 清理快照失败:', error)
    }
  }
  
  /**
   * 获取快照统计信息
   */
  static getSnapshotStats(roomId: string): {
    hasSnapshot: boolean
    lastUpdated?: number
    version?: string
    pageCount?: number
    shapeCount?: number
  } {
    const snapshot = this.getSnapshot(roomId)
    
    if (!snapshot) {
      return { hasSnapshot: false }
    }
    
    return {
      hasSnapshot: true,
      lastUpdated: snapshot.timestamp,
      version: snapshot.version,
      pageCount: snapshot.metadata.pageCount,
      shapeCount: snapshot.metadata.shapeCount
    }
  }



  /**
   * 获取发布快照
   */
  static getPublishSnapshot(roomId: string): RoomSnapshot | null {
    try {
      const publishKey = `publish_snapshot_${roomId}`
      const snapshotData = localStorage.getItem(publishKey)
      
      if (!snapshotData) {
        console.log('📭 未找到发布快照:', roomId)
        return null
      }
      
      const snapshot = JSON.parse(snapshotData) as RoomSnapshot
      console.log('📋 获取发布快照:', {
        roomId: snapshot.roomId,
        version: snapshot.version,
        timestamp: new Date(snapshot.timestamp).toLocaleString(),
        pageCount: snapshot.metadata.pageCount,
        shapeCount: snapshot.metadata.shapeCount
      })
      
      return snapshot
    } catch (error) {
      console.error('❌ 获取发布快照失败:', error)
      return null
    }
  }

  /**
   * 检查是否存在发布快照
   */
  static hasPublishSnapshot(roomId: string): boolean {
    const publishKey = `publish_snapshot_${roomId}`
    return localStorage.getItem(publishKey) !== null
  }

  /**
   * 清除发布快照
   */
  static clearPublishSnapshots(roomId: string): void {
    try {
      const publishKey = `publish_snapshot_${roomId}`
      const publishHistoryKey = `publish_history_${roomId}`
      
      localStorage.removeItem(publishKey)
      localStorage.removeItem(publishHistoryKey)
      
      console.log('🧹 已清理发布快照:', roomId)
    } catch (error) {
      console.error('❌ 清理发布快照失败:', error)
    }
  }

  /**
   * 保存永久发布快照 - 使用发布slug作为唯一标识
   */
  static async savePublishSnapshot(
    roomId: string, 
    publishedSlug: string, 
    snapshotData: any, 
    metadata: {
      publishedBy: string
      publishedAt: number
      version: string
    }
  ): Promise<string> {
    try {
      console.log('📸 保存永久发布快照:', { roomId, publishedSlug })
      
      // 分析快照数据
      const allRecords = Object.values(snapshotData.store || snapshotData)
      const pages = allRecords.filter((record: any) => record.typeName === 'page')
      const shapes = allRecords.filter((record: any) => record.typeName === 'shape')
      
      // 创建发布快照对象
      const publishSnapshot: PublishSnapshot = {
        roomId,
        publishedSlug,
        timestamp: metadata.publishedAt,
        version: metadata.version,
        data: snapshotData,
        metadata: {
          publishedBy: metadata.publishedBy,
          publishedAt: metadata.publishedAt,
          pageCount: pages.length,
          shapeCount: shapes.length
        }
      }
      
      // 使用发布slug作为键存储
      const publishKey = `published_${publishedSlug}`
      localStorage.setItem(publishKey, JSON.stringify(publishSnapshot))
      
      // 同步到云端 (必须成功才算发布成功)
      console.log('🌐 开始同步到云端...')
      await this.syncPublishSnapshotToCloud(publishedSlug, publishSnapshot)
      
      console.log('✅ 永久发布快照已保存:', {
        publishedSlug,
        pageCount: pages.length,
        shapeCount: shapes.length
      })
      
      return metadata.version
    } catch (error) {
      console.error('❌ 保存永久发布快照失败:', error)
      throw error
    }
  }

  /**
   * 从发布slug加载快照
   */
  static async loadPublishSnapshot(publishedSlug: string): Promise<any | null> {
    try {
      console.log('📖 加载发布快照:', publishedSlug)
      
      // 优先从云端加载，确保跨浏览器可用
      console.log('🌐 优先尝试从云端加载发布快照')
      const cloudSnapshot = await this.loadPublishSnapshotFromCloud(publishedSlug)
      if (cloudSnapshot) {
        // 缓存到本地
        const publishKey = `published_${publishedSlug}`
        localStorage.setItem(publishKey, JSON.stringify(cloudSnapshot))
        console.log('✅ 从云端加载发布快照成功')
        // 返回完整的快照对象，包含roomId等元数据
        return cloudSnapshot
      }
      
      // 如果云端没有，尝试从本地存储加载
      console.log('📱 云端未找到，尝试本地加载')
      const publishKey = `published_${publishedSlug}`
      const localData = localStorage.getItem(publishKey)
      
      if (localData) {
        const publishSnapshot: PublishSnapshot = JSON.parse(localData)
        console.log('✅ 从本地加载发布快照成功')
        // 返回完整的快照对象，包含roomId等元数据
        return publishSnapshot
      }
      
      console.warn('⚠️ 本地和云端都未找到发布快照:', publishedSlug)
      return null
    } catch (error) {
      console.error('❌ 加载发布快照失败:', error)
      return null
    }
  }

  /**
   * 清除特定的发布快照
   */
  static clearPublishSnapshot(publishedSlug: string): void {
    try {
      const publishKey = `published_${publishedSlug}`
      localStorage.removeItem(publishKey)
      console.log('🧹 已清理发布快照:', publishedSlug)
    } catch (error) {
      console.error('❌ 清理发布快照失败:', error)
    }
  }

  /**
   * 同步发布快照到云端
   */
  static async syncPublishSnapshotToCloud(publishedSlug: string, snapshot: PublishSnapshot): Promise<void> {
    try {
      const response = await fetch(`/api/publish-snapshots/${publishedSlug}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(snapshot)
      })
      
      if (response.ok) {
        console.log('✅ 发布快照已同步到云端')
      } else {
        const errorText = await response.text()
        console.error('❌ 发布快照云端同步失败:', response.status, errorText)
        throw new Error(`云端同步失败: ${response.status} ${errorText}`)
      }
    } catch (error) {
      console.error('❌ 发布快照云端同步请求失败:', error)
      throw error
    }
  }

  /**
   * 从云端加载发布快照
   */
  static async loadPublishSnapshotFromCloud(publishedSlug: string): Promise<PublishSnapshot | null> {
    try {
      const response = await fetch(`/api/publish-snapshots/${publishedSlug}`)
      
      if (response.ok) {
        const snapshot = await response.json() as PublishSnapshot
        console.log('✅ 从云端加载发布快照成功')
        return snapshot
      }
      
      return null
    } catch (error) {
      console.warn('⚠️ 从云端加载发布快照失败:', error)
      return null
    }
  }
}

export const snapshotManager = SnapshotManager 