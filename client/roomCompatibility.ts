// 房间数据向后兼容性工具
import type { Room } from './RoomManager'

/**
 * 检查房间是否已发布（兼容旧的plaza字段）
 */
export const isRoomPublished = (room: Room): boolean => {
  // 优先使用新的publish字段，fallback到旧的plaza字段
  return room.publish || (room as any).plaza || false
}

/**
 * 迁移房间数据，将plaza字段转换为publish字段
 */
export const migrateRoomData = (room: Room): Room => {
  const hasPublish = room.publish !== undefined
  const hasPlaza = (room as any).plaza !== undefined
  
  // 如果已有publish字段，直接返回
  if (hasPublish) {
    return room
  }
  
  // 如果只有plaza字段，迁移到publish
  if (hasPlaza && !hasPublish) {
    return {
      ...room,
      publish: (room as any).plaza
      // 可以选择删除plaza字段：
      // plaza: undefined
    }
  }
  
  // 默认为未发布
  return {
    ...room,
    publish: false
  }
}

/**
 * 批量迁移房间数据
 */
export const migrateRoomsData = (rooms: Room[]): Room[] => {
  return rooms.map(migrateRoomData)
}

/**
 * 获取发布房间（兼容性版本）
 */
export const getPublishedRooms = (rooms: Room[]): Room[] => {
  return rooms.filter(isRoomPublished)
}