import React, { useState, useEffect, useMemo } from 'react'
import { useUser } from '@clerk/clerk-react'
import { Room } from './RoomManager'
import { GalleryThumbnail, GalleryThumbnailGrid } from './GalleryThumbnail'
import { roomUtils } from './roomUtils'
import { SnapshotManager } from './SnapshotManager'

// 发布状态指示器组件
function PublishStatusIndicator({ roomId }: { roomId: string }) {
  const [hasSnapshot, setHasSnapshot] = useState<boolean | null>(null)
  
  useEffect(() => {
    const checkSnapshot = () => {
      const snapshotExists = SnapshotManager.hasPublishSnapshot(roomId)
      setHasSnapshot(snapshotExists)
    }
    
    checkSnapshot()
    
    // 监听快照变化事件
    const handleSnapshotChange = (event: CustomEvent) => {
      if (event.detail?.roomId === roomId) {
        checkSnapshot()
      }
    }
    
    window.addEventListener('publishSnapshotChanged', handleSnapshotChange as EventListener)
    
    return () => {
      window.removeEventListener('publishSnapshotChanged', handleSnapshotChange as EventListener)
    }
  }, [roomId])
  
  if (hasSnapshot === null) {
    return <span style={{ color: '#9ca3af' }}>⏳ 检查中</span>
  }
  
  return hasSnapshot ? (
    <span style={{ color: '#f59e0b' }}>⭐ 已发布</span>
  ) : (
    <span style={{ 
      color: '#f59e0b', 
      display: 'inline-flex', 
      alignItems: 'center', 
      gap: '4px' 
    }}>
      ⏳ 发布中
      <span style={{ 
        fontSize: '0.6rem',
        padding: '1px 4px',
        backgroundColor: '#fef3c7',
        color: '#92400e',
        borderRadius: '2px'
      }}>
        需加载
      </span>
    </span>
  )
}

type SortMode = 'recent' | 'name' | 'created'
type FilterMode = 'all' | 'shared' | 'published'

interface GalleryPageProps {
  onRoomSelect?: (roomId: string) => void
  onClose?: () => void
}

/**
 * 优化的画廊页面组件
 * 专门为快速展示房间缩略图而设计
 */
