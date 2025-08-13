import React, { useState, useEffect, useCallback } from 'react'
import { Room } from './RoomManager'
import { roomUtils } from './roomUtils'
import { generateRoomDefaultThumbnail, generateStaticPlaceholder, ThumbnailCache } from './StaticThumbnailGenerator'

interface GalleryThumbnailProps {
  room: Room
  width?: number
  height?: number
  onClick?: () => void
  priority?: 'high' | 'normal' | 'low' // 加载优先级
}

/**
 * 画廊专用缩略图组件
 * 优化为快速加载和良好的用户体验
 */
export function GalleryThumbnail({ 
  room, 
  width = 160, 
  height = 120, 
  onClick,
  priority = 'normal'
}: GalleryThumbnailProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(false)

  // 生成缓存键
  const getCacheKey = useCallback(() => {
    if (room.coverPageId) {
      return `${room.id}-${room.coverPageId}-${room.lastModified}`
    }
    return `${room.id}-default-${room.lastModified}`
  }, [room.id, room.coverPageId, room.lastModified])

  // 立即显示默认缩略图，不显示加载状态
  const generateImmediateThumbnail = useCallback(() => {
    // 首先尝试生成基于房间信息的默认缩略图
    const defaultThumbnail = generateRoomDefaultThumbnail(
      room.id, 
      room.name, 
      width, 
      height
    )
    setThumbnail(defaultThumbnail)
    setError(false)
  }, [room.id, room.name, width, height])

  // 异步加载更好的缩略图
  const loadOptimizedThumbnail = useCallback(async () => {
    const cacheKey = getCacheKey()
    
    // 检查缓存
    const cached = ThumbnailCache.get(cacheKey)
    if (cached) {
      setThumbnail(cached)
      return
    }

    // 如果有封面页面，尝试加载封面缩略图
    if (room.coverPageId) {
      try {
        // 尝试从多个可能的缓存位置查找封面缩略图
        const coverThumbnail = 
          localStorage.getItem(`page-thumbnail-${room.id}-${room.coverPageId}`) ||
          localStorage.getItem(`gallery-page-thumbnail-${room.id}-${room.coverPageId}`) ||
          localStorage.getItem(`page-thumbnail-${room.coverPageId}`)

        if (coverThumbnail && !coverThumbnail.startsWith('blob:')) {
          setThumbnail(coverThumbnail)
          // 缓存到新的缓存系统
          ThumbnailCache.set(cacheKey, coverThumbnail)
          return
        }
      } catch (error) {
        console.warn(`Failed to load cover thumbnail for room ${room.id}:`, error)
      }
    }

    // 如果没有封面或封面加载失败，使用已生成的默认缩略图
    // 不设置错误状态，因为默认缩略图已经足够好了
  }, [room, getCacheKey])

  // 组件挂载时立即显示默认缩略图
  useEffect(() => {
    generateImmediateThumbnail()
    
    // 根据优先级延迟加载优化缩略图
    const delay = priority === 'high' ? 50 : priority === 'normal' ? 200 : 500
    
    const timer = setTimeout(() => {
      loadOptimizedThumbnail()
    }, delay)

    return () => clearTimeout(timer)
  }, [generateImmediateThumbnail, loadOptimizedThumbnail, priority])

  // 监听封面变化事件
  useEffect(() => {
    const handleCoverChange = (event: CustomEvent) => {
      const { roomId, coverPageId } = event.detail
      if (roomId === room.id) {
        // 清除旧缓存
        ThumbnailCache.remove(getCacheKey())
        
        // 立即重新生成默认缩略图
        generateImmediateThumbnail()
        
        // 延迟加载新的封面缩略图
        setTimeout(() => {
          loadOptimizedThumbnail()
        }, 100)
      }
    }

    window.addEventListener('coverChanged', handleCoverChange as EventListener)
    
    return () => {
      window.removeEventListener('coverChanged', handleCoverChange as EventListener)
    }
  }, [room.id, getCacheKey, generateImmediateThumbnail, loadOptimizedThumbnail])

  // 错误处理 - 显示错误占位符
  const handleImageError = useCallback(() => {
    setError(true)
    const errorThumbnail = generateStaticPlaceholder(width, height, 'error')
    setThumbnail(errorThumbnail)
  }, [width, height])

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: '#ffffff',
        borderRadius: '8px',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        border: '1px solid #e5e7eb',
        position: 'relative',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease'
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
        }
      }}
    >
      {thumbnail ? (
        <img
          src={thumbnail}
          alt={room.name}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
          onError={handleImageError}
          loading="lazy" // 原生懒加载
        />
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9fafb',
          color: '#6b7280',
          fontSize: '0.875rem'
        }}>
          <div style={{
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>📄</div>
            <div>加载中</div>
          </div>
        </div>
      )}
      
      {/* 状态指示器 */}
      {room.published && (
        <div style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          width: '16px',
          height: '16px',
          backgroundColor: '#10b981',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '8px',
          color: 'white',
          fontWeight: 'bold'
        }}>
          ✓
        </div>
      )}
      
      {room.coverPageId && (
        <div style={{
          position: 'absolute',
          bottom: '6px',
          right: '6px',
          width: '16px',
          height: '16px',
          backgroundColor: 'rgba(59, 130, 246, 0.9)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '8px',
          color: 'white'
        }}>
          📷
        </div>
      )}
      
      {room.publish && (
        <div style={{
          position: 'absolute',
          top: '6px',
          left: '6px',
          width: '16px',
          height: '16px',
          backgroundColor: 'rgba(245, 158, 11, 0.9)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '8px',
          color: 'white'
        }}>
          ⭐
        </div>
      )}
    </div>
  )
}

/**
 * 画廊缩略图网格组件
 * 为画廊页面优化的批量缩略图显示
 */
export function GalleryThumbnailGrid({ 
  rooms, 
  onRoomClick, 
  thumbnailSize = { width: 160, height: 120 },
  className = ''
}: {
  rooms: Room[]
  onRoomClick: (room: Room) => void
  thumbnailSize?: { width: number; height: number }
  className?: string
}) {
  const [visibleRooms, setVisibleRooms] = useState(new Set<string>())

  // 使用Intersection Observer来实现可见性检测
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const roomId = entry.target.getAttribute('data-room-id')
          if (roomId) {
            if (entry.isIntersecting) {
              setVisibleRooms(prev => new Set([...prev, roomId]))
            }
          }
        })
      },
      {
        rootMargin: '100px' // 提前100px开始加载
      }
    )

    // 观察所有缩略图容器
    const thumbnailElements = document.querySelectorAll('[data-room-id]')
    thumbnailElements.forEach(el => observer.observe(el))

    return () => observer.disconnect()
  }, [rooms])

  return (
    <div 
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize.width}px, 1fr))`,
        gap: '16px',
        padding: '16px'
      }}
    >
      {rooms.map((room, index) => (
        <div
          key={room.id}
          data-room-id={room.id}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <GalleryThumbnail
            room={room}
            width={thumbnailSize.width}
            height={thumbnailSize.height}
            onClick={() => onRoomClick(room)}
            priority={index < 6 ? 'high' : index < 12 ? 'normal' : 'low'}
          />
          <div style={{
            marginTop: '8px',
            fontSize: '0.875rem',
            color: '#374151',
            textAlign: 'center',
            fontWeight: '500',
            maxWidth: `${thumbnailSize.width}px`,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {room.name}
          </div>
          <div style={{
            fontSize: '0.75rem',
            color: '#6b7280',
            textAlign: 'center',
            marginTop: '2px'
          }}>
            {new Date(room.lastModified).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  )
}