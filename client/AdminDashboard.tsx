import React, { useState, useEffect } from 'react'
import { useUser } from '@clerk/clerk-react'
import { Room } from './RoomManager'
import { RoomAPI } from './roomAPI'

interface UserProfile {
  userId: string
  userName: string
  userEmail: string
  role: 'admin' | 'user' | 'guest'
  status: 'active' | 'suspended' | 'banned'
  createdAt: number
  lastLogin: number
  roomCount: number
}

interface SystemStats {
  totalUsers: number
  totalRooms: number
  publishedRooms: number
  activeUsers: number
  storageUsed: string
}

interface AdminLog {
  id: string
  adminId: string
  adminName: string
  action: string
  targetType: string
  targetId: string
  details: string
  timestamp: number
}

interface PublishRequest {
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

export const AdminDashboard: React.FC = () => {
  const { user } = useUser()
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'rooms' | 'publish-requests' | 'logs'>('overview')
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [users, setUsers] = useState<UserProfile[]>([])
  const [logs, setLogs] = useState<AdminLog[]>([])
  const [publishRequests, setPublishRequests] = useState<PublishRequest[]>([])
  const [loading, setLoading] = useState(false)

  // 正式管理员权限检查
  const isAdmin = user?.publicMetadata?.role === 'admin' || 
                  user?.emailAddresses?.[0]?.emailAddress?.includes('admin') ||
                  // 正式管理员邮箱列表
                  ['010.carpe.diem@gmail.com', 'admin@example.com', 'administrator@tldraw.com'].includes(user?.emailAddresses?.[0]?.emailAddress || '')

  // 权限状态监控
  useEffect(() => {
    if (isAdmin) {
      loadDashboardData()
    }
  }, [isAdmin])

  // 定期检查权限状态（防止会话过期）
  useEffect(() => {
    const checkPermissions = () => {
      if (!user || !isAdmin) {
        // 如果用户权限发生变化，清空数据并显示警告
        setStats(null)
        setRooms([])
        setUsers([])
        setLogs([])
        alert('⚠️ 您的管理员权限已失效，请重新登录')
        window.location.href = '/'
      }
    }

    // 每5分钟检查一次权限
    const interval = setInterval(checkPermissions, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [user, isAdmin])

  const loadDashboardData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadStats(),
        loadRooms(),
        loadUsers(),
        loadLogs(),
        loadPublishRequests()
      ])
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const allRooms = await RoomAPI.getAllRooms()
      const publishedRooms = allRooms.filter(room => room.published)
      
      // 模拟用户统计数据
      const uniqueOwners = new Set(allRooms.map(room => room.ownerId))
      
      setStats({
        totalUsers: uniqueOwners.size,
        totalRooms: allRooms.length,
        publishedRooms: publishedRooms.length,
        activeUsers: Math.floor(uniqueOwners.size * 0.7), // 模拟活跃用户
        storageUsed: `${(allRooms.length * 2.5).toFixed(1)} MB`
      })
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  const loadRooms = async () => {
    try {
      const allRooms = await RoomAPI.getAllRooms()
      setRooms(allRooms)
    } catch (error) {
      console.error('Failed to load rooms:', error)
    }
  }

  const loadUsers = async () => {
    try {
      const allRooms = await RoomAPI.getAllRooms()
      
      // 从房间数据中提取用户信息
      const userMap = new Map<string, UserProfile>()
      
      allRooms.forEach(room => {
        if (!userMap.has(room.ownerId)) {
          userMap.set(room.ownerId, {
            userId: room.ownerId,
            userName: room.ownerName,
            userEmail: `${room.owner}@example.com`,
            role: room.ownerId === user?.id ? 'admin' : 'user',
            status: 'active',
            createdAt: room.createdAt,
            lastLogin: room.lastModified,
            roomCount: 0
          })
        }
        
        const userProfile = userMap.get(room.ownerId)!
        userProfile.roomCount++
      })

      setUsers(Array.from(userMap.values()))
    } catch (error) {
      console.error('Failed to load users:', error)
    }
  }

  const loadLogs = async () => {
    // 模拟管理日志数据
    const mockLogs: AdminLog[] = [
      {
        id: '1',
        adminId: user?.id || 'admin',
        adminName: user?.fullName || 'Admin',
        action: 'DELETE_ROOM',
        targetType: 'room',
        targetId: 'room123',
        details: '删除了违规内容房间',
        timestamp: Date.now() - 3600000
      },
      {
        id: '2',
        adminId: user?.id || 'admin',
        adminName: user?.fullName || 'Admin',
        action: 'SUSPEND_USER',
        targetType: 'user',
        targetId: 'user456',
        details: '暂停用户账户 - 违反使用条款',
        timestamp: Date.now() - 7200000
      }
    ]
    
    setLogs(mockLogs)
  }

  const loadPublishRequests = async () => {
    try {
      const response = await fetch('/api/publish-requests')
      if (response.ok) {
        const requests = await response.json()
        setPublishRequests(requests)
      } else {
        // 如果API不可用，使用模拟数据
        const mockRequests: PublishRequest[] = [
          {
            id: '1',
            roomId: 'room_123',
            roomName: '产品设计讨论',
            userId: 'user_456',
            userName: '张三',
            requestedPlaza: true,
            status: 'pending',
            submittedAt: Date.now() - 3600000
          },
          {
            id: '2',
            roomId: 'room_789',
            roomName: '项目计划',
            userId: 'user_101',
            userName: '李四',
            requestedPlaza: false,
            status: 'pending',
            submittedAt: Date.now() - 1800000
          }
        ]
        setPublishRequests(mockRequests)
      }
    } catch (error) {
      console.error('Failed to load publish requests:', error)
      setPublishRequests([])
    }
  }

  const handleDeleteRoom = async (roomId: string) => {
    // 操作前权限再次验证
    if (!isAdmin) {
      alert('❌ 权限不足，无法执行删除操作')
      return
    }

    // 第一次确认
    if (!confirm('⚠️ 警告：您即将删除一个房间！\n\n这个操作将永久删除房间及其所有数据，无法恢复。\n\n确定要继续吗？')) {
      return
    }

    // 第二次确认 - 要求输入房间ID
    const confirmText = prompt(
      `🚨 最终确认：\n\n为了防止误操作，请输入要删除的房间ID来确认：\n\n房间ID: ${roomId}\n\n请在下方输入完整的房间ID：`
    )
    
    if (confirmText !== roomId) {
      alert('❌ 房间ID不匹配，删除操作已取消。')
      return
    }

    try {
      await RoomAPI.deleteRoom(roomId)
      await loadRooms()
      await loadStats()
      
      // 记录操作日志
      const newLog: AdminLog = {
        id: Date.now().toString(),
        adminId: user?.id || 'admin',
        adminName: user?.fullName || 'Admin',
        action: 'DELETE_ROOM',
        targetType: 'room',
        targetId: roomId,
        details: '管理员删除房间（已通过二次确认）',
        timestamp: Date.now()
      }
      setLogs(prev => [newLog, ...prev])
      
      alert('✅ 房间删除成功')
    } catch (error) {
      console.error('Failed to delete room:', error)
      alert('❌ 删除失败，请重试')
    }
  }

  const handleUserStatusChange = async (userId: string, newStatus: UserProfile['status']) => {
    // 操作前权限再次验证
    if (!isAdmin) {
      alert('❌ 权限不足，无法执行用户状态变更操作')
      return
    }

    const currentUser = users.find(u => u.userId === userId)
    const statusText = {
      'active': '正常',
      'suspended': '暂停',
      'banned': '封禁'
    }

    // 对于暂停和封禁操作需要确认
    if (newStatus !== 'active') {
      const confirmMessage = `⚠️ 确认${statusText[newStatus]}用户？\n\n用户: ${currentUser?.userName}\nID: ${userId}\n操作: ${statusText[newStatus]}\n\n这个操作会影响用户的访问权限，确定要继续吗？`
      
      if (!confirm(confirmMessage)) {
        return
      }
    }

    try {
      setUsers(prev => prev.map(user => 
        user.userId === userId ? { ...user, status: newStatus } : user
      ))
      
      // 记录操作日志
      const newLog: AdminLog = {
        id: Date.now().toString(),
        adminId: user?.id || 'admin',
        adminName: user?.fullName || 'Admin',
        action: `USER_${newStatus.toUpperCase()}`,
        targetType: 'user',
        targetId: userId,
        details: `用户状态变更为: ${statusText[newStatus]} (${newStatus})`,
        timestamp: Date.now()
      }
      setLogs(prev => [newLog, ...prev])
      
      alert(`✅ 用户状态已更新为: ${statusText[newStatus]}`)
    } catch (error) {
      console.error('Failed to update user status:', error)
      alert('❌ 状态更新失败，请重试')
    }
  }

  const handlePublishRequest = async (requestId: string, action: 'approve' | 'reject', includeInPlaza: boolean = false) => {
    if (!isAdmin) {
      alert('❌ 权限不足，无法执行此操作')
      return
    }

    try {
      const request = publishRequests.find(r => r.id === requestId)
      if (!request) return

      // 默认自动批准，如需要可以改为手动确认
      const confirmed = action === 'approve' || confirm(`确认${action === 'reject' ? '拒绝' : '批准'}此发布申请？`)
      if (!confirmed) return

      if (action === 'approve') {
        // 更新房间状态为已发布
        await RoomAPI.updateRoom(request.roomId, {
          published: true,
          plaza: includeInPlaza || request.requestedPlaza,
          publishRequestStatus: 'approved'
        })
        
        alert(`✅ 房间 "${request.roomName}" 已批准发布${includeInPlaza ? '并加入发布白板' : ''}`)
      } else {
        // 拒绝发布申请
        await RoomAPI.updateRoom(request.roomId, {
          published: false,
          plaza: false,
          publishRequestStatus: 'rejected'
        })
        
        alert(`❌ 房间 "${request.roomName}" 发布申请已拒绝`)
      }

      // 更新发布申请状态
      setPublishRequests(prev => prev.map(req => 
        req.id === requestId 
          ? { 
              ...req, 
              status: action === 'approve' ? 'approved' : 'rejected',
              reviewedAt: Date.now(),
              reviewedBy: user?.fullName || 'Admin'
            }
          : req
      ))

      // 记录操作日志
      const newLog: AdminLog = {
        id: Date.now().toString(),
        adminId: user?.id || 'admin',
        adminName: user?.fullName || 'Admin',
        action: action === 'approve' ? 'APPROVE_PUBLISH' : 'REJECT_PUBLISH',
        targetType: 'room',
        targetId: request.roomId,
        details: `${action === 'approve' ? '批准' : '拒绝'}发布申请 - 房间: ${request.roomName}${includeInPlaza ? ' (加入发布白板)' : ''}`,
        timestamp: Date.now()
      }
      setLogs(prev => [newLog, ...prev])

      // 刷新房间数据
      await loadRooms()
      await loadStats()
    } catch (error) {
      console.error('Failed to handle publish request:', error)
      alert('❌ 操作失败，请重试')
    }
  }

  const handleToggleRoomPublished = async (roomId: string, published: boolean) => {
    if (!isAdmin) {
      alert('❌ 权限不足，无法执行此操作')
      return
    }

    try {
      const room = rooms.find(r => r.id === roomId)
      if (!room) return

      await RoomAPI.updateRoom(roomId, { published })
      
      setRooms(prev => prev.map(r => 
        r.id === roomId ? { ...r, published } : r
      ))

      const newLog: AdminLog = {
        id: Date.now().toString(),
        adminId: user?.id || 'admin',
        adminName: user?.fullName || 'Admin',
        action: published ? 'ENABLE_PUBLISH' : 'DISABLE_PUBLISH',
        targetType: 'room',
        targetId: roomId,
        details: `${published ? '启用' : '禁用'}房间发布 - ${room.name}`,
        timestamp: Date.now()
      }
      setLogs(prev => [newLog, ...prev])

      await loadStats()
    } catch (error) {
      console.error('Failed to toggle room published status:', error)
      alert('❌ 操作失败，请重试')
    }
  }

  const handleToggleRoomPlaza = async (roomId: string, plaza: boolean) => {
    if (!isAdmin) {
      alert('❌ 权限不足，无法执行此操作')
      return
    }

    try {
      const room = rooms.find(r => r.id === roomId)
      if (!room) return

      await RoomAPI.updateRoom(roomId, { plaza })
      
      setRooms(prev => prev.map(r => 
        r.id === roomId ? { ...r, plaza } : r
      ))

      const newLog: AdminLog = {
        id: Date.now().toString(),
        adminId: user?.id || 'admin',
        adminName: user?.fullName || 'Admin',
        action: plaza ? 'ADD_TO_PLAZA' : 'REMOVE_FROM_PLAZA',
        targetType: 'room',
        targetId: roomId,
        details: `${plaza ? '加入' : '移出'}发布白板 - ${room.name}`,
        timestamp: Date.now()
      }
      setLogs(prev => [newLog, ...prev])

      await loadStats()
    } catch (error) {
      console.error('Failed to toggle room plaza status:', error)
      alert('❌ 操作失败，请重试')
    }
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-xl font-bold text-red-600 mb-4">访问被拒绝</h2>
          <p className="text-gray-600">您没有访问管理后台的权限。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 页面头部 */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <h1 className="text-2xl font-bold text-gray-900">管理后台</h1>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">欢迎，</span>
              <span className="text-sm font-medium text-gray-900">{user?.fullName}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 导航标签 */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: '概览' },
              { id: 'rooms', label: '房间管理' },
              { id: 'publish-requests', label: '发布审核' },
              { id: 'users', label: '用户管理' },
              { id: 'logs', label: '操作日志' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* 主要内容区域 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading && (
          <div className="text-center py-8">
            <div className="text-gray-500">加载中...</div>
          </div>
        )}

        {/* 概览标签 */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-6">
            {/* 统计卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">总用户数</h3>
                <p className="text-3xl font-bold text-blue-600">{stats.totalUsers}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">总房间数</h3>
                <p className="text-3xl font-bold text-green-600">{stats.totalRooms}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">已发布房间</h3>
                <p className="text-3xl font-bold text-purple-600">{stats.publishedRooms}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">活跃用户</h3>
                <p className="text-3xl font-bold text-orange-600">{stats.activeUsers}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-sm font-medium text-gray-500">存储使用</h3>
                <p className="text-3xl font-bold text-red-600">{stats.storageUsed}</p>
              </div>
            </div>

            {/* 最近活动 */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-medium text-gray-900">最近创建的房间</h3>
              </div>
              <div className="px-6 py-4">
                <div className="space-y-3">
                  {rooms.slice(0, 5).map(room => (
                    <div key={room.id} className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{room.name}</div>
                        <div className="text-sm text-gray-500">
                          创建者: {room.ownerName} • {new Date(room.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        room.published ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {room.published ? '已发布' : '私有'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 房间管理标签 */}
        {activeTab === 'rooms' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-medium text-gray-900">房间管理</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      房间信息
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      创建者
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      创建时间
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rooms.map(room => (
                    <tr key={room.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{room.name}</div>
                          <div className="text-sm text-gray-500">ID: {room.id}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{room.ownerName}</div>
                        <div className="text-sm text-gray-500">{room.ownerId}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col space-y-1">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            room.published ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {room.published ? '已发布' : '私有'}
                          </span>
                          {room.published && (
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              room.plaza ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {room.plaza ? '在发布白板' : '仅链接'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(room.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex flex-col space-y-2">
                          <div className="flex items-center space-x-2">
                            <label className="flex items-center space-x-1">
                              <input
                                type="checkbox"
                                checked={room.published}
                                onChange={(e) => handleToggleRoomPublished(room.id, e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs">{room.published ? '已发布' : '发布'}</span>
                            </label>
                            {room.published && (
                              <label className="flex items-center space-x-1">
                                <input
                                  type="checkbox"
                                  checked={room.plaza}
                                  onChange={(e) => handleToggleRoomPlaza(room.id, e.target.checked)}
                                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                                />
                                <span className="text-xs">{room.plaza ? '在发布白板' : '加入发布白板'}</span>
                              </label>
                            )}
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleDeleteRoom(room.id)}
                              className="text-red-600 hover:text-red-900 text-xs"
                            >
                              删除
                            </button>
                            <a
                              href={`/r/${room.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-900 text-xs"
                            >
                              查看
                            </a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 发布申请审核标签 */}
        {activeTab === 'publish-requests' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">发布申请审核</h3>
                <div className="text-sm text-gray-500">
                  待审核: {publishRequests.filter(r => r.status === 'pending').length} 个
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      房间信息
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      申请人
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      申请时间
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {publishRequests.map(request => (
                    <tr key={request.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{request.roomName}</div>
                          <div className="text-sm text-gray-500">ID: {request.roomId}</div>
                          {request.requestedPlaza && (
                            <div className="text-xs text-blue-600 mt-1">申请加入发布白板</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{request.userName}</div>
                        <div className="text-sm text-gray-500">{request.userId}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(request.submittedAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          request.status === 'approved' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {request.status === 'pending' ? '待审核' :
                           request.status === 'approved' ? '已批准' : '已拒绝'}
                        </span>
                        {request.reviewedAt && (
                          <div className="text-xs text-gray-500 mt-1">
                            审核时间: {new Date(request.reviewedAt).toLocaleString()}
                          </div>
                        )}
                        {request.reviewedBy && (
                          <div className="text-xs text-gray-500">
                            审核人: {request.reviewedBy}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {request.status === 'pending' ? (
                          <div className="flex flex-col space-y-2">
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handlePublishRequest(request.id, 'approve', false)}
                                className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs hover:bg-green-200"
                              >
                                同意发布
                              </button>
                              <button
                                onClick={() => handlePublishRequest(request.id, 'approve', true)}
                                className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs hover:bg-blue-200"
                              >
                                发布+发布白板
                              </button>
                            </div>
                            <button
                              onClick={() => handlePublishRequest(request.id, 'reject')}
                              className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs hover:bg-red-200 w-full"
                            >
                              拒绝申请
                            </button>
                            <a
                              href={`/r/${request.roomId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-900 text-xs text-center block"
                            >
                              预览房间
                            </a>
                          </div>
                        ) : (
                          <div className="text-gray-500 text-xs">已处理</div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {publishRequests.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        暂无发布申请
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 用户管理标签 */}
        {activeTab === 'users' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-medium text-gray-900">用户管理</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      用户信息
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      角色
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      房间数
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      最后登录
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map(userProfile => (
                    <tr key={userProfile.userId}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{userProfile.userName}</div>
                          <div className="text-sm text-gray-500">{userProfile.userEmail}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          userProfile.role === 'admin' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {userProfile.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          userProfile.status === 'active' ? 'bg-green-100 text-green-800' :
                          userProfile.status === 'suspended' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {userProfile.status === 'active' ? '正常' :
                           userProfile.status === 'suspended' ? '暂停' : '封禁'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {userProfile.roomCount}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(userProfile.lastLogin).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {userProfile.userId !== user?.id && (
                          <select
                            value={userProfile.status}
                            onChange={(e) => handleUserStatusChange(userProfile.userId, e.target.value as UserProfile['status'])}
                            className="text-sm border border-gray-300 rounded px-2 py-1"
                          >
                            <option value="active">正常</option>
                            <option value="suspended">暂停</option>
                            <option value="banned">封禁</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 操作日志标签 */}
        {activeTab === 'logs' && (
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-medium text-gray-900">操作日志</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      时间
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      管理员
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      目标
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      详情
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.adminName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          log.action.includes('DELETE') ? 'bg-red-100 text-red-800' :
                          log.action.includes('SUSPEND') ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.targetType}: {log.targetId}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}