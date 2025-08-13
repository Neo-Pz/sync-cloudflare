import React, { useState, useEffect } from 'react'
import { Room } from './RoomManager'
import { roomUtils } from './roomUtils'
import { generateRoomDefaultThumbnail, generateStaticPlaceholder, ThumbnailCache } from './StaticThumbnailGenerator'

interface RoomThumbnailProps {
  roomId: string
  width?: number
  height?: number
  onClick?: () => void
}

export function RoomThumbnail({ roomId, width = 200, height = 120, onClick }: RoomThumbnailProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [room, setRoom] = useState<Room | null>(null)
  const [showInfo, setShowInfo] = useState(false)

  // 获取房间信息
  useEffect(() => {
    const loadRoomData = async () => {
      try {
        const roomData = await roomUtils.getRoom(roomId)
    setRoom(roomData || null)
      } catch (error) {
        console.error(`Error loading room data for ${roomId}:`, error)
        setRoom(null)
      }
    }
    
    loadRoomData()
    
    // 监听房间更新事件
    const handleRoomUpdate = (event: CustomEvent) => {
      const { rooms } = event.detail
      const updatedRoom = rooms.find((r: Room) => r.id === roomId)
      if (updatedRoom) {
        console.log(`Room ${roomId} updated, cover: ${updatedRoom.coverPageId}`)
        setRoom(updatedRoom)
        // 强制重新加载缩略图
        setIsLoading(true)
        setThumbnail(null)
      }
    }
    
    // 监听封面变化事件
    const handleCoverChange = (event: CustomEvent) => {
      const { roomId: changedRoomId, coverPageId } = event.detail
      if (changedRoomId === roomId) {
        console.log(`🔄 Cover change event received for room ${roomId}, new cover: ${coverPageId}`)
        
        // 立即更新房间信息
        const updateRoomInfo = async () => {
          try {
            const updatedRoom = await roomUtils.getRoom(roomId)
        if (updatedRoom && updatedRoom.coverPageId === coverPageId) {
          console.log(`✅ Room data confirmed, updating thumbnail for room ${roomId}`)
          setRoom(updatedRoom)
          // 强制重新加载缩略图
          setIsLoading(true)
          setThumbnail(null)
        } else {
          console.warn(`⚠️ Room data not yet updated for room ${roomId}, expected cover: ${coverPageId}`)
          // 延迟重试
              setTimeout(async () => {
                try {
                  const retryRoom = await roomUtils.getRoom(roomId)
            if (retryRoom && retryRoom.coverPageId === coverPageId) {
              console.log(`✅ Room data confirmed on retry, updating thumbnail for room ${roomId}`)
              setRoom(retryRoom)
              setIsLoading(true)
              setThumbnail(null)
            } else {
              console.error(`❌ Failed to confirm room data update for room ${roomId}`)
                  }
                } catch (error) {
                  console.error(`Error retrying room data for ${roomId}:`, error)
            }
          }, 200)
            }
          } catch (error) {
            console.error(`Error updating room info for ${roomId}:`, error)
          }
        }
        
        updateRoomInfo()
      }
    }
    
    window.addEventListener('roomsUpdated', handleRoomUpdate as EventListener)
    window.addEventListener('coverChanged', handleCoverChange as EventListener)
    
    return () => {
      window.removeEventListener('roomsUpdated', handleRoomUpdate as EventListener)
      window.removeEventListener('coverChanged', handleCoverChange as EventListener)
    }
  }, [roomId])

  useEffect(() => {
    let isMounted = true
    
    const loadThumbnail = async () => {
      if (!isMounted) return
      
      setIsLoading(true)
      
      try {
        // 强制清除旧缓存，确保每次都重新加载最新的封面
        if (room?.coverPageId) {
          console.log(`🔍 Checking cover for room ${roomId}, coverPageId: ${room.coverPageId}`)
          
          // 首先尝试从localStorage获取封面缩略图
          const coverThumbnail = localStorage.getItem(`page-thumbnail-${roomId}-${room.coverPageId}`)
          if (coverThumbnail) {
            console.log(`✅ Found cover thumbnail for room ${roomId}, page ${room.coverPageId}`)
            
            // 更新gallery缓存
            localStorage.setItem(`gallery-thumbnail-${roomId}`, coverThumbnail)
            localStorage.setItem(`thumbnail-${roomId}`, coverThumbnail)
            
            setThumbnail(coverThumbnail)
            setIsLoading(false)
            return
          } else {
            console.log(`❌ Cover thumbnail not found for room ${roomId}, page ${room.coverPageId}`)
            
            // 尝试从其他可能的位置查找
            const altThumbnail = localStorage.getItem(`page-thumbnail-${room.coverPageId}`) || 
                                localStorage.getItem(`thumbnail-page-${room.coverPageId}`)
            
            if (altThumbnail) {
              console.log(`✅ Found alternative thumbnail for page ${room.coverPageId}`)
              
              // 保存到正确的位置
              localStorage.setItem(`page-thumbnail-${roomId}-${room.coverPageId}`, altThumbnail)
              localStorage.setItem(`gallery-thumbnail-${roomId}`, altThumbnail)
              localStorage.setItem(`thumbnail-${roomId}`, altThumbnail)
              
              setThumbnail(altThumbnail)
              setIsLoading(false)
              return
            }
          }
        }
        
        // 检查是否已经有缓存的房间缩略图
        const cachedThumbnail = localStorage.getItem(`gallery-thumbnail-${roomId}`) || 
                               localStorage.getItem(`thumbnail-${roomId}`)
        
        if (cachedThumbnail && !cachedThumbnail.startsWith('blob:')) {
          console.log(`Using cached thumbnail for room ${roomId}`)
          setThumbnail(cachedThumbnail)
          setIsLoading(false)
          return
        }

        // 使用新的静态缩略图生成器
        console.log(`Generating optimized thumbnail for room ${roomId}`)
        
        if (!isMounted) return
        
        // 生成基于房间信息的高质量默认缩略图
        const roomName = room?.name || ''
        const defaultThumbnail = generateRoomDefaultThumbnail(roomId, roomName, width, height)
        
        if (isMounted) {
          setThumbnail(defaultThumbnail)
          
          // 缓存到新的缓存系统
          const cacheKey = room?.coverPageId 
            ? `${roomId}-${room.coverPageId}-${room.lastModified || Date.now()}`
            : `${roomId}-default-${room?.lastModified || Date.now()}`
          ThumbnailCache.set(cacheKey, defaultThumbnail)
          
          // 兼容旧的缓存系统
          if (!room?.coverPageId) {
            localStorage.setItem(`thumbnail-${roomId}`, defaultThumbnail)
          }
        }
      } catch (error) {
        console.error('Error loading thumbnail:', error)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadThumbnail()
    
    return () => {
      isMounted = false
    }
  }, [roomId, width, height, room?.coverPageId])

  // 由于使用data URL，不再需要清理blob URL

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: '#f3f4f6',
        borderRadius: '8px',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid #e5e7eb',
        position: 'relative'
      }}
      onClick={onClick}
    >
      {isLoading ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          color: '#6b7280',
          fontSize: '0.875rem'
        }}>
          <div style={{
            width: '20px',
            height: '20px',
            border: '2px solid #e5e7eb',
            borderTop: '2px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '8px'
          }} />
          加载中...
        </div>
      ) : thumbnail ? (
        <img
          src={thumbnail}
          alt="Room thumbnail"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          color: '#6b7280',
          fontSize: '2rem'
        }}>
          <span>📝</span>
          <span style={{ fontSize: '0.75rem', marginTop: '8px' }}>
            空白画板
          </span>
        </div>
      )}

      {/* 右上角信息按钮：打开房间信息（挂在缩略图上） */}
      {room && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            // 广播到父级（RoomManager / UserRoom）弹出房间信息面板
            window.dispatchEvent(
              new CustomEvent('openRoomInfo', { detail: { roomId } }) as any
            )
          }}
          title="房间信息"
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            background: 'rgba(255,255,255,0.9)',
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            padding: '2px 6px',
            cursor: 'pointer',
            fontSize: '12px',
            lineHeight: 1,
          }}
        >
          ℹ️
        </button>
      )}
    </div>
  )
}

// 添加旋转动画的CSS
const style = document.createElement('style')
style.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`
document.head.appendChild(style)