import React, { useState, useEffect } from 'react'
import { Room } from './RoomManager'
import { generateDefaultThumbnail } from './thumbnailGenerator'
import { roomUtils } from './roomUtils'
import { TLPageId } from 'tldraw'

interface CoverPageSelectorProps {
  room: Room
  onSelectCover: (pageId: string) => void
  onClose: () => void
  isModal?: boolean
  // 可选：由外部传入的页面列表与“当前页面”标识，使房间里有几页就显示几张缩略图
  pages?: { id: string; name: string }[]
  currentPageId?: string
  // 可选：外部临时选中态（点击立即高亮）
  selectedPageId?: string | null
}

interface PageThumbnail {
  pageId: string
  name: string
  thumbnail: string
}

/**
 * 统一的封面选择器组件
 * 可以在房间信息和画廊中使用
 */
export function CoverPageSelector({ room, onSelectCover, onClose, isModal = true, pages, currentPageId, selectedPageId }: CoverPageSelectorProps) {
  const [pageThumbnails, setPageThumbnails] = useState<PageThumbnail[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [localSelected, setLocalSelected] = useState<string | null>(selectedPageId ?? room.coverPageId ?? null)

  useEffect(() => {
    let isMounted = true
    
    const loadPageThumbnails = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const cachedThumbnails: PageThumbnail[] = []

        if (pages && pages.length > 0) {
          // 根据外部传入的页面列表构建缩略卡片，确保“有几页显示几张”
          for (const p of pages) {
            const key1 = `page-thumbnail-${room.id}-${p.id}`
            const key2 = `gallery-page-thumbnail-${room.id}-${p.id}`
            const thumb = localStorage.getItem(key1) || localStorage.getItem(key2) || generateDefaultThumbnail(150, 100)
            cachedThumbnails.push({ pageId: p.id, name: p.name, thumbnail: thumb })
          }
        } else {
          // 回退：从localStorage中已存在的页面缩略图推断
          const allPageKeys = Object.keys(localStorage).filter(key =>
            key.startsWith(`page-thumbnail-${room.id}-`) || key.startsWith(`gallery-page-thumbnail-${room.id}-`)
          )
          console.log(`Found ${allPageKeys.length} cached thumbnails for room ${room.id}`)
          if (allPageKeys.length === 0) {
            // 最后回退：给出一个默认示意，避免空白
            cachedThumbnails.push({ pageId: 'default', name: 'Page 1', thumbnail: generateDefaultThumbnail(150, 100) })
          } else {
            const processedPageIds = new Set<string>()
            for (const key of allPageKeys) {
              let pageId: string
              if (key.startsWith(`page-thumbnail-${room.id}-`)) {
                pageId = key.replace(`page-thumbnail-${room.id}-`, '')
              } else {
                pageId = key.replace(`gallery-page-thumbnail-${room.id}-`, '')
              }
              if (processedPageIds.has(pageId)) continue
              processedPageIds.add(pageId)
              const thumbnail = localStorage.getItem(key)
              const pageName = `Page ${pageId.slice(-1) || ''}`
              if (thumbnail) {
                cachedThumbnails.push({ pageId, name: pageName, thumbnail })
              }
            }
          }
        }
        
        if (isMounted) {
          // 按照当前封面优先排序
          cachedThumbnails.sort((a, b) => {
            if (a.pageId === room.coverPageId) return -1
            if (b.pageId === room.coverPageId) return 1
            return 0
          })
          
          setPageThumbnails(cachedThumbnails)
        }
      } catch (err) {
        console.error('Failed to load page thumbnails:', err)
        if (isMounted) {
          setError('无法加载页面缩略图')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }
    
    loadPageThumbnails()
    
    return () => {
      isMounted = false
    }
  }, [room.id, room.coverPageId, JSON.stringify(pages)])

  // 外部选中态变化时，同步到本地立即高亮
  useEffect(() => {
    setLocalSelected(selectedPageId ?? room.coverPageId ?? null)
  }, [selectedPageId, room.coverPageId])

  const handleSelectCover = async (pageId: string) => {
    try {
      console.log(`Attempting to set cover for room ${room.id}, page ${pageId}`)
      // 立即更新本地高亮
      setLocalSelected(pageId)
      
      // 调用父组件的回调来保存封面设置
      onSelectCover(pageId)
      
      // 给一个短暂的延迟确保数据保存完成
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // 验证保存是否成功 - 使用 async/await 正确处理 Promise
      try {
        const updatedRoom = await roomUtils.getRoom(room.id)
      if (updatedRoom && updatedRoom.coverPageId === pageId) {
        console.log(`✅ Cover successfully set for room ${room.id}, page ${pageId}`)
        
          // 更新缓存
          const pageThumbnail = localStorage.getItem(`page-thumbnail-${room.id}-${pageId}`) ||
                               localStorage.getItem(`gallery-page-thumbnail-${room.id}-${pageId}`)
          
          if (pageThumbnail) {
            localStorage.setItem(`gallery-thumbnail-${room.id}`, pageThumbnail)
            localStorage.setItem(`thumbnail-${room.id}`, pageThumbnail)
          }
          
          // 不在这里显示成功通知，因为父组件已经处理了
          onClose()
          return
      } else {
        console.error(`❌ Failed to set cover for room ${room.id}, page ${pageId}`)
          // 不显示错误，因为父组件已经处理了
        }
      } catch (error) {
        console.error('Error verifying room update:', error)
        // 不显示错误，因为父组件已经处理了
      }
      
    } catch (error) {
      console.error('Error setting cover:', error)
      // 不显示错误，因为父组件已经处理了
    }
  }

  const renderContent = () => {
    if (isLoading) {
      return (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          color: '#6b7280'
        }}>
          <div style={{
            width: '20px',
            height: '20px',
            border: '2px solid #e5e7eb',
            borderTop: '2px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }} />
          正在加载页面缩略图...
        </div>
      )
    }

    if (error) {
      return (
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          color: '#ef4444'
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>⚠️</div>
          <div>{error}</div>
          <button
            onClick={onClose}
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
      )
    }

    return (
      <div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          {pageThumbnails.map(page => (
            <div
              key={page.pageId}
              style={{
                border: (localSelected === page.pageId || room.coverPageId === page.pageId) ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '0.5rem',
                cursor: 'pointer',
                backgroundColor: (localSelected === page.pageId || room.coverPageId === page.pageId) ? '#eff6ff' : 'white',
                transition: 'all 0.2s ease'
              }}
              onClick={() => handleSelectCover(page.pageId)}
            >
              {/* 当前页徽标 */}
              {currentPageId && page.pageId === currentPageId && (
                <div style={{
                  position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 4,
                    left: 4,
                    background: '#111827',
                    color: 'white',
                    fontSize: '10px',
                    padding: '2px 4px',
                    borderRadius: '3px',
                    zIndex: 1
                  }}>当前页</div>
                </div>
              )}
              <img
                src={page.thumbnail}
                alt={page.name}
                style={{
                  width: '100%',
                  height: '80px',
                  objectFit: 'cover',
                  borderRadius: '4px',
                  marginBottom: '0.5rem'
                }}
              />
              <div style={{
                fontSize: '0.875rem',
                textAlign: 'center',
                color: '#374151'
              }}>
                {page.name}
              </div>
              {(localSelected === page.pageId || room.coverPageId === page.pageId) && (
                <div style={{
                  textAlign: 'center',
                  color: '#3b82f6',
                  fontSize: '0.75rem',
                  marginTop: '0.25rem'
                }}>
                  ✓ 已选择{room.coverPageId === page.pageId ? ' · 当前封面' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
        
        <div style={{
          textAlign: 'center',
          padding: '1rem',
          borderTop: '1px solid #e5e7eb'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginRight: '0.5rem'
            }}
          >
            取消
          </button>
          {room.coverPageId && (
            <button
              onClick={() => handleSelectCover('')}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              清除封面
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!isModal) {
    return renderContent()
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto'
      }}>
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '1.125rem',
            fontWeight: '600',
            color: '#111827'
          }}>
            选择封面页面
          </h3>
        </div>
        
        <div style={{ padding: '1.5rem' }}>
          {renderContent()}
        </div>
      </div>
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