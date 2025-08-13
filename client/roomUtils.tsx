import { Room } from './RoomManager'
import { nanoid } from 'nanoid'
import { RoomAPI } from './roomAPI'

// Feature flag to enable/disable D1 database
// 生产环境启用D1数据库
const USE_D1_DATABASE = true // 生产环境使用D1数据库
const DISABLE_ALL_API = false // 生产环境启用API调用

export const roomUtils = {
  // 确保默认房间存在
  async ensureDefaultRoom(): Promise<void> {
    const rooms = this.getAllRoomsFromLocalStorage()
    const hasDefault = rooms.some(r => r.id === 'default-room')
    
    if (!hasDefault) {
      console.log('🏠 创建默认房间')
      const defaultRoom: Room = {
        id: 'default-room',
        name: 'Welcome Board',
        createdAt: Date.now(),
        lastModified: Date.now(),
        owner: 'system',
        ownerId: 'system',
        ownerName: 'System',
        isShared: false,
        shared: false,
        published: false,
        permission: 'editor',
        publishStatus: 'private',
        description: '欢迎来到 TLDraw！这是一个默认画板。',
        tags: ['default']
      }
      
      // 同时保存到localStorage和云端数据库
      const updatedRooms = [...rooms, defaultRoom]
      localStorage.setItem('tldraw-rooms', JSON.stringify(updatedRooms))
      console.log('✅ 默认房间已创建到localStorage')
      
      // 同步到云端数据库
      if (USE_D1_DATABASE && !DISABLE_ALL_API) {
        try {
          await RoomAPI.createRoom(defaultRoom)
          console.log('✅ 默认房间已同步到云端数据库')
        } catch (error) {
          console.warn('⚠️ 默认房间同步到云端失败:', error)
        }
      }
    }
  },

  // 创建示例房间用于演示
  async createSampleRooms(): Promise<void> {
    const sampleRooms: Room[] = [
      {
        id: 'sample-design-1',
        name: '设计稿 - UI原型',
        createdAt: Date.now() - 86400000, // 1 day ago
        lastModified: Date.now() - 3600000, // 1 hour ago
        owner: 'system',
        ownerId: 'system',
        ownerName: 'System',
        isShared: true,
        shared: true,
        published: true,
        permission: 'viewer',
        publishStatus: 'published',
        description: '移动应用UI设计原型，包含主要页面流程',
        tags: ['design', 'ui', 'prototype', 'mobile']
      },
      {
        id: 'sample-brainstorm-1',
        name: '头脑风暴 - 产品规划',
        createdAt: Date.now() - 172800000, // 2 days ago
        lastModified: Date.now() - 7200000, // 2 hours ago
        owner: 'system',
        ownerId: 'system',
        ownerName: 'System',
        isShared: true,
        shared: true,
        published: false,
        permission: 'assist',
        publishStatus: 'private',
        description: '产品功能规划和用户需求分析',
        tags: ['brainstorm', 'planning', 'product']
      },
      {
        id: 'sample-diagram-1',
        name: '系统架构图',
        createdAt: Date.now() - 259200000, // 3 days ago
        lastModified: Date.now() - 10800000, // 3 hours ago
        owner: 'system',
        ownerId: 'system',
        ownerName: 'System',
        isShared: true,
        shared: true,
        published: true,
        permission: 'viewer',
        publishStatus: 'published',
        description: '后端系统架构设计图和数据流程',
        tags: ['architecture', 'system', 'diagram', 'tech']
      }
    ]

    if (USE_D1_DATABASE && !DISABLE_ALL_API) {
      for (const room of sampleRooms) {
        try {
          // 检查房间是否已存在
          const existingRoom = await RoomAPI.getRoom(room.id).catch(() => null)
          if (!existingRoom) {
            await RoomAPI.createRoom(room)
            console.log(`✅ 示例房间已创建: ${room.name}`)
          } else {
            console.log(`ℹ️ 示例房间已存在: ${room.name}`)
          }
        } catch (error) {
          console.warn(`⚠️ 创建示例房间失败: ${room.name}`, error)
        }
      }
    }

    // 也保存到localStorage
    const localRooms = this.getAllRoomsFromLocalStorage()
    const localRoomIds = new Set(localRooms.map(r => r.id))
    const newRooms = sampleRooms.filter(room => !localRoomIds.has(room.id))
    
    if (newRooms.length > 0) {
      const updatedRooms = [...localRooms, ...newRooms]
      localStorage.setItem('tldraw-rooms', JSON.stringify(updatedRooms))
      console.log(`✅ ${newRooms.length} 个示例房间已添加到localStorage`)
    }
  },

  // 获取所有房间 - 统一逻辑
  async getAllRooms(): Promise<Room[]> {
    // 始终从localStorage获取房间列表作为基础
    const localRooms = this.getAllRoomsFromLocalStorage()
    
    // 如果完全禁用API，直接返回本地数据
    if (DISABLE_ALL_API) {
      console.log('🚫 API调用已禁用，使用localStorage数据')
      return localRooms
    }
    
    // 如果云端可用，尝试同步最新数据
    if (USE_D1_DATABASE) {
      try {
        const cloudRooms = await RoomAPI.getAllRooms()
        if (cloudRooms) {
          // 以云端数据为权威来源，只保留云端存在的房间
          const cloudRoomIds = new Set(cloudRooms.map(room => room.id))
          const mergedRooms = new Map<string, Room>()
          
          // 只处理云端存在的房间
          cloudRooms.forEach(cloudRoom => {
            const localRoom = localRooms.find(r => r.id === cloudRoom.id)
            
            // 如果本地有此房间且更新时间更新，使用本地数据，否则使用云端数据
            if (localRoom && localRoom.lastModified > cloudRoom.lastModified) {
              mergedRooms.set(cloudRoom.id, localRoom)
            } else {
              mergedRooms.set(cloudRoom.id, cloudRoom)
            }
          })
          
          // 检查本地是否有云端不存在的房间（可能是新创建但尚未同步的）
          localRooms.forEach(localRoom => {
            if (!cloudRoomIds.has(localRoom.id)) {
              // 如果是最近创建的房间（5分钟内），保留它
              const isRecentlyCreated = Date.now() - localRoom.createdAt < 5 * 60 * 1000
              if (isRecentlyCreated) {
                console.log(`Keeping recently created local room: ${localRoom.name} (${localRoom.id})`)
                mergedRooms.set(localRoom.id, localRoom)
              } else {
                console.log(`Removing deleted room from localStorage: ${localRoom.name} (${localRoom.id})`)
              }
            }
          })
          
          const finalRooms = Array.from(mergedRooms.values())
          // 更新localStorage以反映真实状态
          localStorage.setItem('tldraw-rooms', JSON.stringify(finalRooms))
          
          const removedCount = localRooms.length - finalRooms.length
          if (removedCount > 0) {
            console.log(`🧹 Cleaned up ${removedCount} deleted rooms from localStorage`)
          }
          console.log(`✅ Synced rooms from cloud: ${finalRooms.length} rooms (was ${localRooms.length} locally)`)
          return finalRooms
        }
      } catch (error) {
        console.warn('Failed to fetch rooms from cloud database, using localStorage only:', error)
      }
    }
    
    // 添加额外的去重处理
    const uniqueRooms = this.deduplicateRooms(localRooms)
    if (uniqueRooms.length < localRooms.length) {
      // 如果有去重，更新localStorage
      localStorage.setItem('tldraw-rooms', JSON.stringify(uniqueRooms))
      console.log(`Removed ${localRooms.length - uniqueRooms.length} duplicate rooms from localStorage`)
      
      // 触发房间更新事件
      window.dispatchEvent(new CustomEvent('roomsUpdated', { detail: { rooms: uniqueRooms } }))
    }
    
    return uniqueRooms
  },

  // Fallback method for localStorage
  getAllRoomsFromLocalStorage(): Room[] {
    try {
      const saved = localStorage.getItem('tldraw-rooms')
      let rooms: Room[] = saved ? JSON.parse(saved) : []
      
      // 数据迁移：确保所有房间都有 publish 字段（弃用 published/plaza）
      let needsUpdate = false
      rooms = rooms.map(room => {
        const updated: any = { ...room }
        if ((room as any).publish === undefined) {
          needsUpdate = true
          updated.publish = false
        }
        // 保持plaza字段独立存在，不要删除
        if ((room as any).plaza === undefined) {
          needsUpdate = true
          updated.plaza = false  // 默认不是广场房间
        }
        // 清理旧 published 字段
        if ((room as any).published !== undefined) {
          needsUpdate = true
          delete updated.published
        }
        return updated as Room
      })
      
      // 如果需要更新，保存数据
      if (needsUpdate) {
        localStorage.setItem('tldraw-rooms', JSON.stringify(rooms))
        console.log('Room data migrated to unify publish field')
      }
      
      return rooms
    } catch (error) {
      console.error('Error loading rooms:', error)
      return []
    }
  },

  // 辅助方法：去除重复的房间
  deduplicateRooms(rooms: Room[]): Room[] {
    // 用Map按照ID去重，保留最新修改的房间
    const uniqueMap = new Map<string, Room>()
    
    // 记录每个房间ID和名称的对应关系，用于检测重复
    const roomIdCounts = new Map<string, number>()
    const roomNameCounts = new Map<string, number>()
    
    // 第一步：按照ID去重，保留最新修改的房间
    rooms.forEach(room => {
      // 计数房间ID和名称出现的次数
      roomIdCounts.set(room.id, (roomIdCounts.get(room.id) || 0) + 1)
      roomNameCounts.set(room.name, (roomNameCounts.get(room.name) || 0) + 1)
      
      // 如果Map中没有这个ID的房间，或者当前房间更新时间更新，则保留当前房间
      const existingRoom = uniqueMap.get(room.id)
      if (!existingRoom || room.lastModified > existingRoom.lastModified) {
        uniqueMap.set(room.id, room)
      }
    })
    
    // 第二步：检查名称重复的房间，为其添加后缀以区分
    const nameOccurrences = new Map<string, number>()
    const finalRooms: Room[] = []
    
    Array.from(uniqueMap.values()).forEach(room => {
      const count = nameOccurrences.get(room.name) || 0
      nameOccurrences.set(room.name, count + 1)
      
      // 如果是重复名称，添加后缀
      if (count > 0) {
        console.log(`处理重复名称: "${room.name}" (ID: ${room.id})，添加后缀 ${count+1}`)
        // 创建一个新房间对象，不修改原始对象
        finalRooms.push({
          ...room,
          name: `${room.name} (${count+1})` // 添加后缀
        })
      } else {
        finalRooms.push(room)
      }
    })
    
    // 记录重复情况
    let duplicateIdCount = 0
    let duplicateNameCount = 0
    
    roomIdCounts.forEach((count, id) => {
      if (count > 1) {
        duplicateIdCount += (count - 1)
        console.log(`发现重复房间ID: ${id}, 出现 ${count} 次`)
      }
    })
    
    roomNameCounts.forEach((count, name) => {
      if (count > 1) {
        duplicateNameCount += (count - 1)
        console.log(`发现重复房间名称: "${name}", 出现 ${count} 次`)
      }
    })
    
    if (duplicateIdCount > 0 || duplicateNameCount > 0) {
      console.log(`去重统计: ${duplicateIdCount} 个重复ID, ${duplicateNameCount} 个重复名称`)
      console.log(`去重前: ${rooms.length} 个房间, 去重后: ${finalRooms.length} 个房间`)
    }
    
    return finalRooms
  },

  // 保存房间列表
  async saveRooms(rooms: Room[]): Promise<void> {
    if (USE_D1_DATABASE) {
      // For D1, we don't save all rooms at once, individual operations are used
      console.warn('saveRooms is not used with D1 database')
      return
    }
    
    try {
      localStorage.setItem('tldraw-rooms', JSON.stringify(rooms))
      // 通知其他组件房间数据已更新
      window.dispatchEvent(new CustomEvent('roomsUpdated', { detail: { rooms } }))
    } catch (error) {
      console.error('Error saving rooms:', error)
    }
  },

  // 添加新房间 - 统一逻辑
  async addRoom(room: Room): Promise<void> {
    console.log('Creating room with ID:', room.id, 'Name:', room.name)
    
    // 确保房间ID是nanoid格式
    if (!room.id || room.id.length < 8) {
      room.id = nanoid(12)
      console.log('Generated new room ID:', room.id)
    }
    
    // 检查房间ID是否已存在
    const rooms = this.getAllRoomsFromLocalStorage()
    const existingRoom = rooms.find(r => r.id === room.id)
    if (existingRoom) {
      console.log(`房间ID ${room.id} 已存在，生成新ID`)
      room.id = nanoid(12)
      console.log('新生成的房间ID:', room.id)
    }
    
    // 总是先保存到localStorage（作为主要存储）
    const updatedRooms = [...rooms.filter(r => r.id !== room.id), room]
    localStorage.setItem('tldraw-rooms', JSON.stringify(updatedRooms))
    console.log('Room saved to localStorage')
    
    // 同时尝试同步到云端D1数据库
    if (USE_D1_DATABASE && !DISABLE_ALL_API) {
      try {
        await RoomAPI.createRoom(room)
        console.log('Room successfully synced to cloud database')
      } catch (error) {
        console.warn('Failed to sync room to cloud database (using localStorage only):', error)
        // 不抛出错误，继续使用localStorage
      }
    }
    
    // 通知其他组件房间数据已更新
    window.dispatchEvent(new CustomEvent('roomsUpdated', { detail: { rooms: updatedRooms } }))
  },

  // 更新房间 - 统一逻辑
  async updateRoom(roomId: string, updates: Partial<Room>): Promise<void> {
    console.log('Updating room:', roomId, 'with updates:', updates)
    
    // 总是先更新localStorage（作为主要存储）
    const rooms = this.getAllRoomsFromLocalStorage()
    const roomBeforeUpdate = rooms.find(r => r.id === roomId)
    const updatedRooms = rooms.map(room => 
      room.id === roomId ? { ...room, ...updates, lastModified: Date.now() } : room
    )
    localStorage.setItem('tldraw-rooms', JSON.stringify(updatedRooms))
    console.log('Room updated in localStorage')
    
    // 同时尝试同步到云端D1数据库
    if (USE_D1_DATABASE && !DISABLE_ALL_API) {
      try {
        await RoomAPI.updateRoom(roomId, { ...updates, lastModified: Date.now() })
        console.log('Room successfully synced to cloud database')
      } catch (error) {
        console.warn('Failed to sync room update to cloud database (using localStorage only):', error)
        // 不抛出错误，继续使用localStorage
      }
    }
    
    // 通知其他组件房间数据已更新
    window.dispatchEvent(new CustomEvent('roomsUpdated', { detail: { rooms: updatedRooms } }))
    
    // 如果权限或状态发生变化，触发特定事件
    let updatedRoom = updatedRooms.find(r => r.id === roomId)
    if (updatedRoom && roomBeforeUpdate && 
        (updates.permission || updates.historyLocked !== undefined || updates.published !== undefined)) {
      console.log('Permission or status changed, dispatching roomDataChanged event')
      window.dispatchEvent(new CustomEvent('roomDataChanged', { 
        detail: { 
          roomId,
          permission: updatedRoom.permission,
          historyLocked: updatedRoom.historyLocked,
          published: updatedRoom.published,
        } 
      }))
    }
  },

  // 删除房间 - 统一逻辑
  async deleteRoom(roomId: string): Promise<void> {
    console.log('Deleting room:', roomId)
    
    // 总是先从localStorage删除（作为主要存储）
    const rooms = this.getAllRoomsFromLocalStorage()
    const updatedRooms = rooms.filter(room => room.id !== roomId)
    localStorage.setItem('tldraw-rooms', JSON.stringify(updatedRooms))
    console.log('Room deleted from localStorage')
    
    // 同时尝试从云端D1数据库删除
    if (USE_D1_DATABASE && !DISABLE_ALL_API) {
      try {
        await RoomAPI.deleteRoom(roomId)
        console.log('Room successfully deleted from cloud database')
      } catch (error) {
        console.warn('Failed to delete room from cloud database (deleted from localStorage only):', error)
        // 不抛出错误，继续使用localStorage
      }
    }
    
    // 通知其他组件房间数据已更新
    window.dispatchEvent(new CustomEvent('roomsUpdated', { detail: { rooms: updatedRooms } }))
  },

  // 获取特定房间 - 统一逻辑
  // 强制清理已删除的房间（管理员删除后用户看到过期数据的问题）
  async forceCleanupDeletedRooms(): Promise<void> {
    if (!USE_D1_DATABASE || DISABLE_ALL_API) return
    
    try {
      const localRooms = this.getAllRoomsFromLocalStorage()
      const cloudRooms = await RoomAPI.getAllRooms()
      
      if (!cloudRooms) return
      
      const cloudRoomIds = new Set(cloudRooms.map(room => room.id))
      const validLocalRooms = localRooms.filter(localRoom => {
        // 保留云端存在的房间 或 最近5分钟内创建的本地房间
        const existsInCloud = cloudRoomIds.has(localRoom.id)
        const isRecentlyCreated = Date.now() - localRoom.createdAt < 5 * 60 * 1000
        
        if (!existsInCloud && !isRecentlyCreated) {
          console.log(`🗑️ Removing deleted room: ${localRoom.name} (${localRoom.id})`)
          return false
        }
        return true
      })
      
      if (validLocalRooms.length < localRooms.length) {
        localStorage.setItem('tldraw-rooms', JSON.stringify(validLocalRooms))
        const removedCount = localRooms.length - validLocalRooms.length
        console.log(`🧹 Force cleanup completed: removed ${removedCount} deleted rooms`)
      }
    } catch (error) {
      console.warn('Failed to cleanup deleted rooms:', error)
    }
  },

  async getRoom(roomId: string): Promise<Room | undefined> {
    try {
      // 先尝试从本地获取
      const rooms = this.getAllRoomsFromLocalStorage()
      const localRoom = rooms.find(r => r.id === roomId)
      
      // 如果启用了云端数据库，尝试从云端获取
      if (USE_D1_DATABASE && !DISABLE_ALL_API) {
        try {
          const cloudRoom = await RoomAPI.getRoom(roomId)
          
          // 如果云端存在此房间
          if (cloudRoom) {
            // 如果本地也有这个房间，合并数据（云端优先）
            if (localRoom) {
              const mergedRoom = {
                ...localRoom,
                ...cloudRoom,
                // 保留本地的一些特殊字段（如果云端没有）
                coverPageId: cloudRoom.coverPageId || localRoom.coverPageId,
                thumbnail: cloudRoom.thumbnail || localRoom.thumbnail
              }
              
              // 更新本地存储
              const updatedRooms = rooms.map(r => r.id === roomId ? mergedRoom : r)
              localStorage.setItem('tldraw-rooms', JSON.stringify(updatedRooms))
              
              return mergedRoom
            }
            
            // 如果本地没有，直接返回云端数据
            return cloudRoom
          }
        } catch (error) {
          console.warn('Failed to fetch room from cloud database, using localStorage:', error)
          // 云端获取失败，回退到使用本地数据
          // 不抛出错误，继续使用本地数据
        }
      }
      
      // 如果云端不可用或没有找到，使用本地数据
      return localRoom
    } catch (error) {
      console.error('Error getting room:', error)
      return undefined
    }
  },

  // 更新房间最后修改时间
  async updateRoomLastModified(roomId: string): Promise<void> {
    try {
      // 首先检查房间是否存在于localStorage
      const rooms = this.getAllRoomsFromLocalStorage()
      const localRoom = rooms.find(room => room.id === roomId)
      
      if (localRoom) {
        // 如果本地存在，正常更新
    await this.updateRoom(roomId, { lastModified: Date.now() })
      } else {
        // 如果本地不存在，可能是ID不匹配，尝试通过名称查找
        console.log(`Room with ID ${roomId} not found in localStorage, trying to find by name`)
        
        // 尝试从云端获取所有房间
        if (USE_D1_DATABASE && !DISABLE_ALL_API) {
          try {
            const cloudRooms = await RoomAPI.getAllRooms()
            // 尝试通过名称匹配（如果roomId是名称而不是ID）
            const matchingRoom = cloudRooms.find(room => 
              room.name.toLowerCase() === roomId.toLowerCase() || 
              room.id.toLowerCase() === roomId.toLowerCase()
            )
            
            if (matchingRoom) {
              console.log(`Found matching room: ${matchingRoom.name} (${matchingRoom.id})`)
              
              // 更新正确的ID
              await this.updateRoom(matchingRoom.id, { lastModified: Date.now() })
              
              // 同步到localStorage
              const updatedRooms = rooms.filter(r => r.id !== matchingRoom.id)
              updatedRooms.push(matchingRoom)
              localStorage.setItem('tldraw-rooms', JSON.stringify(updatedRooms))
              
              // 触发更新事件
              window.dispatchEvent(new CustomEvent('roomsUpdated', { detail: { rooms: updatedRooms } }))
              
              return
            }
          } catch (cloudError) {
            console.warn('Failed to fetch rooms from cloud:', cloudError)
          }
        }
        
        // 如果仍然找不到，记录错误但不抛出异常
        console.warn(`Could not find room with ID or name ${roomId}, skipping lastModified update`)
      }
    } catch (error) {
      console.error(`Error in updateRoomLastModified for room ${roomId}:`, error)
      // 不抛出错误，避免中断用户体验
    }
  },

  // 创建默认房间（如果没有房间存在）
  async createDefaultRoomIfNeeded(userId: string, userName?: string): Promise<void> {
    const rooms = await this.getAllRooms()
    
    // 检查是否存在 default-room
    const hasDefaultRoom = rooms.some(room => room.id === 'default-room')
    
    if (!hasDefaultRoom) {
      const defaultRoom: Room = {
        id: 'default-room', // 固定ID，方便重定向
        name: 'Welcome Board',
        createdAt: Date.now(),
        lastModified: Date.now(),
        owner: userId || 'anonymous',
        ownerId: userId || 'anonymous',
        ownerName: userName || 'System',
        isShared: true,
        published: true,
        permission: 'editor',
        publishStatus: 'published',
        description: '欢迎来到 TLDraw！这是一个公共画板，您可以在这里开始创作。',
        tags: ['welcome', 'public']
      }
      await this.addRoom(defaultRoom)
      console.log('✅ Created default-room for root path access')
    }
    
    // 如果用户还没有个人房间，创建一个
    if (rooms.length === 0 || (rooms.length === 1 && rooms[0].id === 'default-room')) {
      const personalRoom: Room = {
        id: nanoid(12), // 使用 nanoid 生成唯一ID
        name: 'My First Board',
        createdAt: Date.now(),
        lastModified: Date.now(),
        owner: userId || 'anonymous',
        ownerId: userId || 'anonymous',
        ownerName: userName || 'User',
        isShared: false,
        published: false,
        permission: 'editor',
        publishStatus: 'private',
        description: '这是您的第一个个人白板',
        tags: []
      }
      await this.addRoom(personalRoom)
      console.log('✅ Created personal room for user:', userId)
    }
  },

  // 发布房间
  async publishRoom(roomId: string): Promise<void> {
    await this.updateRoom(roomId, { 
      publishStatus: 'published', 
      published: true,
      isShared: true,
      lastModified: Date.now() 
    })
  },

  // 取消发布房间
  async unpublishRoom(roomId: string): Promise<void> {
    await this.updateRoom(roomId, { 
      publishStatus: 'private', 
      published: false,
      isShared: false,
      lastModified: Date.now() 
    })
  },

  // 设置房间为未列出状态
  async setRoomUnlisted(roomId: string): Promise<void> {
    await this.updateRoom(roomId, { 
      publishStatus: 'unlisted', 
      published: true,
      isShared: true,
      lastModified: Date.now() 
    })
  },

  // 设置房间为广场房间
  async setRoomPlaza(roomId: string, isPlaza: boolean): Promise<void> {
    await this.updateRoom(roomId, { 
      plaza: isPlaza,
      lastModified: Date.now() 
    })
  },

  // 获取所有已发布房间（向后兼容）
  async getPublishedRooms(): Promise<Room[]> {
    const rooms = await this.getAllRooms()
    return rooms.filter(room => room.shared === true || room.shared === true)
  },

  // 获取所有共享房间
  async getSharedRooms(): Promise<Room[]> {
    const rooms = await this.getAllRooms()
    return rooms.filter(room => room.shared === true)
  },

  // 获取所有发布白板
  async getPublishRooms(): Promise<Room[]> {
    const rooms = await this.getAllRooms()
    const publishRooms = rooms.filter(room => room.publish === true)
    
    // 不再过滤缺少快照的房间，而是返回所有标记为发布的房间
    // PublishPage会在访问时自动处理缺失的快照
    const { SnapshotManager } = await import('./SnapshotManager')
    
    // 统计快照状态用于调试
    const roomsWithSnapshots = publishRooms.filter(room => {
      return SnapshotManager.hasPublishSnapshot(room.id)
    })
    const roomsWithoutSnapshots = publishRooms.filter(room => {
      return !SnapshotManager.hasPublishSnapshot(room.id)
    })
    
    console.log(`📋 发布白板统计: 
      - 总发布房间: ${publishRooms.length}
      - 有快照: ${roomsWithSnapshots.length} (${roomsWithSnapshots.map(r => r.name).join(', ')})
      - 缺少快照: ${roomsWithoutSnapshots.length} (${roomsWithoutSnapshots.map(r => r.name).join(', ')})
      - 所有房间都将显示，缺少快照的会在访问时自动创建`)
    
    return publishRooms // 返回所有发布房间，不管是否有快照
  },

  // 调试：打印房间信息
  async debugRoomInfo(roomId: string): Promise<void> {
    try {
      const room = await this.getRoom(roomId)
      console.log('=== 房间调试信息 ===')
      console.log('房间ID:', roomId)
      console.log('房间数据:', room)
      if (room) {
        console.log('房主ID:', room.ownerId || room.owner)
        console.log('房主名称:', room.ownerName)
        console.log('历史锁定:', room.historyLocked)
        console.log('锁定时间:', room.historyLockTimestamp ? new Date(room.historyLockTimestamp).toLocaleString() : '未锁定')
        console.log('锁定人ID:', room.historyLockedBy)
        console.log('锁定人名称:', room.historyLockedByName)
      }
      console.log('==================')
    } catch (error) {
      console.error('获取房间调试信息失败:', error)
    }
  },

  // 锁定历史：房主全选后锁定，基于tldraw原生锁定机制
  async lockHistory(roomId: string, editor?: any, userId?: string, userName?: string): Promise<void> {
    if (!editor) {
      console.error('Editor instance required for lockHistory')
      return
    }

    try {
      // 遍历所有页，锁定每页的所有形状
      const pages = editor.getPages?.() || []
      let totalLocked = 0
      for (const page of pages) {
        try {
          editor.setCurrentPage?.(page.id)
          const shapes = editor.getCurrentPageShapes?.() || []
          const unlocked = shapes.filter((s: any) => !s.isLocked)
          unlocked.forEach((shape: any) => {
            editor.updateShape({ id: shape.id, type: shape.type, isLocked: true })
          })
          totalLocked += unlocked.length
        } catch {}
      }
      console.log(`Locked ${totalLocked} shapes across ${pages.length} pages`)
        
      // 获取房间，确保使用房主ID记录锁定者
      const currentRoom = await this.getRoom(roomId)
      const ownerId = (currentRoom as any)?.ownerId || (currentRoom as any)?.owner || userId || 'anonymous'

      // 更新房间状态为历史锁定
      const lockTimestamp = Date.now()
      const updateData = {
        historyLocked: true,
        historyLockTimestamp: lockTimestamp,
        historyLockedBy: ownerId,
        historyLockedByName: userName || (currentRoom as any)?.ownerName || 'Owner',
        lastModified: Date.now() 
      }
      
      await this.updateRoom(roomId, updateData)
      
      // 确保localStorage也更新了锁定人信息
      console.log(`History locked by: ${userName} (${userId}) at ${new Date(lockTimestamp).toLocaleString()}`)
      
      console.log(`History locked for room ${roomId} at timestamp ${lockTimestamp}`)
    } catch (error) {
      console.error('Error locking history:', error)
      throw error
    }
  },

  // 解锁历史：只有房主能手动解锁，或者辅作模式变编辑时自动解锁
  async unlockHistory(roomId: string, editor?: any, userId?: string, isAutoUnlock = false, silent = false): Promise<void> {
    if (!editor) {
      console.error('Editor instance required for unlockHistory')
      return
    }

    try {
      // 获取房间信息
      const room = await this.getRoom(roomId)
      if (!room) {
        throw new Error('Room not found')
      }

      // 如果不是自动解锁，验证用户是否为房主或锁定人
      if (!isAutoUnlock && userId && 
          room.ownerId !== userId && 
          room.owner !== userId && 
          room.historyLockedBy !== userId) {
        throw new Error('Only room owner or person who locked history can unlock it')
      }

      // 遍历所有页，解锁每页的被锁定形状
      const pages = editor.getPages?.() || []
      let totalUnlocked = 0
      console.log(`🔓 unlockHistory: Found ${pages.length} pages to process`)
      
      for (const page of pages) {
        try {
          editor.setCurrentPage?.(page.id)
          const shapes = editor.getCurrentPageShapes?.() || []
          const locked = shapes.filter((s: any) => s.isLocked)
          console.log(`🔓 Page ${page.id}: Found ${locked.length} locked shapes out of ${shapes.length} total shapes`)
          
          locked.forEach((shape: any) => {
            console.log(`🔓 Unlocking shape ${shape.id} (type: ${shape.type})`)
            editor.updateShape({ id: shape.id, type: shape.type, isLocked: false })
          })
          totalUnlocked += locked.length
        } catch (error) {
          console.error(`🔓 Error processing page ${page.id}:`, error)
        }
      }
      console.log(`🔓 Unlocked ${totalUnlocked} shapes across ${pages.length} pages`)

      // 更新房间状态为未锁定
      await this.updateRoom(roomId, { 
        historyLocked: false,
        historyLockTimestamp: undefined,
        historyLockedBy: undefined,
        historyLockedByName: undefined,
        lastModified: Date.now() 
      })
      
      console.log(`History unlocked for room ${roomId}${isAutoUnlock ? ' (auto)' : ''}`)
    } catch (error) {
      console.error('Error unlocking history:', error)
      throw error
    }
  },


  // 应用历史锁定到编辑器（防止编辑历史元素）
  async applyHistoryLockRestrictions(roomId: string, editor: any): Promise<void> {
    if (!editor) return
    
    try {
      const room = await this.getRoom(roomId)
      if (!room || !room.historyLocked || !room.historyLockTimestamp) {
        return // 没有锁定历史
      }
      
      // 🔥 关键修复：检查当前用户是否为房主，房主不受任何限制！
      const currentUserId = (window as any).__CURRENT_USER_ID__
      if (currentUserId && (room.ownerId === currentUserId || room.owner === currentUserId)) {
        console.log(`🔓 房主 ${currentUserId} 不受历史锁定限制，跳过所有权限限制`)
        return // 房主不受限制，直接返回
      }
      
      // 额外保护：如果没有 __CURRENT_USER_ID__，尝试从其他地方获取
      const clerkUser = (window as any).Clerk?.user
      const clerkUserId = clerkUser?.id
      if (clerkUserId && (room.ownerId === clerkUserId || room.owner === clerkUserId)) {
        console.log(`🔓 房主 ${clerkUserId} (Clerk) 不受历史锁定限制`)
        return // 房主不受限制，直接返回
      }
      
      console.log(`Applying history lock restrictions for room ${roomId} (non-owner)`)
      
      // 监听形状更新事件，阻止对历史形状的编辑
      const checkShapeEdit = (shape: any) => {
        if (shape.meta?.createdAt && shape.meta.createdAt <= room.historyLockTimestamp!) {
          // 这是历史形状，不允许编辑
          console.log(`Blocked edit on historical shape: ${shape.id}`)
          return false
        }
        return true
      }
      
      // 这里需要集成到tldraw的事件系统中
      // 暂时先记录日志，后续完善
      console.log('History lock restrictions applied')
      
    } catch (error) {
      console.error('Error applying history lock restrictions:', error)
    }
  },

  // 根据权限变化自动处理历史锁定
  async handlePermissionChange(roomId: string, newPermission: 'viewer' | 'editor' | 'assist', editor?: any, userId?: string, userName?: string, previousPermission?: 'viewer' | 'editor' | 'assist', silent?: boolean): Promise<void> {
    try {
      const room = await this.getRoom(roomId)
      if (!room) {
        return
      }

      console.log(`Permission changed from ${previousPermission || 'unknown'} to ${newPermission} for room ${roomId}`)

      // 🔥 特殊处理：辅作 → 浏览 的直接清理操作
      if (previousPermission === 'assist' && newPermission === 'viewer') {
        console.log('🔄 辅作→浏览模式：直接清理锁定状态')
        
        // 清理历史锁定状态（与编辑模式相同的清理逻辑）
        if (room.historyLocked && editor) {
          console.log('  清理历史锁定状态')
          await this.unlockHistory(roomId, editor, userId, true, false)
          console.log('  ✅ 历史锁定状态已清理')
        }
        
        // 显示浏览模式通知
        console.log('👀 Viewer mode activated - read-only mode')
        this.showModeChangeNotification('浏览模式已激活', '已从辅作模式切换到只读模式', '👀')
        
        return // 清理完成，直接返回
      }

      // 🔥 其他情况的处理：辅作 → 编辑 的清理逻辑
      const needsCleaning = previousPermission === 'assist' && newPermission === 'editor' && room.historyLocked && editor
      if (needsCleaning) {
        console.log(`🔄 从辅作模式切换到${newPermission}模式，先清理历史锁定状态`)
        await this.unlockHistory(roomId, editor, userId, true, false) // 与辅作→编辑使用完全相同的参数
      }

      if (newPermission === 'assist') {
        // 辅作模式 = 锁定历史模式
        const isOwner = userId && (room.ownerId === userId || room.owner === userId)
        
        console.log(`🔄 辅作模式激活 - 用户ID: ${userId}, 房主ID: ${room.ownerId}/${room.owner}, 是否房主: ${isOwner}`)
        
        if (editor) {
          console.log('Switching to assist mode, locking history')
          
          // 显示模式切换通知
          if (!silent) {
            this.showModeChangeNotification('辅助模式已激活', '历史内容已自动锁定，只能编辑新添加的内容', '🔒')
          }
          
          // 🔥 重要：所有用户都执行锁定，房主限制在applyHistoryLockRestrictions中处理
          await this.lockHistory(roomId, editor, userId, userName)
          console.log('✅ 辅作模式历史锁定完成')
        } else {
          console.log('⚠️ 编辑器不存在，无法执行辅作模式锁定')
        }
      } else if (newPermission === 'editor') {
        // 编辑模式：状态已在开头清理，显示通知即可
        console.log('✏️ Editor mode activated - full editing permissions')
        if (!silent) {
          if (previousPermission === 'assist') {
            // 从辅作模式切换到编辑模式
            this.showModeChangeNotification('编辑模式已激活', '历史锁定已解除，现在可以编辑所有内容', '✏️')
          } else {
            // 从其他模式切换到编辑模式
            this.showModeChangeNotification('编辑模式已激活', '现在可以编辑所有内容', '✏️')
          }
        }
      } else if (newPermission === 'viewer') {
        // 浏览模式：其他情况的浏览模式切换
        console.log('👀 Viewer mode activated - read-only mode')
        if (!silent) {
          this.showModeChangeNotification('浏览模式已激活', '现在为完全只读模式', '👀')
        }
      }
      
    } catch (error) {
      console.error('Error handling permission change:', error)
    }
  },

  // 显示模式切换通知
  showModeChangeNotification(title: string, message: string, icon: string): void {
    // 创建通知元素
    const notification = document.createElement('div')
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 9999;
      max-width: 350px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      transform: translateX(400px);
      transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    `
    
    notification.innerHTML = `
      <div style="display: flex; align-items: flex-start; gap: 12px;">
        <div style="font-size: 24px; line-height: 1; margin-top: 2px;">${icon}</div>
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">${title}</div>
          <div style="font-size: 14px; opacity: 0.9; line-height: 1.4;">${message}</div>
        </div>
        <button onclick="this.parentElement.parentElement.remove()" style="
          background: none;
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          opacity: 0.7;
          padding: 0;
          margin-left: 8px;
          line-height: 1;
        ">×</button>
      </div>
    `
    
    document.body.appendChild(notification)
    
    // 动画进入
    setTimeout(() => {
      notification.style.transform = 'translateX(0)'
    }, 100)
    
    // 自动消失
    setTimeout(() => {
      notification.style.transform = 'translateX(400px)'
      notification.style.opacity = '0'
      setTimeout(() => {
        if (notification.parentElement) {
          notification.parentElement.removeChild(notification)
        }
      }, 300)
    }, 4000)
  },

  // 检查是否可以编辑特定形状（基于历史锁定时间戳）
  canEditShape(shape: any, room: any): { canEdit: boolean; reason?: string } {
    // 如果房间没有历史锁定，所有形状都可以编辑
    if (!room.historyLocked || !room.historyLockTimestamp) {
      return { canEdit: true }
    }

    // 如果形状没有创建时间，假设它是锁定之前的（不可编辑）
    if (!shape.meta?.createdAt) {
      return { 
        canEdit: false, 
        reason: '此元素创建于历史锁定之前，无法编辑' 
      }
    }

    // 比较形状创建时间和历史锁定时间
    const shapeCreatedAt = shape.meta.createdAt
    const historyLockTime = room.historyLockTimestamp

    if (shapeCreatedAt < historyLockTime) {
      return { 
        canEdit: false, 
        reason: `此元素创建于历史锁定之前 (${new Date(shapeCreatedAt).toLocaleString()})，无法编辑` 
      }
    }

    return { canEdit: true }
  },

  // 额外的辅助方法：清理工作空间历史中的重复项
  cleanupWorkspaceHistory(): boolean {
    try {
      const savedHistory = localStorage.getItem('roomHistory')
      if (!savedHistory) return false
      
      let history = JSON.parse(savedHistory)
      if (!Array.isArray(history)) return false
      
      // 记录原始长度
      const originalLength = history.length
      
      // 按ID去重，保留最近访问的房间
      const uniqueMap = new Map()
      const idCounts = new Map()
      
      // 统计每个ID出现的次数
      history.forEach(room => {
        if (!room || !room.name) return
        idCounts.set(room.name, (idCounts.get(room.name) || 0) + 1)
      })
      
      // 记录重复情况
      let duplicateCount = 0
      idCounts.forEach((count, id) => {
        if (count > 1) {
          duplicateCount += (count - 1)
          console.log(`工作空间中发现重复房间: ${id}, 出现 ${count} 次`)
        }
      })
      
      if (duplicateCount > 0) {
        console.log(`工作空间中总共有 ${duplicateCount} 个重复房间`)
        
        // 按lastVisited倒序排序，确保保留最近访问的房间
        history.sort((a, b) => (b.lastVisited || 0) - (a.lastVisited || 0))
        
        // 遍历并去重
        history.forEach(room => {
          if (!room || !room.name) return
          if (!uniqueMap.has(room.name)) {
            uniqueMap.set(room.name, room)
          }
        })
        
        const uniqueHistory = Array.from(uniqueMap.values())
        console.log(`工作空间房间去重: ${originalLength} -> ${uniqueHistory.length}`)
        
        // 保存回localStorage
        localStorage.setItem('roomHistory', JSON.stringify(uniqueHistory))
        
        // 触发更新事件
        window.dispatchEvent(new CustomEvent('workspaceHistoryUpdated', { 
          detail: { history: uniqueHistory } 
        }))
        
        return true
      }
    } catch (error) {
      console.error('Error cleaning up workspace history:', error)
    }
    
    return false
  },

  // 确保所有房间都有正确的ID
  async validateAndFixRoomIds(): Promise<void> {
    console.log('🔧 Validating and fixing room IDs...')
    const rooms = this.getAllRoomsFromLocalStorage()
    let hasChanges = false
    
    const validatedRooms = rooms.map(room => {
      // 检查房间ID
      if (!room.id || room.id.length < 8 || room.id === 'undefined' || room.id === 'null') {
        const newId = nanoid(12)
        console.log(`🔧 Fixed room ID: "${room.id}" -> "${newId}" for room "${room.name}"`)
        hasChanges = true
        return { ...room, id: newId, lastModified: Date.now() }
      }
      return room
    })
    
    if (hasChanges) {
      localStorage.setItem('tldraw-rooms', JSON.stringify(validatedRooms))
      console.log(`✅ Fixed ${validatedRooms.length} room IDs`)
      
      // 触发更新事件
      window.dispatchEvent(new CustomEvent('roomsUpdated', { detail: { rooms: validatedRooms } }))
    }
  },

  // 为房间建立页面索引
  async buildRoomPageIndex(roomId: string, editor?: any): Promise<{ [pageId: string]: { index: number, name: string, id: string } }> {
    const pageIndex: { [pageId: string]: { index: number, name: string, id: string } } = {}
    
    if (editor) {
      try {
        const pages = editor.getPages()
        console.log(`📚 Building page index for room ${roomId}, found ${pages.length} pages`)
        
        pages.forEach((page: any, index: number) => {
          pageIndex[page.id] = {
            index: index,
            name: page.name || `Page ${index + 1}`,
            id: page.id
          }
        })
        
        console.log('📚 Page index built:', pageIndex)
        return pageIndex
      } catch (error) {
        console.warn('❌ Failed to build page index:', error)
      }
    }
    
    return pageIndex
  },

  // 获取当前工作空间的完整信息（房间+页面+视窗）
  getCurrentWorkspaceInfo(roomId: string, editor?: any): {
    roomId: string,
    pageId: string,
    pageName: string,
    pageIndex: number,
    viewport: { x: number, y: number, width: number, height: number } | null,
    totalPages: number,
    useSimplePageIndex: boolean
  } | null {
    console.log('🏢 Getting workspace info for room:', roomId, 'editor available:', !!editor)
    
    if (!editor) {
      console.warn('❌ Editor not available for workspace info')
      return null
    }
    
    try {
      // 获取当前页面信息
      const currentPage = editor.getCurrentPage()
      const currentPageId = editor.getCurrentPageId()
      const allPages = editor.getPages()
      
      console.log('📄 Current page info:', { currentPage: currentPage?.name, currentPageId, totalPages: allPages?.length })
      
      // 找到当前页面的索引
      const pageIndex = allPages.findIndex((page: any) => page.id === currentPageId)
      
      // 获取视窗信息
      let viewport = null
      try {
        const camera = editor.getCamera()
        const viewportBounds = editor.getViewportScreenBounds()
        if (camera && viewportBounds) {
          viewport = {
            x: Math.round(-camera.x),
            y: Math.round(-camera.y), 
            width: Math.round(viewportBounds.w),
            height: Math.round(viewportBounds.h)
          }
          console.log('📍 Viewport info extracted:', viewport)
        }
      } catch (viewportError) {
        console.warn('❌ Failed to get viewport info:', viewportError)
      }
      
      const workspaceInfo = {
        roomId: roomId,
        pageId: currentPageId || 'default',
        pageName: currentPage?.name || `Page ${pageIndex + 1}`,
        pageIndex: Math.max(0, pageIndex),
        viewport: viewport,
        totalPages: allPages?.length || 1,
        useSimplePageIndex: true
      }
      
      console.log('✅ Workspace info generated:', workspaceInfo)
      return workspaceInfo
    } catch (error) {
      console.error('❌ Failed to get workspace info:', error)
      return null
    }
  },

  // 根据页面索引获取页面ID
  getPageIdByIndex(editor: any, pageIndex: number): string | null {
    try {
      const pages = editor.getPages()
      if (pages && pages[pageIndex]) {
        return pages[pageIndex].id
      }
    } catch (error) {
      console.warn('❌ Failed to get page by index:', error)
    }
    return null
  },

  // 根据页面ID获取页面索引
  getPageIndexById(editor: any, pageId: string): number {
    try {
      const pages = editor.getPages()
      const index = pages.findIndex((page: any) => page.id === pageId)
      return index >= 0 ? index : 0
    } catch (error) {
      console.warn('❌ Failed to get page index:', error)
      return 0
    }
  },

  // 获取当前房间ID
  getCurrentRoomId(): string {
    // 从URL解析房间ID
    const urlParts = window.location.pathname.split('/')
    if (urlParts.length >= 3 && urlParts[1] === 'r') {
      return urlParts[2]
    }
    
    // 从其他路由格式解析
    const boardMatch = window.location.pathname.match(/\/board\/([^\/\?]+)/)
    if (boardMatch) {
      return boardMatch[1]
    }
    
    // 默认返回
    return 'default-room'
  }
}

// 全局暴露更新函数，供其他组件使用
;(window as any).updateRoomLastModified = (roomId: string) => {
  roomUtils.updateRoomLastModified(roomId).catch(error => {
    console.error('Error updating room last modified:', error)
  })
}