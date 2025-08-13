// 生产环境优化版本 - API路由
import { AutoRouter, error } from 'itty-router'
import { RoomService } from './roomService-optimized'
import { createCorsResponse } from './corsConfig'

export function createApiRoutes() {
  return AutoRouter()
    // === 房间API ===
    .get('/api/rooms', async (request, env) => {
      const roomService = new RoomService(env.ROOM_DB)
      const origin = request.headers.get('Origin')
      
      try {
        const url = new URL(request.url)
        const published = url.searchParams.get('published') === 'true'
        const publish = url.searchParams.get('publish') === 'true'
        
        const rooms = await roomService.getAllRooms(
          url.searchParams.has('published') ? published : undefined,
          url.searchParams.has('publish') ? publish : undefined
        )
        
        return createCorsResponse(rooms, 200, origin, true)
      } catch (error: any) {
        return createCorsResponse({ error: error.message }, 500, origin, true)
      }
    })

    .get('/api/rooms/:roomId', async (request, env) => {
      const roomService = new RoomService(env.ROOM_DB)
      const origin = request.headers.get('Origin')
      
      try {
        const room = await roomService.getRoom(request.params.roomId)
        if (!room) {
          return createCorsResponse({ error: 'Room not found' }, 404, origin, true)
        }
        return createCorsResponse(room, 200, origin, true)
      } catch (error: any) {
        return createCorsResponse({ error: error.message }, 500, origin, true)
      }
    })

    .post('/api/rooms', async (request, env) => {
      const roomService = new RoomService(env.ROOM_DB)
      const origin = request.headers.get('Origin')
      
      try {
        const roomData = await request.json()
        const room = await roomService.createRoom(roomData)
        return createCorsResponse(room, 201, origin, true)
      } catch (error: any) {
        return createCorsResponse({ error: error.message }, 400, origin, true)
      }
    })

    .put('/api/rooms/:roomId', async (request, env) => {
      const roomService = new RoomService(env.ROOM_DB)
      const origin = request.headers.get('Origin')
      
      try {
        const updates = await request.json()
        const room = await roomService.updateRoom(request.params.roomId, updates)
        return createCorsResponse(room, 200, origin, true)
      } catch (error: any) {
        return createCorsResponse({ error: error.message }, 400, origin, true)
      }
    })

    .delete('/api/rooms/:roomId', async (request, env) => {
      const roomService = new RoomService(env.ROOM_DB)
      const origin = request.headers.get('Origin')
      
      try {
        await roomService.deleteRoom(request.params.roomId)
        return createCorsResponse({ success: true }, 200, origin, true)
      } catch (error: any) {
        return createCorsResponse({ error: error.message }, 400, origin, true)
      }
    })

    // === 用户活动API ===
    .post('/api/activities', async (request, env) => {
      const roomService = new RoomService(env.ROOM_DB)
      const origin = request.headers.get('Origin')
      
      try {
        const activity = await request.json()
        const result = await roomService.recordActivity(activity)
        return createCorsResponse(result, 201, origin, true)
      } catch (error: any) {
        return createCorsResponse({ error: error.message }, 400, origin, true)
      }
    })

    .get('/api/users/:userId/recent-rooms', async (request, env) => {
      const roomService = new RoomService(env.ROOM_DB)
      const origin = request.headers.get('Origin')
      
      try {
        const url = new URL(request.url)
        const limit = parseInt(url.searchParams.get('limit') || '20')
        const recentRooms = await roomService.getUserRecentRooms(request.params.userId, limit)
        return createCorsResponse(recentRooms, 200, origin, true)
      } catch (error: any) {
        return createCorsResponse({ error: error.message }, 500, origin, true)
      }
    })

    .get('/api/rooms/:roomId/stats', async (request, env) => {
      const roomService = new RoomService(env.ROOM_DB)
      const origin = request.headers.get('Origin')
      
      try {
        const stats = await roomService.getRoomStats(request.params.roomId)
        return createCorsResponse(stats, 200, origin, true)
      } catch (error: any) {
        return createCorsResponse({ error: error.message }, 500, origin, true)
      }
    })

    // === 发布快照同步API ===
    .post('/api/rooms/:roomId/sync-to-publish', async (request, env) => {
      const roomService = new RoomService(env.ROOM_DB)
      const origin = request.headers.get('Origin')
      
      try {
        const { version, publishedBy, publishedAt } = await request.json()
        const roomId = request.params.roomId
        
        console.log('📸 同步发布快照到发布白板:', { roomId, version, publishedBy })
        
        // 更新房间的发布状态
        const updateData = {
          publish: true,
          lastModified: publishedAt || Date.now(),
          publishNotes: `发布版本: ${version} | 发布者: ${publishedBy}`
        }
        
        await roomService.updateRoom(roomId, updateData)
        
        console.log('✅ 房间发布状态已更新')
        
        return createCorsResponse({ 
          success: true, 
          message: '发布快照同步成功',
          roomId,
          version
        }, 200, origin, true)
        
      } catch (error: any) {
        console.error('❌ 发布快照同步失败:', error)
        return createCorsResponse({ 
          error: '发布快照同步失败', 
          details: error.message 
        }, 500, origin, true)
      }
    })

    .get('/api/rooms/:roomId/publish-snapshot', async (request, env) => {
      const origin = request.headers.get('Origin')
      const roomId = request.params.roomId
      
      try {
        // 这里暂时返回提示信息，实际的快照数据由前端localStorage管理
        // 在生产环境中，可以考虑将发布快照存储到R2或其他云存储中
        return createCorsResponse({ 
          message: '发布快照由客户端管理',
          roomId,
          note: '访问 /p/' + roomId + ' 查看发布内容'
        }, 200, origin, true)
        
      } catch (error: any) {
        return createCorsResponse({ 
          error: '获取发布快照失败', 
          details: error.message 
        }, 500, origin, true)
      }
    })

    // === 管理API（简化版本）===
    .get('/api/admin/settings/:key', async (request, env) => {
      // 简单的管理员验证（生产环境应使用更严格的验证）
      const adminToken = request.headers.get('X-Admin-Token')
      if (adminToken !== env.ADMIN_TOKEN) {
        return createCorsResponse({ error: 'Unauthorized' }, 401, request.headers.get('Origin'), true)
      }

      const roomService = new RoomService(env.ROOM_DB)
      const origin = request.headers.get('Origin')
      
      try {
        const value = await roomService.getAdminSetting(request.params.key)
        return createCorsResponse({ key: request.params.key, value }, 200, origin, true)
      } catch (error: any) {
        return createCorsResponse({ error: error.message }, 500, origin, true)
      }
    })

    .post('/api/admin/settings', async (request, env) => {
      const adminToken = request.headers.get('X-Admin-Token')
      if (adminToken !== env.ADMIN_TOKEN) {
        return createCorsResponse({ error: 'Unauthorized' }, 401, request.headers.get('Origin'), true)
      }

      const roomService = new RoomService(env.ROOM_DB)
      const origin = request.headers.get('Origin')
      
      try {
        const { key, value, adminId } = await request.json()
        await roomService.setAdminSetting(key, value, adminId)
        return createCorsResponse({ success: true }, 200, origin, true)
      } catch (error: any) {
        return createCorsResponse({ error: error.message }, 400, origin, true)
      }
    })
}