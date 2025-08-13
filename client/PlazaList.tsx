import React, { useState, useEffect } from 'react'
import { useUser } from '@clerk/clerk-react'

interface PlazaRoom {
  id: string
  name: string
  ownerId: string
  createdAt: string
  lastModified: number
  plaza: boolean
  shared: boolean
  published?: boolean
  description?: string
}

interface PlazaListProps {
  onRoomSelect: (roomId: string) => void
  onBackToApp: () => void
}

export function PlazaList({ onRoomSelect, onBackToApp }: PlazaListProps) {
  const [plazaRooms, setPlazaRooms] = useState<PlazaRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useUser()

  useEffect(() => {
    loadPlazaRooms()
  }, [])

  const loadPlazaRooms = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // 添加时间戳避免缓存，确保获取最新数据
      const timestamp = Date.now()
      const response = await fetch(`/api/rooms?plaza=true&_t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })
      if (!response.ok) {
        throw new Error(`Failed to load plaza rooms: ${response.status}`)
      }
      
      const allRooms = await response.json()
      // 只显示真正设为广场的房间
      const plazaRooms = allRooms.filter((room: PlazaRoom) => room.plaza === true)
      console.log('🏛️ 加载广场房间:', plazaRooms.length, '个')
      setPlazaRooms(plazaRooms || [])
    } catch (err: any) {
      console.error('Error loading plaza rooms:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRoomClick = (room: PlazaRoom) => {
    // 直接使用房间ID跳转，这样更可靠
    console.log('🏛️ 选择广场房间:', room.id, room.name)
    onRoomSelect(room.id)
  }

  const formatDate = (timestamp: string | number) => {
    const date = new Date(typeof timestamp === 'string' ? timestamp : timestamp)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="plaza-list-container">
        <div className="plaza-header">
          <button className="back-btn" onClick={onBackToApp}>
            ← 返回应用
          </button>
          <h1>🏛️ 广场</h1>
          <p>探索公共创作空间</p>
        </div>
        <div className="loading-state">
          <div className="spinner"></div>
          <p>正在加载广场内容...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="plaza-list-container">
        <div className="plaza-header">
          <button className="back-btn" onClick={onBackToApp}>
            ← 返回应用
          </button>
          <h1>🏛️ 广场</h1>
        </div>
        <div className="error-state">
          <p>❌ 加载失败: {error}</p>
          <button onClick={loadPlazaRooms} className="retry-btn">
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="plaza-list-container">
      <div className="plaza-header">
        <button className="back-btn" onClick={onBackToApp}>
          ← 返回应用
        </button>
        <div className="header-content">
          <h1>🏛️ 广场</h1>
          <p>发现和参与公共创作空间 ({plazaRooms.length} 个房间)</p>
        </div>
        <button onClick={loadPlazaRooms} className="refresh-btn">
          🔄 刷新
        </button>
      </div>

      {plazaRooms.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏛️</div>
          <h3>暂无广场内容</h3>
          <p>还没有房间被设为广场，请稍后再来查看</p>
        </div>
      ) : (
        <div className="plaza-grid">
          {plazaRooms.map((room) => (
            <div 
              key={room.id} 
              className="plaza-room-card"
              onClick={() => handleRoomClick(room)}
            >
              <div className="room-header">
                <h3 className="room-name">
                  {room.name || `房间 ${room.id.substring(0, 8)}`}
                </h3>
                <div className="room-badges">
                  {room.plaza && <span className="badge plaza">广场</span>}
                  {room.shared && <span className="badge shared">共享</span>}
                  {room.published && <span className="badge published">发布</span>}
                </div>
              </div>
              
              {room.description && (
                <p className="room-description">{room.description}</p>
              )}
              
              <div className="room-meta">
                <div className="room-info">
                  <span className="room-id">ID: {room.id.substring(0, 12)}...</span>
                  <span className="room-date">
                    {formatDate(room.lastModified || room.createdAt)}
                  </span>
                </div>
                <button className="enter-room-btn">
                  进入房间 →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .plaza-list-container {
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .plaza-header {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(10px);
          padding: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
          margin-bottom: 30px;
        }

        .header-content {
          flex: 1;
          text-align: center;
        }

        .header-content h1 {
          margin: 0;
          font-size: 28px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          font-weight: bold;
        }

        .header-content p {
          margin: 8px 0 0;
          color: #666;
          font-size: 14px;
        }

        .back-btn, .refresh-btn {
          padding: 10px 16px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .back-btn:hover, .refresh-btn:hover {
          background: #5a67d8;
          transform: translateY(-1px);
        }

        .loading-state, .error-state, .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          color: white;
          text-align: center;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          border-top: 3px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 20px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .retry-btn {
          padding: 10px 20px;
          background: white;
          color: #667eea;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          margin-top: 16px;
        }

        .empty-state .empty-icon {
          font-size: 64px;
          margin-bottom: 20px;
        }

        .plaza-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 24px;
          padding: 0 20px 40px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .plaza-room-card {
          background: white;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .plaza-room-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
        }

        .plaza-room-card:before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #667eea, #764ba2);
        }

        .room-header {
          margin-bottom: 16px;
        }

        .room-name {
          font-size: 18px;
          font-weight: 600;
          color: #1a202c;
          margin: 0 0 8px;
          line-height: 1.4;
        }

        .room-badges {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }

        .badge {
          font-size: 11px;
          padding: 3px 8px;
          border-radius: 12px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .badge.plaza {
          background: #e6f3ff;
          color: #1e40af;
        }

        .badge.shared {
          background: #d4edda;
          color: #155724;
        }

        .badge.published {
          background: #d1ecf1;
          color: #0c5460;
        }

        .room-description {
          color: #4a5568;
          font-size: 14px;
          line-height: 1.5;
          margin-bottom: 16px;
        }

        .room-meta {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }

        .room-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .room-id, .room-date {
          font-size: 12px;
          color: #718096;
        }

        .enter-room-btn {
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .enter-room-btn:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 16px rgba(102, 126, 234, 0.3);
        }

        @media (max-width: 768px) {
          .plaza-header {
            flex-direction: column;
            gap: 16px;
            text-align: center;
          }

          .plaza-grid {
            grid-template-columns: 1fr;
            padding: 0 16px 40px;
          }

          .plaza-room-card {
            padding: 20px;
          }
        }
      `}</style>
    </div>
  )
}