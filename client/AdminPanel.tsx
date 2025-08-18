import React, { useState, useEffect } from 'react'
import { useUser } from '@clerk/clerk-react'
import { roomUtils } from './roomUtils'
import { formatPermissionInfo, type PermissionInfo } from './permissionUtils'

interface Room {
  id: string
  name: string
  ownerId: string
  ownerName: string
  published: boolean
  permission: 'viewer' | 'editor' | 'assist'
  createdAt: number
  lastModified: number
  description?: string
  tags?: string[]
  plaza?: boolean
  plaza_request?: boolean
}

interface AdminStats {
  totalRooms: number
  publishedRooms: number
  totalUsers: number
  recentActivity: number
}

export function AdminPanel() {
  const { user } = useUser()
  const [rooms, setRooms] = useState<Room[]>([])
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [defaultRoom, setDefaultRoom] = useState<string>('')
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rooms' | 'settings'>('dashboard')

  // 检查管理员权限
  const isAdmin = user?.publicMetadata?.role === 'admin' || 
    user?.emailAddresses?.[0]?.emailAddress?.includes('admin') ||
    ['010.carpe.diem@gmail.com', '1903399675@qq.com', 'admin@example.com', 'administrator@tldraw.com'].includes(user?.emailAddresses?.[0]?.emailAddress || '')

  // 加载管理员数据
  useEffect(() => {
    if (isAdmin) {
      loadAdminData()
    }
  }, [isAdmin])

  const loadAdminData = async () => {
    setIsLoading(true)
    try {
      // 管理员界面直接从Worker API获取最新数据 (绕过代理问题)
      const response = await fetch('http://localhost:8787/api/rooms')
      if (!response.ok) {
        throw new Error(`获取房间数据失败: ${response.status}`)
      }
      const allRooms = await response.json()
      console.log('🏠 AdminPanel 加载房间数据 (直接Worker API):', allRooms)
      console.log('🔍 Plaza字段检查:', allRooms.map(r => ({
        id: r.id, 
        name: r.name, 
        plaza: r.plaza, 
        plaza_request: r.plaza_request
      })))
      setRooms(allRooms)


      // 计算统计数据
      const publishedCount = allRooms.filter(room => room.published).length
      const uniqueOwners = new Set(allRooms.map(room => room.ownerId)).size
      
      setStats({
        totalRooms: allRooms.length,
        publishedRooms: publishedCount,
        totalUsers: uniqueOwners,
        recentActivity: allRooms.filter(room => 
          Date.now() - room.lastModified < 24 * 60 * 60 * 1000
        ).length
      })

      // 加载当前默认房间
      const currentDefault = localStorage.getItem('admin-default-room')
      if (currentDefault) {
        setDefaultRoom(currentDefault)
      }
    } catch (error) {
      console.error('Error loading admin data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSetDefaultRoom = async (roomId: string) => {
    try {
      // 保存到本地存储和服务器
      localStorage.setItem('admin-default-room', roomId)
      
      // 调用API保存到服务器
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          defaultRoom: roomId,
          adminId: user?.id
        })
      })
      
      setDefaultRoom(roomId)
      alert('默认房间已设置成功！')
    } catch (error) {
      console.error('Error setting default room:', error)
      alert('设置默认房间失败')
    }
  }

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm('确定要删除这个房间吗？此操作不可恢复！')) {
      return
    }

    try {
      await roomUtils.deleteRoom(roomId)
      await loadAdminData() // 重新加载数据
      alert('房间已删除')
    } catch (error) {
      console.error('Error deleting room:', error)
      alert('删除房间失败')
    }
  }


  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN')
  }

  if (!isAdmin) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ color: '#dc2626', marginBottom: '1rem' }}>🚫 访问被拒绝</h2>
          <p>您没有管理员权限，无法访问此页面。</p>
          <button
            onClick={() => window.close()}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            关闭
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh'
      }}>
        <div>加载中...</div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa'
    }}>
      {/* 头部 */}
      <div style={{
        backgroundColor: 'white',
        borderBottom: '1px solid #e5e7eb',
        padding: '1rem 2rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ margin: 0, color: '#1f2937' }}>🛠️ 管理员后台</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={loadAdminData}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              🔄 刷新数据
            </button>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              管理员：{user?.fullName || user?.emailAddresses?.[0]?.emailAddress}
            </div>
          </div>
        </div>

        {/* 导航标签 */}
        <div style={{
          display: 'flex',
          gap: '2rem',
          marginTop: '1rem'
        }}>
          {[
            { key: 'dashboard', label: '📊 仪表板' },
            { key: 'rooms', label: '🏠 房间管理' },
            { key: 'settings', label: '⚙️ 系统设置' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: activeTab === tab.key ? '#3b82f6' : 'transparent',
                color: activeTab === tab.key ? 'white' : '#6b7280',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div style={{ padding: '2rem' }}>
        {activeTab === 'dashboard' && stats && (
          <div>
            <h2 style={{ marginBottom: '1.5rem' }}>📈 系统概览</h2>
            
            {/* 统计卡片 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1rem',
              marginBottom: '2rem'
            }}>
              <div style={{
                backgroundColor: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#3b82f6' }}>📁 总房间数</h3>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{stats.totalRooms}</p>
              </div>
              
              <div style={{
                backgroundColor: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#10b981' }}>🌐 已发布房间</h3>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{stats.publishedRooms}</p>
              </div>
              
              <div style={{
                backgroundColor: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#f59e0b' }}>👥 活跃用户</h3>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{stats.totalUsers}</p>
              </div>
              
              <div style={{
                backgroundColor: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#ef4444' }}>📊 24小时活跃</h3>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: 0 }}>{stats.recentActivity}</p>
              </div>
            </div>

            {/* 默认房间设置 */}
            <div style={{
              backgroundColor: 'white',
              padding: '1.5rem',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ marginTop: 0 }}>🏠 默认房间设置</h3>
              <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                设置新用户默认进入的房间
              </p>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <select
                  value={defaultRoom}
                  onChange={(e) => setDefaultRoom(e.target.value)}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    minWidth: '200px'
                  }}
                >
                  <option value="">选择默认房间...</option>
                  {rooms.filter(room => room.published).map(room => (
                    <option key={room.id} value={room.id}>
                      {room.name} ({room.ownerName})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleSetDefaultRoom(defaultRoom)}
                  disabled={!defaultRoom}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: defaultRoom ? '#10b981' : '#d1d5db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: defaultRoom ? 'pointer' : 'not-allowed'
                  }}
                >
                  设置为默认
                </button>
              </div>
              {defaultRoom && (
                <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  当前默认房间：{rooms.find(r => r.id === defaultRoom)?.name || '未找到'}
                </p>
              )}
            </div>
          </div>
        )}

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
                      权限
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
                          {room.description && (
                            <div className="text-xs text-gray-400 mt-1">
                              {room.description.length > 50 ? 
                                room.description.substring(0, 50) + '...' : 
                                room.description}
                            </div>
                          )}
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
                            {room.published ? '🌐 已发布' : '🔒 私有'}
                          </span>
                          {room.plaza && (
                            <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
                              🏛️ 广场
                            </span>
                          )}
                          {room.plaza_request && (
                            <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
                              📝 申请广场
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {(() => {
                          const permissionInfo: PermissionInfo = {
                            mode: room.permission,
                            historyLocked: room.historyLocked,
                            historyLockTimestamp: room.historyLockTimestamp
                          }
                          const formatted = formatPermissionInfo(permissionInfo)
                          return `${formatted.icon} ${formatted.displayName}`
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(room.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex flex-col space-y-2">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => setSelectedRoom(room)}
                              className="text-blue-600 hover:text-blue-900 text-xs bg-blue-100 hover:bg-blue-200 px-2 py-1 rounded"
                            >
                              详情
                            </button>
                            <button
                              onClick={() => handleDeleteRoom(room.id)}
                              className="text-red-600 hover:text-red-900 text-xs bg-red-100 hover:bg-red-200 px-2 py-1 rounded"
                            >
                              删除
                            </button>
                          </div>
                          <a
                            href={`/r/${room.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-600 hover:text-green-900 text-xs bg-green-100 hover:bg-green-200 px-2 py-1 rounded text-center"
                          >
                            访问
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


        {activeTab === 'settings' && (
          <div>
            <h2 style={{ marginBottom: '1.5rem' }}>⚙️ 系统设置</h2>
            
            <div style={{
              backgroundColor: 'white',
              padding: '1.5rem',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <h3>🔧 系统配置</h3>
              <div style={{ display: 'grid', gap: '1rem', maxWidth: '600px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    系统名称
                  </label>
                  <input
                    type="text"
                    value="流学"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px'
                    }}
                    readOnly
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    管理员邮箱
                  </label>
                  <input
                    type="email"
                    value={user?.emailAddresses?.[0]?.emailAddress || ''}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px'
                    }}
                    readOnly
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                    系统版本
                  </label>
                  <input
                    type="text"
                    value="v1.0.0"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px'
                    }}
                    readOnly
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 房间详情模态框 */}
      {selectedRoom && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '8px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h3 style={{ marginTop: 0 }}>房间详情</h3>
            
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <strong>房间名称：</strong>
                <span>{selectedRoom.name}</span>
              </div>
              
              <div>
                <strong>房间ID：</strong>
                <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{selectedRoom.id}</span>
              </div>
              
              <div>
                <strong>创建者：</strong>
                <span>{selectedRoom.ownerName}</span>
              </div>
              
              <div>
                <strong>发布状态：</strong>
                <span>{selectedRoom.published ? '🌐 已发布' : '🔒 私有'}</span>
              </div>
              
              <div>
                <strong>权限设置：</strong>
                <span>
                  {(() => {
                    const permissionInfo: PermissionInfo = {
                      mode: selectedRoom.permission,
                      historyLocked: selectedRoom.historyLocked,
                      historyLockTimestamp: selectedRoom.historyLockTimestamp
                    }
                    const formatted = formatPermissionInfo(permissionInfo)
                    return `${formatted.icon} ${formatted.displayName}模式`
                  })()}
                </span>
              </div>
              
              <div>
                <strong>创建时间：</strong>
                <span>{formatDate(selectedRoom.createdAt)}</span>
              </div>
              
              <div>
                <strong>最后修改：</strong>
                <span>{formatDate(selectedRoom.lastModified)}</span>
              </div>
              
              {selectedRoom.description && (
                <div>
                  <strong>房间描述：</strong>
                  <p style={{ 
                    margin: '0.5rem 0', 
                    padding: '0.5rem', 
                    backgroundColor: '#f9fafb',
                    borderRadius: '4px' 
                  }}>
                    {selectedRoom.description}
                  </p>
                </div>
              )}
              
              {selectedRoom.tags && selectedRoom.tags.length > 0 && (
                <div>
                  <strong>标签：</strong>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {selectedRoom.tags.map((tag, index) => (
                      <span
                        key={index}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#e5e7eb',
                          borderRadius: '12px',
                          fontSize: '0.75rem'
                        }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div style={{ 
              display: 'flex', 
              gap: '1rem', 
              marginTop: '1.5rem',
              justifyContent: 'flex-end' 
            }}>
              <button
                onClick={() => window.open(`/r/${selectedRoom.id}`, '_blank')}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                访问房间
              </button>
              <button
                onClick={() => setSelectedRoom(null)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}