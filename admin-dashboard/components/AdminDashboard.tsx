import React, { useState, useEffect } from 'react'
import { useUser } from '@clerk/clerk-react'
import axios from 'axios'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

interface Room {
  id: string
  name: string
  description: string
  ownerId: string
  ownerName: string
  published: boolean
  createdAt: number
  lastModified: number
  thumbnailDataUrl?: string
  plaza?: boolean
}

interface UserProfile {
  userId: string
  userName: string
  userEmail: string
  role: 'admin' | 'user' | 'guest'
  status: 'active' | 'suspended' | 'banned'
  reviewMode: 'auto' | 'manual'
  createdAt: number
  lastLogin: number
  roomCount: number
}

interface PublishRequest {
  id: string
  roomId: string
  roomName: string
  userId: string
  userName: string
  requestTime: number
  status: 'pending' | 'approved' | 'rejected'
  reviewedBy?: string
  reviewedAt?: number
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

const AdminDashboard: React.FC = () => {
  const { user } = useUser()
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'rooms' | 'publish-requests' | 'logs'>('overview')
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [users, setUsers] = useState<UserProfile[]>([])
  const [logs, setLogs] = useState<AdminLog[]>([])
  const [publishRequests, setPublishRequests] = useState<PublishRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  
  // 批量操作相关状态
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set())
  const [selectAll, setSelectAll] = useState(false)

  // API 基础URL
  const apiUrl = process.env.NEXT_PUBLIC_TLDRAW_API_URL || 'https://tldraw-worker.010-carpe-diem.workers.dev'

  // 管理员权限检查
  const isAdmin = user?.publicMetadata?.role === 'admin' || 
                  user?.emailAddresses?.[0]?.emailAddress?.includes('admin') ||
                  ['010.carpe.diem@gmail.com', 'admin@example.com', 'administrator@tldraw.com'].includes(user?.emailAddresses?.[0]?.emailAddress || '')

  useEffect(() => {
    if (isAdmin) {
      loadDashboardData()
    }
  }, [isAdmin])


