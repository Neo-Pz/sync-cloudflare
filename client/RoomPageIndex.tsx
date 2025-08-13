import { TLPageId } from '@tldraw/editor'

// 页面信息接口
export interface RoomPageInfo {
  name: string
  id: TLPageId
}

// 房间信息接口
export interface RoomInfo {
  name: string
  lastVisited: number
  isExpanded: boolean
  pages: RoomPageInfo[]
  lastPageName?: string
}

// 房间页面索引管理器
export class RoomPageIndexManager {
  private static instance: RoomPageIndexManager
  private roomPagesMap: Map<string, RoomPageInfo[]> = new Map()

  static getInstance(): RoomPageIndexManager {
    if (!RoomPageIndexManager.instance) {
      RoomPageIndexManager.instance = new RoomPageIndexManager()
    }
    return RoomPageIndexManager.instance
  }

  // 注册房间页面
  registerRoomPage(roomId: string, pageName: string, pageId: TLPageId): void {
    if (!this.roomPagesMap.has(roomId)) {
      this.roomPagesMap.set(roomId, [])
    }
    
    const pages = this.roomPagesMap.get(roomId)!
    const existingIndex = pages.findIndex(p => p.id === pageId)
    
    if (existingIndex >= 0) {
      // 更新现有页面
      pages[existingIndex] = { name: pageName, id: pageId }
    } else {
      // 添加新页面
      pages.push({ name: pageName, id: pageId })
    }
    
    this.saveToStorage()
  }

  // 获取房间页面
  getRoomPages(roomId: string): RoomPageInfo[] {
    return this.roomPagesMap.get(roomId) || []
  }

  // 检查页面名称在房间内是否唯一
  isPageNameUniqueInRoom(roomId: string, pageName: string, excludeId?: TLPageId): boolean {
    const pages = this.getRoomPages(roomId)
    return !pages.some(p => p.name === pageName && p.id !== excludeId)
  }

  // 生成唯一页面名称
  generateUniquePageName(roomId: string, baseName: string): string {
    let counter = 1
    let uniqueName = baseName
    
    while (!this.isPageNameUniqueInRoom(roomId, uniqueName)) {
      uniqueName = `${baseName} ${counter}`
      counter++
    }
    
    return uniqueName
  }

  // 删除页面
  removePage(roomId: string, pageId: TLPageId): void {
    const pages = this.roomPagesMap.get(roomId)
    if (pages) {
      const index = pages.findIndex(p => p.id === pageId)
      if (index >= 0) {
        pages.splice(index, 1)
        this.saveToStorage()
      }
    }
  }

  // 保存到本地存储
  private saveToStorage(): void {
    try {
      const data = Array.from(this.roomPagesMap.entries())
      localStorage.setItem('room-pages-index', JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save room pages index:', error)
    }
  }

  // 从本地存储加载
  loadFromStorage(): void {
    try {
      const saved = localStorage.getItem('room-pages-index')
      if (saved) {
        const data = JSON.parse(saved)
        this.roomPagesMap = new Map(data)
      }
    } catch (error) {
      console.error('Failed to load room pages index:', error)
    }
  }
}

// 房间历史管理器
export class RoomHistoryManager {
  private static instance: RoomHistoryManager
  private history: RoomInfo[] = []
  
  static getInstance(): RoomHistoryManager {
    if (!RoomHistoryManager.instance) {
      RoomHistoryManager.instance = new RoomHistoryManager()
    }
    return RoomHistoryManager.instance
  }

  // 更新房间历史
  updateRoomHistory(roomId: string, pages: RoomPageInfo[], currentPageName?: string): void {
    const existingIndex = this.history.findIndex(room => room.name === roomId)
    
    const updatedRoom: RoomInfo = {
      name: roomId,
      lastVisited: Date.now(),
      isExpanded: existingIndex >= 0 ? this.history[existingIndex].isExpanded : true,
      pages: pages,
      lastPageName: currentPageName
    }

    if (existingIndex >= 0) {
      this.history[existingIndex] = updatedRoom
    } else {
      this.history.unshift(updatedRoom)
    }

    // 按访问时间排序并限制数量
    this.history.sort((a, b) => b.lastVisited - a.lastVisited)
    this.history = this.history.slice(0, 20)
    
    this.saveToStorage()
  }

  // 获取房间历史
  getRoomHistory(): RoomInfo[] {
    return this.history
  }

  // 切换房间展开状态
  toggleRoomExpansion(roomId: string): void {
    const room = this.history.find(r => r.name === roomId)
    if (room) {
      room.isExpanded = !room.isExpanded
      this.saveToStorage()
    }
  }

  // 清空历史
  clearHistory(): void {
    this.history = []
    this.saveToStorage()
  }

  // 删除房间历史
  removeRoomHistory(roomId: string): void {
    this.history = this.history.filter(r => r.name !== roomId)
    this.saveToStorage()
  }

  // 保存到本地存储
  private saveToStorage(): void {
    try {
      localStorage.setItem('room-history', JSON.stringify(this.history))
    } catch (error) {
      console.error('Failed to save room history:', error)
    }
  }

  // 从本地存储加载
  loadFromStorage(): void {
    try {
      const saved = localStorage.getItem('room-history')
      if (saved) {
        this.history = JSON.parse(saved)
      }
    } catch (error) {
      console.error('Failed to load room history:', error)
    }
  }
}