import React, { useState, useEffect, useCallback } from 'react'
import { useUser } from '@clerk/clerk-react'
import { getSnapshot } from 'tldraw'
import { roomUtils } from './roomUtils'
import { snapshotManager } from './SnapshotManager'
import { nanoid } from 'nanoid'

interface PublishTabProps {
  roomId: string
  roomName: string
  editor?: any
  onClose?: () => void
}

interface PublishInfo {
  isPublished: boolean
  publishedSlug?: string
  lastPublished?: number
  publishUrl?: string
}

export function PublishTab({ roomId, roomName, editor, onClose }: PublishTabProps) {
  const { user } = useUser()
  const [publishInfo, setPublishInfo] = useState<PublishInfo>({ isPublished: false })
  const [isPublishing, setIsPublishing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // 获取或创建永久的发布slug
  const getOrCreatePublishedSlug = useCallback((roomId: string): string => {
    const storageKey = `publishedSlug_${roomId}`
    let publishedSlug = localStorage.getItem(storageKey)
    
    if (!publishedSlug) {
      publishedSlug = nanoid(21) // 生成21位短ID
      localStorage.setItem(storageKey, publishedSlug)
      console.log(`🆔 为房间 ${roomId} 生成新的发布slug: ${publishedSlug}`)
    }
    
    return publishedSlug
  }, [])

  // 加载发布信息
  const loadPublishInfo = useCallback(async () => {
    try {
      setIsLoading(true)
      const room = await roomUtils.getRoom(roomId)
      
      if (room) {
        const publishedSlug = getOrCreatePublishedSlug(roomId)
        const publishUrl = `${window.location.origin}/p/${publishedSlug}`
        
        setPublishInfo({
          isPublished: room.publish === true,
          publishedSlug,
          lastPublished: room.lastModified, // 使用房间的最后修改时间
          publishUrl
        })
      }
    } catch (error) {
      console.error('加载发布信息失败:', error)
    } finally {
      setIsLoading(false)
    }
  }, [roomId, getOrCreatePublishedSlug])

  // 发布房间
  const handlePublish = useCallback(async () => {
    // 等待编辑器就绪
    const actualEditor = editor || (window as any).globalEditor
    if (!actualEditor) {
      console.warn('⏳ 编辑器还未初始化，等待中...')
      setTimeout(() => handlePublish(), 500)
      return
    }

    setIsPublishing(true)
    try {
      console.log('🚀 开始发布房间...')
      
      // 获取永久的发布slug
      const publishedSlug = getOrCreatePublishedSlug(roomId)
      
      // 1. 保存快照到发布路径
      const snapshot = getSnapshot(actualEditor.store)
      await snapshotManager.savePublishSnapshot(roomId, publishedSlug, snapshot, {
        publishedBy: user?.fullName || user?.firstName || 'User',
        publishedAt: Date.now(),
        version: Date.now().toString()
      })
      
      // 2. 更新房间的发布状态
      await roomUtils.updateRoom(roomId, {
        publish: true,
        lastModified: Date.now()
      })

      // 3. 确保房间在画廊中显示
      await roomUtils.setRoomPlaza(roomId, true)
      
      // 4. 通知后端创建发布记录
      try {
        const response = await fetch(`/api/rooms/${roomId}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publishedSlug,
            publishedBy: user?.id,
            publishedAt: Date.now()
          })
        })
        
        if (response.ok) {
          console.log('✅ 后端发布记录已创建')
        }
      } catch (apiError) {
        console.warn('⚠️ 后端API调用失败，但本地发布成功:', apiError)
      }

      // 5. 更新本地状态
      setPublishInfo(prev => ({
        ...prev,
        isPublished: true,
        lastPublished: Date.now(),
        publishUrl: `${window.location.origin}/p/${publishedSlug}`
      }))

      // 6. 触发事件通知其他组件
      window.dispatchEvent(new CustomEvent('roomPublished', {
        detail: { roomId, publishedSlug }
      }))

      alert('🎉 发布成功！\n你的作品现在可以通过发布链接访问了。')
      
    } catch (error) {
      console.error('❌ 发布失败:', error)
      alert('发布失败: ' + (error as Error).message)
    } finally {
      setIsPublishing(false)
    }
  }, [editor, roomId, user, getOrCreatePublishedSlug])

  // 更新发布
  const handleUpdatePublish = useCallback(async () => {
    // 等待编辑器就绪
    const actualEditor = editor || (window as any).globalEditor
    if (!actualEditor || !publishInfo.publishedSlug) {
      if (!actualEditor) {
        console.warn('⏳ 编辑器还未初始化，等待中...')
        setTimeout(() => handleUpdatePublish(), 500)
        return
      } else {
        alert('缺少发布信息')
        return
      }
    }

    setIsPublishing(true)
    try {
      console.log('📸 开始更新发布...')
      
      // 1. 更新快照
      const snapshot = getSnapshot(actualEditor.store)
      await snapshotManager.savePublishSnapshot(roomId, publishInfo.publishedSlug, snapshot, {
        publishedBy: user?.fullName || user?.firstName || 'User',
        publishedAt: Date.now(),
        version: Date.now().toString()
      })
      
      // 2. 更新房间的最后修改时间
      await roomUtils.updateRoom(roomId, {
        lastModified: Date.now()
      })

      // 3. 更新本地状态
      setPublishInfo(prev => ({
        ...prev,
        lastPublished: Date.now()
      }))

      alert('✅ 发布已更新！\n访问者将看到最新版本。')
      
    } catch (error) {
      console.error('❌ 更新发布失败:', error)
      alert('更新发布失败: ' + (error as Error).message)
    } finally {
      setIsPublishing(false)
    }
  }, [editor, roomId, publishInfo.publishedSlug, user])

  // 取消发布
  const handleUnpublish = useCallback(async () => {
    if (!confirm('确定要取消发布吗？这将使发布链接无法访问。')) {
      return
    }

    setIsPublishing(true)
    try {
      console.log('🗑️ 开始取消发布...')
      
      // 1. 更新房间状态
      await roomUtils.updateRoom(roomId, {
        publish: false,
        lastModified: Date.now()
      })

      await roomUtils.setRoomPlaza(roomId, false)

      // 2. 删除发布快照（可选，也可以保留）
      if (publishInfo.publishedSlug) {
        try {
          await snapshotManager.clearPublishSnapshot(publishInfo.publishedSlug)
        } catch (clearError) {
          console.warn('清理发布快照失败:', clearError)
        }
      }

      // 3. 更新本地状态
      setPublishInfo(prev => ({
        ...prev,
        isPublished: false,
        lastPublished: undefined
      }))

      // 4. 触发事件通知其他组件
      window.dispatchEvent(new CustomEvent('roomUnpublished', {
        detail: { roomId }
      }))

      alert('✅ 已取消发布')
      
    } catch (error) {
      console.error('❌ 取消发布失败:', error)
      alert('取消发布失败: ' + (error as Error).message)
    } finally {
      setIsPublishing(false)
    }
  }, [roomId, publishInfo.publishedSlug])

  // 复制发布链接
  const copyPublishUrl = useCallback(async () => {
    if (publishInfo.publishUrl) {
      try {
        await navigator.clipboard.writeText(publishInfo.publishUrl)
        alert('✅ 发布链接已复制到剪贴板')
      } catch (error) {
        console.error('复制失败:', error)
        // 降级方案：选中文本
        const textArea = document.createElement('textarea')
        textArea.value = publishInfo.publishUrl
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        alert('✅ 发布链接已复制到剪贴板')
      }
    }
  }, [publishInfo.publishUrl])

  useEffect(() => {
    loadPublishInfo()
  }, [loadPublishInfo])

  if (isLoading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div>加载发布信息...</div>
      </div>
    )
  }

  return (
    <div style={{
      padding: '20px',
      backgroundColor: 'white',
      borderRadius: '8px',
      minWidth: '400px',
      maxWidth: '500px'
    }}>
      {/* 标题 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '10px'
      }}>
        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '600' }}>
          📤 发布设置
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* 房间信息 */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontWeight: '500', marginBottom: '5px' }}>
          {roomName}
        </div>
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          房间ID: {roomId}
        </div>
      </div>

      {/* 发布状态 */}
      <div style={{
        padding: '15px',
        backgroundColor: publishInfo.isPublished ? '#f0fdf4' : '#f9fafb',
        border: `1px solid ${publishInfo.isPublished ? '#d1fae5' : '#e5e7eb'}`,
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '10px'
        }}>
          <span style={{
            fontSize: '1.2rem',
            marginRight: '8px'
          }}>
            {publishInfo.isPublished ? '🟢' : '🔴'}
          </span>
          <span style={{ fontWeight: '500' }}>
            {publishInfo.isPublished ? '已发布' : '未发布'}
          </span>
        </div>
        
        {publishInfo.isPublished && (
          <>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '10px' }}>
              发布链接: 
              <button
                onClick={copyPublishUrl}
                style={{
                  marginLeft: '8px',
                  padding: '2px 6px',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                复制链接
              </button>
            </div>
            <div style={{
              fontSize: '0.75rem',
              color: '#6b7280',
              wordBreak: 'break-all',
              backgroundColor: '#f3f4f6',
              padding: '8px',
              borderRadius: '4px',
              fontFamily: 'monospace'
            }}>
              {publishInfo.publishUrl}
            </div>
            {publishInfo.lastPublished && (
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '10px' }}>
                最后更新: {new Date(publishInfo.lastPublished).toLocaleString()}
              </div>
            )}
          </>
        )}
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
        {!publishInfo.isPublished ? (
          <button
            onClick={handlePublish}
            disabled={isPublishing}
            style={{
              padding: '12px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: '500',
              cursor: isPublishing ? 'not-allowed' : 'pointer',
              opacity: isPublishing ? 0.6 : 1
            }}
          >
            {isPublishing ? '发布中...' : '🚀 发布到画廊'}
          </button>
        ) : (
          <>
            <button
              onClick={handleUpdatePublish}
              disabled={isPublishing}
              style={{
                padding: '12px 20px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '1rem',
                fontWeight: '500',
                cursor: isPublishing ? 'not-allowed' : 'pointer',
                opacity: isPublishing ? 0.6 : 1
              }}
            >
              {isPublishing ? '更新中...' : '📸 更新发布内容'}
            </button>
            
            <button
              onClick={handleUnpublish}
              disabled={isPublishing}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#ef4444',
                border: '1px solid #ef4444',
                borderRadius: '6px',
                fontSize: '0.875rem',
                cursor: isPublishing ? 'not-allowed' : 'pointer',
                opacity: isPublishing ? 0.6 : 1
              }}
            >
              取消发布
            </button>
          </>
        )}
      </div>

      {/* 说明文字 */}
      <div style={{
        marginTop: '20px',
        padding: '12px',
        backgroundColor: '#f9fafb',
        borderRadius: '6px',
        fontSize: '0.875rem',
        color: '#6b7280'
      }}>
        <div style={{ fontWeight: '500', marginBottom: '5px' }}>
          📝 发布说明：
        </div>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          <li>发布后将创建当前内容的静态快照</li>
          <li>发布链接永久有效，可随时更新内容</li>
          <li>发布的作品将显示在画廊的"发布白板"列表中</li>
          <li>只有房间所有者可以发布和更新内容</li>
        </ul>
      </div>
    </div>
  )
}