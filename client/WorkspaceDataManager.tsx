// WorkspaceDataManager - 统一管理工作空间数据源
import { userActivityAPI, UserRoomStats } from './userActivityAPI'
import { roomUtils } from './roomUtils'

export interface RoomHistoryInfo {
    name: string // 房间ID
    displayName: string // 房间显示名称
    lastVisited: number
    pages?: { name: string; id: string }[]
    lastPageName?: string
    isExpanded?: boolean
    permission?: 'viewer' | 'editor' | 'assist'
}

export class WorkspaceDataManager {
    private static instance: WorkspaceDataManager | null = null
    private readonly STORAGE_KEY = 'roomHistory'
    private readonly MAX_HISTORY = 20
    
    // 单例模式
    public static getInstance(): WorkspaceDataManager {
        if (!this.instance) {
            this.instance = new WorkspaceDataManager()
        }
        return this.instance
    }

    // 统一数据获取 - 合并本地存储和数据库数据
    public async getWorkspaceRooms(userId?: string): Promise<RoomHistoryInfo[]> {
        try {
            // 1. 从localStorage获取本地历史
            const localRooms = this.getLocalRoomHistory()
            
            // 2. 如果有用户ID，从数据库获取用户访问统计
            let dbRooms: RoomHistoryInfo[] = []
            if (userId) {
                try {
                    const userStats = await userActivityAPI.getUserRoomStats(userId)
                    dbRooms = this.convertUserStatsToHistory(userStats, localRooms)
                } catch (error) {
                    console.log('Database not available, using local data only:', error)
                }
            }
            
            // 3. 合并和去重数据
            const mergedRooms = this.mergeRoomData(localRooms, dbRooms)
            
            // 4. 排序和限制数量
            return this.sortAndLimitRooms(mergedRooms)
            
        } catch (error) {
            console.error('Error getting workspace rooms:', error)
            return this.getLocalRoomHistory()
        }
    }
    
    // 添加房间到工作空间
    public async addRoom(roomInfo: Partial<RoomHistoryInfo>): Promise<void> {
        const rooms = this.getLocalRoomHistory()
        
        const newRoom: RoomHistoryInfo = {
            name: roomInfo.name!,
            displayName: roomInfo.displayName || roomInfo.name!,
            lastVisited: Date.now(),
            pages: roomInfo.pages || [],
            lastPageName: roomInfo.lastPageName,
            isExpanded: false,
            permission: roomInfo.permission || 'editor'
        }
        
        // 移除旧的相同房间
        const filteredRooms = rooms.filter(room => room.name !== newRoom.name)
        
        // 添加新房间到开头
        const updatedRooms = [newRoom, ...filteredRooms].slice(0, this.MAX_HISTORY)
        
        this.saveLocalRoomHistory(updatedRooms)
    }
    
    // 更新房间信息
    public async updateRoom(roomId: string, updates: Partial<RoomHistoryInfo>): Promise<void> {
        const rooms = this.getLocalRoomHistory()
        const updatedRooms = rooms.map(room => 
            room.name === roomId 
                ? { ...room, ...updates, lastVisited: Date.now() }
                : room
        )
        
        this.saveLocalRoomHistory(updatedRooms)
    }
    
    // 从工作空间移除房间
    public async removeRoom(roomId: string): Promise<void> {
        const rooms = this.getLocalRoomHistory()
        const filteredRooms = rooms.filter(room => room.name !== roomId)
        
        this.saveLocalRoomHistory(filteredRooms)
    }
    
    // 清空工作空间
    public async clearWorkspace(): Promise<void> {
        localStorage.removeItem(this.STORAGE_KEY)
    }
    
    // 获取本地存储的房间历史
    private getLocalRoomHistory(): RoomHistoryInfo[] {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY)
            if (saved) {
                return JSON.parse(saved) as RoomHistoryInfo[]
            }
        } catch (error) {
            console.error('Error parsing local room history:', error)
        }
        return []
    }
    
    // 保存到本地存储
    private saveLocalRoomHistory(rooms: RoomHistoryInfo[]): void {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(rooms))
        } catch (error) {
            console.error('Error saving room history:', error)
        }
    }
    
    // 将用户统计数据转换为历史格式
    private convertUserStatsToHistory(userStats: UserRoomStats[], localRooms: RoomHistoryInfo[]): RoomHistoryInfo[] {
        return userStats.map(stats => {
            // 查找对应的本地数据
            const localRoom = localRooms.find(r => r.name === stats.roomId)
            
            return {
                name: stats.roomId,
                displayName: localRoom?.displayName || stats.roomName || stats.roomId,
                lastVisited: new Date(stats.lastVisitTime).getTime(),
                pages: localRoom?.pages || [],
                lastPageName: localRoom?.lastPageName,
                isExpanded: localRoom?.isExpanded || false,
                permission: localRoom?.permission || 'editor'
            }
        })
    }
    
    // 合并本地和数据库数据
    private mergeRoomData(localRooms: RoomHistoryInfo[], dbRooms: RoomHistoryInfo[]): RoomHistoryInfo[] {
        if (dbRooms.length === 0) {
            return localRooms
        }
        
        const roomMap = new Map<string, RoomHistoryInfo>()
        
        // 先添加数据库数据（权威来源）
        dbRooms.forEach(room => {
            roomMap.set(room.name, room)
        })
        
        // 合并本地数据（保留本地独有的信息）
        localRooms.forEach(localRoom => {
            const existing = roomMap.get(localRoom.name)
            if (existing) {
                // 合并数据，本地的页面信息和展开状态优先
                roomMap.set(localRoom.name, {
                    ...existing,
                    pages: localRoom.pages || existing.pages,
                    lastPageName: localRoom.lastPageName || existing.lastPageName,
                    isExpanded: localRoom.isExpanded || existing.isExpanded,
                    // 使用较新的时间戳
                    lastVisited: Math.max(localRoom.lastVisited, existing.lastVisited)
                })
            } else {
                // 本地独有的房间
                roomMap.set(localRoom.name, localRoom)
            }
        })
        
        return Array.from(roomMap.values())
    }
    
    // 排序和限制数量
    private sortAndLimitRooms(rooms: RoomHistoryInfo[]): RoomHistoryInfo[] {
        return rooms
            .sort((a, b) => b.lastVisited - a.lastVisited) // 按最后访问时间降序
            .slice(0, this.MAX_HISTORY) // 限制数量
    }
}

// 导出单例实例
export const workspaceManager = WorkspaceDataManager.getInstance()