  const loadDashboardData = async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadStats(),
        loadRooms(),
        loadUsers(),
        loadLogs(),
        loadPublishRequests(),
      ])
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/admin/stats`, {
        headers: {
          'X-User-Email': user?.emailAddresses?.[0]?.emailAddress || '',
          'X-User-ID': user?.id || ''
        }
      })
      setStats(response.data)
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  const loadRooms = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/rooms`)
      setRooms(response.data)
    } catch (error) {
      console.error('Failed to load rooms:', error)
    }
  }

  const loadUsers = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/admin/users`, {
        headers: {
          'X-User-Email': user?.emailAddresses?.[0]?.emailAddress || '',
          'X-User-ID': user?.id || ''
        }
      })
      setUsers(response.data)
    } catch (error) {
      console.error('Failed to load users:', error)
    }
  }

  const loadLogs = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/admin/logs`, {
        headers: {
          'X-User-Email': user?.emailAddresses?.[0]?.emailAddress || '',
          'X-User-ID': user?.id || ''
        }
      })
      setLogs(response.data)
    } catch (error) {
      console.error('Failed to load logs:', error)
    }
  }

  const handleDeleteRoom = async (roomId: string) => {
    const confirmText = prompt('请输入房间ID确认删除（这是不可逆操作）:')
    if (confirmText !== roomId) {
      alert('房间ID不匹配，删除操作已取消')
      return
    }

    try {
      await axios.delete(`${apiUrl}/api/rooms/${roomId}`, {
        headers: {
          'X-User-Email': user?.emailAddresses?.[0]?.emailAddress || '',
          'X-User-ID': user?.id || ''
        }
      })
      await loadRooms()
      alert('房间删除成功')
    } catch (error) {
      console.error('Failed to delete room:', error)
      alert('删除失败，请重试')
    }
  }

  const handleToggleRoomPublished = async (roomId: string, published: boolean) => {
    try {
      await axios.patch(`${apiUrl}/api/rooms/${roomId}`, 
        { published: !published },
        {
          headers: {
            'X-User-Email': user?.emailAddresses?.[0]?.emailAddress || '',
            'X-User-ID': user?.id || ''
          }
        }
      )
      await loadRooms()
    } catch (error) {
      console.error('Failed to update room:', error)
    }
  }

  const loadPublishRequests = async () => {
    try {
      const response = await axios.get(`${apiUrl}/api/admin/publish-requests`, {
        headers: {
          'X-User-Email': user?.emailAddresses?.[0]?.emailAddress || '',
          'X-User-ID': user?.id || ''
        }
      })
      setPublishRequests(response.data)
    } catch (error) {
      console.error('Failed to load publish requests:', error)
      // 如果API不存在，设置为空数组避免错误
      setPublishRequests([])
    }
  }


  // 批量操作相关函数
  const handleSelectRoom = (roomId: string, checked: boolean) => {
    const newSelection = new Set(selectedRooms)
    if (checked) {
      newSelection.add(roomId)
    } else {
      newSelection.delete(roomId)
    }
    setSelectedRooms(newSelection)
    
    // 检查是否应该更新全选状态
    const filteredRooms = rooms.filter(room => !selectedUserId || room.ownerId === selectedUserId)
    setSelectAll(newSelection.size === filteredRooms.length && filteredRooms.length > 0)
  }

  const handleSelectAll = (checked: boolean) => {
    const filteredRooms = rooms.filter(room => !selectedUserId || room.ownerId === selectedUserId)
    if (checked) {
      setSelectedRooms(new Set(filteredRooms.map(room => room.id)))
    } else {
      setSelectedRooms(new Set())
    }
    setSelectAll(checked)
  }

  const handleBatchOperation = async (operation: 'publish' | 'unpublish' | 'plaza' | 'unplaza' | 'delete') => {
    if (selectedRooms.size === 0) {
      alert('请先选择要操作的房间')
      return
    }

    const operationNames = {
      'publish': '批量发布',
      'unpublish': '批量取消发布', 
      'plaza': '批量加入广场',
      'unplaza': '批量移出广场',
      'delete': '批量删除'
    }

    if (!confirm(`确定要${operationNames[operation]}选中的${selectedRooms.size}个房间吗？`)) {
      return
    }

    try {
      setLoading(true)
      const roomIds = Array.from(selectedRooms)
      
      // 并发执行批量操作
      const promises = roomIds.map(async (roomId) => {
        switch (operation) {
          case 'publish':
          case 'unpublish':
            return axios.patch(`${apiUrl}/api/rooms/${roomId}`, 
              { published: operation === 'publish' },
              {
                headers: {
                  'X-User-Email': user?.emailAddresses?.[0]?.emailAddress || '',
                  'X-User-ID': user?.id || ''
                }
              }
            )
          case 'plaza':
          case 'unplaza':
            // 先获取当前房间状态，然后决定是否需要切换
            const room = rooms.find(r => r.id === roomId)
            const shouldToggle = (operation === 'plaza' && !room?.plaza) || (operation === 'unplaza' && room?.plaza)
            if (shouldToggle) {
              return axios.post(`${apiUrl}/api/admin/rooms/${roomId}/toggle-plaza`, {}, {
                headers: {
                  'X-User-Email': user?.emailAddresses?.[0]?.emailAddress || '',
                  'X-User-ID': user?.id || '',
                  'Content-Type': 'application/json'
                }
              })
            }
            return Promise.resolve() // 已经是目标状态，无需操作
          case 'delete':
            return axios.delete(`${apiUrl}/api/rooms/${roomId}`, {
              headers: {
                'X-User-Email': user?.emailAddresses?.[0]?.emailAddress || '',
                'X-User-ID': user?.id || ''
              }
            })
          default:
            return Promise.resolve()
        }
      })

      const results = await Promise.allSettled(promises)
      const failures = results.filter(result => result.status === 'rejected').length
      
      if (failures > 0) {
        alert(`操作完成，但有${failures}个房间操作失败`)
      } else {
        alert(`${operationNames[operation]}操作完成`)
      }

      // 清除选择状态
      setSelectedRooms(new Set())
      setSelectAll(false)
      
      // 重新加载数据
      await loadRooms()
    } catch (error) {
      console.error('Batch operation failed:', error)
      alert('批量操作失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleRoomPlaza = async (roomId: string, isPlaza: boolean) => {
    try {
      // 使用正确的API端点，匹配worker中定义的路由
      await axios.post(`${apiUrl}/api/admin/rooms/${roomId}/toggle-plaza`, {}, {
        headers: {
          'X-User-Email': user?.emailAddresses?.[0]?.emailAddress || '',
          'X-User-ID': user?.id || '',
          'Content-Type': 'application/json'
        }
      })
      
      // 更新本地状态
      setRooms(prevRooms => prevRooms.map(room => 
        room.id === roomId ? { ...room, plaza: isPlaza } : room
      ))
      
      // 添加日志
      loadLogs()
      alert(`房间${isPlaza ? '已添加到' : '已从'}广场${isPlaza ? '' : '移除'}`)
    } catch (error) {
      console.error('Failed to toggle room plaza status:', error)
      alert('更改房间广场状态失败: ' + (error.response?.data?.error || error.message))
    }
  }

  const handleUserReviewModeToggle = async (userId: string, reviewMode: 'auto' | 'manual') => {
    try {
      await axios.patch(`${apiUrl}/api/admin/users/${userId}/review-mode`, 
        { reviewMode },
        {
          headers: {
            'X-User-Email': user?.emailAddresses?.[0]?.emailAddress || '',
            'X-User-ID': user?.id || ''
          }
        }
      )
      
      // 更新本地状态
      setUsers(prevUsers => prevUsers.map(user => 
        user.userId === userId ? { ...user, reviewMode } : user
      ))
      
      loadLogs()
      alert(`用户审核模式已更改为${reviewMode === 'auto' ? '自动通过' : '人工审核'}`)
    } catch (error) {
      console.error('Failed to update user review mode:', error)
      alert('更新用户审核模式失败')
    }
  }

  const handlePublishRequestAction = async (requestId: string, action: 'approve' | 'reject') => {
    try {
      await axios.post(`${apiUrl}/api/admin/publish-requests/${requestId}/${action}`, {}, {
        headers: {
          'X-User-Email': user?.emailAddresses?.[0]?.emailAddress || '',
          'X-User-ID': user?.id || ''
        }
      })
      
      loadPublishRequests()
      loadRooms()
      loadLogs()
      alert(`发布申请已${action === 'approve' ? '批准' : '拒绝'}`)
    } catch (error) {
      console.error(`Failed to ${action} publish request:`, error)
      alert(`${action === 'approve' ? '批准' : '拒绝'}发布申请失败`)
    }
  }


  const handleNavigateToUser = (userId: string) => {
    setSelectedUserId(userId)
    setActiveTab('users')
    // 滚动到用户所在位置
    setTimeout(() => {
      const userElement = document.querySelector(`[data-user-id="${userId}"]`)
      if (userElement) {
        userElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
        userElement.classList.add('bg-yellow-100')
        setTimeout(() => {
          userElement.classList.remove('bg-yellow-100')
        }, 2000)
      }
    }, 100)
  }

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">访问被拒绝</h2>
        <p className="text-gray-600">您没有管理员权限访问此页面</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto px-4 sm:px-6 lg:px-8 py-8" style={{maxWidth: 'none', width: '100%'}}>
        {/* 标签导航 */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            {[
              { key: 'overview', label: '概览', icon: '📊' },
              { key: 'users', label: '用户管理', icon: '👥' },
              { key: 'rooms', label: '房间管理', icon: '🏠' },
              { key: 'publish-requests', label: '发布申请', icon: '📋', badge: publishRequests.filter(r => r.status === 'pending').length },
              { key: 'logs', label: '操作日志', icon: '📝' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm flex items-center gap-2 relative`}
              >
                <span>{tab.icon}</span>
                {tab.label}
                {tab.badge && tab.badge > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center ml-1">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {loading && (
          <div className="text-center py-12">
            <div className="text-lg">加载中...</div>
          </div>
        )}

        {/* 调试当前标签页 */}
        <div className="p-4 bg-yellow-100 border border-yellow-300 mb-4">
          <h4 className="font-bold">当前标签页: {activeTab}</h4>
          <p>isAdmin: {String(isAdmin)}</p>
        </div>

        {/* 概览页面 */}
        {activeTab === 'overview' && stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">总用户数</h3>
              <p className="text-3xl font-bold text-blue-600">{stats.totalUsers}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">总房间数</h3>
              <p className="text-3xl font-bold text-green-600">{stats.totalRooms}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">已发布房间</h3>
              <p className="text-3xl font-bold text-purple-600">{stats.publishedRooms}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">活跃用户</h3>
              <p className="text-3xl font-bold text-orange-600">{stats.activeUsers}</p>
            </div>
          </div>
        )}

        {/* 用户管理页面 */}
        {activeTab === 'users' && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">用户列表</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">用户</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">角色</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">审核模式</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">房间数</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map(user => (
                    <tr 
                      key={user.userId} 
                      data-user-id={user.userId}
                      className={`${selectedUserId === user.userId ? 'bg-yellow-50' : ''} transition-colors duration-200`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{user.userName}</div>
                          <div className="text-sm text-gray-500">{user.userEmail}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          user.role === 'admin' ? 'bg-red-100 text-red-800' :
                          user.role === 'user' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          user.status === 'active' ? 'bg-green-100 text-green-800' :
                          user.status === 'suspended' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleUserReviewModeToggle(user.userId, user.reviewMode === 'auto' ? 'manual' : 'auto')}
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            (user.reviewMode || 'auto') === 'auto' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {(user.reviewMode || 'auto') === 'auto' ? '自动通过' : '人工审核'}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className="font-medium">{user.roomCount}</span>
                        {user.roomCount > 0 && (
                          <button
                            onClick={() => {
                              setSelectedUserId(user.userId)
                              setActiveTab('rooms')
                            }}
                            className="ml-2 text-blue-600 hover:text-blue-800 text-xs"
                          >
                            查看房间
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(user.createdAt), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUserReviewModeToggle(user.userId, 'auto')}
                            disabled={(user.reviewMode || 'auto') === 'auto'}
                            className={`px-2 py-1 text-xs rounded ${
                              (user.reviewMode || 'auto') === 'auto' 
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                            }`}
                          >
                            自动通过
                          </button>
                          <button
                            onClick={() => handleUserReviewModeToggle(user.userId, 'manual')}
                            disabled={(user.reviewMode || 'auto') === 'manual'}
                            className={`px-2 py-1 text-xs rounded ${
                              (user.reviewMode || 'auto') === 'manual' 
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                            }`}
                          >
                            人工审核
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 房间管理页面 */}
        {activeTab === 'rooms' && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">房间列表</h3>
                <div className="flex items-center gap-4">
                  {selectedUserId && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">正在显示用户的房间:</span>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded">
                        {users.find(u => u.userId === selectedUserId)?.userName || selectedUserId}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedUserId(null)
                          setSelectedRooms(new Set())
                          setSelectAll(false)
                        }}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        清除筛选
                      </button>
                    </div>
                  )}
                  <button
                    onClick={loadRooms}
                    disabled={loading}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    刷新数据
                  </button>
                </div>
              </div>
              
              {/* 批量操作工具栏 */}
              {selectedRooms.size > 0 && (
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <span className="text-sm text-blue-700 font-medium">
                    已选择 {selectedRooms.size} 个房间
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleBatchOperation('publish')}
                      className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                      disabled={loading}
                    >
                      批量发布
                    </button>
                    <button
                      onClick={() => handleBatchOperation('unpublish')}
                      className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                      disabled={loading}
                    >
                      取消发布
                    </button>
                    <button
                      onClick={() => handleBatchOperation('plaza')}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                      disabled={loading}
                    >
                      加入广场
                    </button>
                    <button
                      onClick={() => handleBatchOperation('unplaza')}
                      className="px-3 py-1 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
                      disabled={loading}
                    >
                      移出广场
                    </button>
                    <button
                      onClick={() => handleBatchOperation('delete')}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                      disabled={loading}
                    >
                      批量删除
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedRooms(new Set())
                      setSelectAll(false)
                    }}
                    className="text-sm text-gray-500 hover:text-gray-700 ml-auto"
                  >
                    取消选择
                  </button>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed divide-y divide-gray-200" style={{minWidth: '1000px'}}>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{width: '30%'}}>房间信息</th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{width: '15%'}}>所有者</th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{width: '20%'}}>状态</th>
                    <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{width: '15%'}}>操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rooms.filter(room => !selectedUserId || room.ownerId === selectedUserId).map(room => (
                    <tr key={room.id} className={`${selectedUserId && room.ownerId === selectedUserId ? 'bg-blue-50' : ''} ${selectedRooms.has(room.id) ? 'bg-indigo-50' : ''}`}>
                      <td className="px-2 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedRooms.has(room.id)}
                          onChange={(e) => handleSelectRoom(room.id, e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900 truncate max-w-xs">{room.name}</div>
                          <div className="text-xs text-gray-500 truncate max-w-xs">{room.description}</div>
                          <div className="text-xs text-gray-400">{format(new Date(room.createdAt), 'MM-dd HH:mm')}</div>
                        </div>
                      </td>
                      <td className="px-2 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleNavigateToUser(room.ownerId)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium truncate max-w-20 block"
                        >
                          {room.ownerName || room.ownerId}
                        </button>
                      </td>
                      <td className="px-2 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleToggleRoomPublished(room.id, room.published)}
                            className={`px-1 py-0.5 text-xs font-medium rounded ${
                              room.published ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {room.published ? '已发布' : '未发布'}
                          </button>
                          <button
                            onClick={() => handleToggleRoomPlaza(room.id, !room.plaza)}
                            className={`px-1 py-0.5 text-xs font-medium rounded ${
                              room.plaza ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {room.plaza ? '广场' : '私有'}
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-4 whitespace-nowrap text-xs font-medium">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleDeleteRoom(room.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            删除
                          </button>
                          <a
                            href={`${apiUrl}/r/${room.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-900"
                          >
                            查看
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 发布申请页面 */}
        {activeTab === 'publish-requests' && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">发布申请管理</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">房间信息</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">申请用户</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">申请时间</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {publishRequests.map(request => (
                    <tr key={request.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{request.roomName}</div>
                          <div className="text-sm text-gray-500">ID: {request.roomId}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleNavigateToUser(request.userId)}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {request.userName}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(request.requestTime), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          request.status === 'approved' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {request.status === 'pending' ? '待审核' :
                           request.status === 'approved' ? '已批准' : '已拒绝'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {request.status === 'pending' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handlePublishRequestAction(request.id, 'approve')}
                              className="text-green-600 hover:text-green-900"
                            >
                              批准
                            </button>
                            <button
                              onClick={() => handlePublishRequestAction(request.id, 'reject')}
                              className="text-red-600 hover:text-red-900"
                            >
                              拒绝
                            </button>
                          </div>
                        )}
                        {request.status !== 'pending' && (
                          <div className="text-gray-400 text-xs">
                            {request.reviewedBy && `由 ${request.reviewedBy} 处理`}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {publishRequests.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                        暂无发布申请
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}


        {/* 操作日志页面 */}
        {activeTab === 'logs' && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">操作日志</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">管理员</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">目标</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">详情</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.adminName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.action}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {log.targetType}:{log.targetId}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {log.details}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
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

export default AdminDashboard