export function GalleryPage({ onRoomSelect, onClose }: GalleryPageProps) {
  const { user } = useUser()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('recent')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // 加载房间数据
  useEffect(() => {
    const loadRooms = async () => {
      try {
        setLoading(true)
        setError(null)

        // 首先执行清理操作，确保显示的是最新数据
        await roomUtils.forceCleanupDeletedRooms()

        // 根据筛选模式加载不同的房间数据
        let roomData: Room[] = []
        
        switch (filterMode) {
          case 'shared':
            roomData = await roomUtils.getSharedRooms()
            break
          case 'published':
            roomData = await roomUtils.getPublishRooms()
            break
          default:
            roomData = await roomUtils.getAllRooms()
            break
        }

        setRooms(roomData)
      } catch (err) {
        console.error('Error loading rooms:', err)
        setError('加载房间列表失败')
      } finally {
        setLoading(false)
      }
    }

    loadRooms()
  }, [filterMode])

  // 筛选和排序房间
  const filteredAndSortedRooms = useMemo(() => {
    let filtered = rooms

    // 搜索筛选
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim()
      filtered = filtered.filter(room => 
        room.name.toLowerCase().includes(term) ||
        room.description?.toLowerCase().includes(term) ||
        room.ownerName.toLowerCase().includes(term)
      )
    }

    // 排序
    const sorted = [...filtered].sort((a, b) => {
      switch (sortMode) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'created':
          return b.createdAt - a.createdAt
        case 'recent':
        default:
          return b.lastModified - a.lastModified
      }
    })

    return sorted
  }, [rooms, searchTerm, sortMode])

  // 处理房间点击
  const handleRoomClick = (room: Room) => {
    if (onRoomSelect) {
      // 如果是发布白板列表，使用发布路径
      if (filterMode === 'published' && room.publish) {
        // 导航到发布路径 /p/roomId
        window.location.href = `/p/${room.id}`
      } else {
        // 普通房间点击
        onRoomSelect(room.id)
      }
    }
  }

  // 获取统计信息
  const stats = useMemo(() => {
    return {
      total: rooms.length,
      shared: rooms.filter(r => r.shared).length,
      published: rooms.filter(r => r.publish).length,
      myRooms: rooms.filter(r => r.ownerId === user?.id).length
    }
  }, [rooms, user?.id])

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        flexDirection: 'column',
        color: '#6b7280'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          border: '3px solid #e5e7eb',
          borderTop: '3px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '16px'
        }} />
        <div>加载画廊中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '400px',
        flexDirection: 'column',
        color: '#dc2626'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '16px' }}>⚠️</div>
        <div>{error}</div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '16px',
            padding: '8px 16px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          重新加载
        </button>
      </div>
    )
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#ffffff',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* 头部 */}
      <div style={{
        padding: '20px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: '#ffffff',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px'
        }}>
          <h1 style={{
            margin: 0,
            fontSize: '1.875rem',
            fontWeight: 'bold',
            color: '#111827'
          }}>
            画廊
          </h1>
          
          {onClose && (
            <button
              onClick={onClose}
              style={{
                padding: '8px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.5rem',
                color: '#6b7280'
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* 统计信息 */}
        <div style={{
          display: 'flex',
          gap: '24px',
          marginBottom: '16px',
          flexWrap: 'wrap'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            总计: <span style={{ fontWeight: 'bold', color: '#111827' }}>{stats.total}</span>
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            共享: <span style={{ fontWeight: 'bold', color: '#10b981' }}>{stats.shared}</span>
          </div>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            发布: <span style={{ fontWeight: 'bold', color: '#f59e0b' }}>{stats.published}</span>
          </div>
          {user && (
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              我的: <span style={{ fontWeight: 'bold', color: '#3b82f6' }}>{stats.myRooms}</span>
            </div>
          )}
        </div>

        {/* 控制栏 */}
        <div style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}>
          {/* 搜索框 */}
          <input
            type="text"
            placeholder="搜索房间名称、描述或创建者..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: '1',
              minWidth: '200px',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem'
            }}
          />

          {/* 筛选器 */}
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as FilterMode)}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
              backgroundColor: 'white'
            }}
          >
            <option value="all">全部房间</option>
            <option value="shared">共享房间</option>
            <option value="published">发布白板</option>
          </select>

          {/* 排序 */}
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem',
              backgroundColor: 'white'
            }}
          >
            <option value="recent">最近修改</option>
            <option value="name">名称排序</option>
            <option value="created">创建时间</option>
          </select>

          {/* 视图模式 */}
          <div style={{
            display: 'flex',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                padding: '8px 12px',
                border: 'none',
                backgroundColor: viewMode === 'grid' ? '#3b82f6' : 'white',
                color: viewMode === 'grid' ? 'white' : '#6b7280',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              网格
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                padding: '8px 12px',
                border: 'none',
                backgroundColor: viewMode === 'list' ? '#3b82f6' : 'white',
                color: viewMode === 'list' ? 'white' : '#6b7280',
                cursor: 'pointer',
                fontSize: '0.875rem',
                borderLeft: '1px solid #d1d5db'
              }}
            >
              列表
            </button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div style={{
        flex: 1,
        overflow: 'auto'
      }}>
        {filteredAndSortedRooms.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '300px',
            flexDirection: 'column',
            color: '#6b7280'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📂</div>
            <div style={{ fontSize: '1.125rem', marginBottom: '8px' }}>
              {searchTerm ? '未找到匹配的房间' : '暂无房间'}
            </div>
            {searchTerm && (
              <div style={{ fontSize: '0.875rem' }}>
                尝试调整搜索条件或筛选器
              </div>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <GalleryThumbnailGrid
            rooms={filteredAndSortedRooms}
            onRoomClick={handleRoomClick}
            thumbnailSize={{ width: 180, height: 135 }}
          />
        ) : (
          // 列表视图
          <div style={{ padding: '16px' }}>
            {filteredAndSortedRooms.map((room) => (
              <div
                key={room.id}
                onClick={() => handleRoomClick(room)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb'
                  e.currentTarget.style.transform = 'translateX(4px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white'
                  e.currentTarget.style.transform = 'translateX(0)'
                }}
              >
                <GalleryThumbnail
                  room={room}
                  width={80}
                  height={60}
                  priority="high"
                />
                <div style={{ marginLeft: '16px', flex: 1 }}>
                  <div style={{
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#111827',
                    marginBottom: '4px'
                  }}>
                    {room.name}
                  </div>
                  <div style={{
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    marginBottom: '4px'
                  }}>
                    {room.description || '无描述'}
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                    display: 'flex',
                    gap: '12px'
                  }}>
                    <span>创建者: {room.ownerName}</span>
                    <span>修改: {new Date(room.lastModified).toLocaleDateString()}</span>
                    {room.shared && <span style={{ color: '#10b981' }}>✓ 已共享</span>}
{room.publish && <PublishStatusIndicator roomId={room.id} />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// 添加CSS动画
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `
  if (!document.head.contains(style)) {
    document.head.appendChild(style)
  }
}