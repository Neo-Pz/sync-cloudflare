import { useState, useEffect, useMemo } from 'react'
import { useUser } from '@clerk/clerk-react'
import { getSnapshot } from 'tldraw'
import { roomUtils } from './roomUtils'
import { CoverPageSelector } from './CoverPageSelector'
import type { Room as GalleryRoom } from './RoomManager'
import { SimplePermissionManager, useSimplePermissions, type SimplePermission } from './SimplePermissionManager'
import { generateRoomDefaultThumbnail } from './StaticThumbnailGenerator'
import { generateAllPageThumbnails } from './thumbnailGenerator'

interface RoomSettingsProps {
  isOpen: boolean
  onClose: () => void
  roomId: string
  editor?: any
}

interface RoomData {
  id: string
  name: string
  ownerId: string
  permission: 'viewer' | 'editor' | 'assist'
  maxPermission?: 'viewer' | 'editor' | 'assist'
  shared: boolean
  publish?: boolean
  historyLocked?: boolean
  historyLockTimestamp?: number
  historyLockedBy?: string
  historyLockedByName?: string
  lastModified?: number
  description?: string
  tags?: string[]
}

export function RoomSettings({ isOpen, onClose, roomId, editor }: RoomSettingsProps) {
  const { user } = useUser()
  const [roomData, setRoomData] = useState<RoomData | null>(null)
  const [isSaving, setSaving] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [showRoomInfo, setShowRoomInfo] = useState<boolean>(true)
  const [newDescription, setNewDescription] = useState<string>('')
  const [newTags, setNewTags] = useState<string>('')
  const [publishStatus, setPublishStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none')
  
  // URL路径检测状态
  const [isOriginalRoom, setIsOriginalRoom] = useState(true)
  const [currentRoomType, setCurrentRoomType] = useState<'private' | 'shared' | 'published'>('private')
  
  // 临时状态 - 存储未保存的更改
  const [tempPermission, setTempPermission] = useState<SimplePermission>('viewer')
  const [tempShared, setTempShared] = useState(false)
  const [tempPublish, setTempPublish] = useState(false)
  const [tempShareMode, setTempShareMode] = useState<'live' | 'snapshot'>('live')
  

  
  // 使用简化权限管理
  const { 
    config: permissionConfig, 
    isLoading, 
    isOwner,
    updatePermission,
    getPermissionInfo
  } = useSimplePermissions(roomId, editor)
  
  // 本地状态用于表单
  const [permission, setPermission] = useState<SimplePermission>('viewer')
  const [shared, setShared] = useState(false)
  const [publish, setPublish] = useState(false)
  
  // 分享模式状态
  const [shareMode, setShareMode] = useState<'live' | 'snapshot'>(() => {
    const savedMode = localStorage.getItem(`shareMode_${roomId}`)
    return savedMode === 'snapshot' ? 'snapshot' : 'live'
  })

  // 封面选择状态（用于“房间封面”设置）
  const [selectedCoverPageId, setSelectedCoverPageId] = useState<string | null>(null)
  const [showCoverInSettings, setShowCoverInSettings] = useState<boolean>(false)
  const [coverRefreshTick, setCoverRefreshTick] = useState<number>(0)
  const [editorPages, setEditorPages] = useState<{ id: string; name: string }[]>([])

  // 监听封面变更事件，驱动“当前封面”独立显示实时更新
  useEffect(() => {
    const handler = () => setCoverRefreshTick(Date.now())
    window.addEventListener('coverChanged', handler as EventListener)
    return () => window.removeEventListener('coverChanged', handler as EventListener)
  }, [])

  // 动态生成并缓存小地图缩略图（面板展开期间定时刷新，接近实时）
  useEffect(() => {
    if (!isOpen || !showCoverInSettings || !editor || !roomData) return
    let cancelled = false
    const refresh = async () => {
      try {
        const pages = editor.getPages?.() || []
        if (cancelled) return
        setEditorPages(pages.map((p: any) => ({ id: p.id, name: p.name })))

        const results = await generateAllPageThumbnails(editor, {
          width: 150,
          height: 100,
          scale: 0.3,
          background: true
        })
        if (cancelled) return
        // 写入本地缓存，供 CoverPageSelector 立即读取
        results.forEach(r => {
          localStorage.setItem(`page-thumbnail-${roomData.id}-${r.pageId}`, r.thumbnail)
          localStorage.setItem(`gallery-page-thumbnail-${roomData.id}-${r.pageId}`, r.thumbnail)
        })
        // 若恰好为当前封面，更新画廊封面缓存
        const coverId = (roomData as any).coverPageId
        if (coverId) {
          const cover = results.find(r => r.pageId === coverId)
          if (cover) {
            localStorage.setItem(`gallery-thumbnail-${roomData.id}`, cover.thumbnail)
            localStorage.setItem(`thumbnail-${roomData.id}`, cover.thumbnail)
          }
        }
      } catch (e) {
        // 忽略生成失败
      }
    }

    // 立即刷新一次
    refresh()
    // 定时刷新，编辑画面变动后小地图自动更新
    const timer = setInterval(refresh, 1500)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isOpen, showCoverInSettings, editor, roomData?.id])

  // URL路径检测 - 确定当前房间类型
  useEffect(() => {
    if (!isOpen) return
    
    const currentPath = window.location.pathname
    console.log('🔍 RoomSettings: 检测URL路径:', currentPath)
    
    if (currentPath.startsWith('/r/')) {
      setIsOriginalRoom(true)
      setCurrentRoomType('private')
      console.log('📍 RoomSettings: 原始房间 (/r/) - 可编辑')
    } else if (currentPath.startsWith('/s/')) {
      setIsOriginalRoom(false)
      setCurrentRoomType('shared')
      console.log('📍 RoomSettings: 共享空间 (/s/) - 只读状态')
    } else if (currentPath.startsWith('/p/')) {
      setIsOriginalRoom(false)
      setCurrentRoomType('published')
      console.log('📍 RoomSettings: 发布展示 (/p/) - 只读状态')
    } else {
      setIsOriginalRoom(true)
      setCurrentRoomType('private')
      console.log('📍 RoomSettings: 默认为原始房间')
    }
  }, [isOpen])

  // Load room data function
    const loadRoomData = async () => {
      if (!isOpen || !roomId) return

      try {
        const room = await roomUtils.getRoom(roomId)
        if (room) {
          setRoomData(room)
          setNewRoomName(room.name || '')
          setNewDescription((room as any).description || '')
          setNewTags(Array.isArray((room as any).tags) ? (room as any).tags.join(', ') : '')
        }
        
        // 检查发布申请状态
        const status = await SimplePermissionManager.checkPublishStatus(roomId)
        setPublishStatus(status)
      } catch (error) {
        console.error('Error loading room data:', error)
      }
    }

  // Load room data and sync with permission config
  useEffect(() => {
    loadRoomData()
  }, [isOpen, roomId])

  // 监听来自缩略图的“打开房间信息”请求
  useEffect(() => {
    const handler = (e: Event) => {
      const { roomId: targetId, expand } = (e as CustomEvent).detail || {}
      if (targetId === roomId) {
        // 打开面板并展开房间信息
        if (!isOpen) {
          // 触发父级打开逻辑：依赖外部控制，这里仅设置本地状态
        }
        setShowRoomInfo(true)
      }
    }
    window.addEventListener('openRoomSettings', handler as EventListener)
    return () => window.removeEventListener('openRoomSettings', handler as EventListener)
  }, [roomId, isOpen])

  // 同步权限配置到本地状态
  useEffect(() => {
    if (permissionConfig) {
      console.log(`🔄 RoomSettings: 同步简化权限配置`, permissionConfig)
      setPermission(permissionConfig.permission)
      setShared(permissionConfig.shared)  // 使用shared字段
      setPublish(permissionConfig.publish || false)
      
      // 初始化临时状态为当前值
      setTempPermission(permissionConfig.permission)
      setTempShared(permissionConfig.shared)
      setTempPublish(permissionConfig.publish || false)
      
      // 从localStorage获取分享模式，默认为live
      const savedMode = localStorage.getItem(`shareMode_${roomId}`)
      const currentShareMode = savedMode === 'snapshot' ? 'snapshot' : 'live'
      setShareMode(currentShareMode)
      setTempShareMode(currentShareMode)
    }
  }, [permissionConfig, roomId])

  // 重命名房间
  const handleRename = async () => {
    if (!newRoomName.trim() || !roomData) return

    try {
      await roomUtils.updateRoom(roomId, { 
        name: newRoomName.trim(), 
        lastModified: Date.now() 
      })
      
      // 更新本地状态
      setRoomData(prev => prev ? { ...prev, name: newRoomName.trim() } : null)
      setIsEditingName(false)
      
      // 触发房间更新事件，让工作空间同步更新
      window.dispatchEvent(new CustomEvent('roomsUpdated', {
        detail: {
          roomId,
          name: newRoomName.trim(),
          lastModified: Date.now()
        }
      }))
      
      // 触发房间数据变更事件
      window.dispatchEvent(new CustomEvent('roomDataChanged', {
        detail: {
          roomId,
          name: newRoomName.trim(),
          lastModified: Date.now()
        }
      }))
      
      console.log(`✅ Room renamed: ${roomData.name} -> ${newRoomName.trim()}`)
      
    } catch (error) {
      console.error('Error renaming room:', error)
      alert('重命名房间失败')
    }
  }

  // 保存房间信息（名称、简介、标签）
  const handleSaveRoomInfo = async () => {
    if (!roomData) return
    const updated: any = {}
    if (newRoomName.trim() && newRoomName.trim() !== roomData.name) {
      updated.name = newRoomName.trim()
    }
    updated.description = newDescription || ''
    updated.tags = newTags
      ? newTags.split(',').map((t) => t.trim()).filter(Boolean)
      : []
    updated.lastModified = Date.now()

    try {
      await roomUtils.updateRoom(roomId, updated)
      // 本地状态
      setRoomData((prev) => (prev ? { ...prev, ...updated } : prev))
      setIsEditingName(false)

      // 通知其他模块
      window.dispatchEvent(
        new CustomEvent('roomsUpdated', {
          detail: { roomId, name: updated.name || roomData.name, lastModified: updated.lastModified },
        })
      )
      window.dispatchEvent(
        new CustomEvent('roomDataChanged', {
          detail: { roomId, ...updated },
        })
      )
      // 轻提示
      const notification = document.createElement('div')
      notification.style.cssText = `position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 10px 12px; border-radius: 8px; z-index: 10000;`
      notification.textContent = '房间信息已保存'
      document.body.appendChild(notification)
      setTimeout(() => notification.remove(), 2000)
    } catch (e) {
      console.error('Error saving room info', e)
      alert('保存房间信息失败，请重试')
    }
  }

  // 保存简化权限设置
  const handleSave = async () => {
    if (!roomData || !isOwner) return

    setSaving(true)
    try {
      console.log('🔄 保存简化权限设置', { roomId, tempPermission, tempShared, tempPublish })
      
      const success = await updatePermission(tempPermission, tempShared, tempPublish)
      
      if (success) {
        console.log('✅ 简化权限设置保存成功')
        
        // 检查是否新发布，如果是则需要立即创建快照
        const wasPublishRoom = roomData.publish || false
        const isNowPublishRoom = tempPublish && tempShared
        const isNewPublication = isNowPublishRoom && !wasPublishRoom
        
        // 更新本地房间数据
        setRoomData(prev => prev ? {
          ...prev,
          permission: tempPermission,
          shared: tempShared,
          publish: tempPublish,
          lastModified: Date.now()
        } : null)
        
        // 触发全局房间更新事件，让画廊同步状态
        window.dispatchEvent(new CustomEvent('roomsUpdated', { 
          detail: { 
            roomId,
            permission: tempPermission,
            shared: tempShared,
            publish: tempPublish,
            lastModified: Date.now()
          } 
        }))
        
        // 触发房间数据变更事件
        window.dispatchEvent(new CustomEvent('roomDataChanged', {
          detail: {
            roomId,
            permission: tempPermission,
            shared: tempShared,
            publish: tempPublish,
            lastModified: Date.now()
          }
        }))
        
        // 保存成功后，更新实际状态
        setPermission(tempPermission)
        setShared(tempShared)
        setPublish(tempPublish)
        setShareMode(tempShareMode)
        
        // 保存分享模式到localStorage
        localStorage.setItem(`shareMode_${roomId}`, tempShareMode)
        
        const permissionInfo = getPermissionInfo(tempPermission)
        const historyEffect = permissionInfo.historyEffect
        
        // 如果新发布，立即创建快照
        if (isNewPublication) {
          console.log('🚀 新发布，立即创建快照...')
          
          // 检查编辑器是否可用
          if (!editor) {
            console.warn('⚠️ 编辑器不可用，稍后重试创建快照')
            
            // 显示延迟创建提示
            const delayedNotification = document.createElement('div')
            delayedNotification.style.cssText = `
              position: fixed;
              top: 20px;
              right: 20px;
              background: #f59e0b;
              color: white;
              padding: 12px 16px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 500;
              z-index: 10000;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              max-width: 350px;
            `
            delayedNotification.innerHTML = `
              <div style="display: flex; align-items: center; gap: 8px;">
                <span>⏳</span>
                <div>
                  <div>【${roomData.name}】已标记为发布房间</div>
                  <div style="font-size: 12px; opacity: 0.9; margin-top: 2px;">
                    快照将在编辑器就绪后自动创建
                  </div>
                </div>
              </div>
            `
            document.body.appendChild(delayedNotification)
            
            setTimeout(() => {
              if (delayedNotification.parentNode) {
                delayedNotification.parentNode.removeChild(delayedNotification)
              }
            }, 4000)
            
            // 设置一个延迟任务，尝试在编辑器就绪后创建快照
            setTimeout(async () => {
              try {
                if (editor) {
                  console.log('📸 编辑器已就绪，开始创建延迟发布快照')
                  const { snapshotManager } = await import('./SnapshotManager')
                  // 生成发布slug
                  const publishedSlug = localStorage.getItem(`publishedSlug_${roomId}`) || `${roomId}-${Date.now()}`
                  if (!localStorage.getItem(`publishedSlug_${roomId}`)) {
                    localStorage.setItem(`publishedSlug_${roomId}`, publishedSlug)
                  }
                  
                  const snapshot = getSnapshot(editor.store)
                  const version = await snapshotManager.savePublishSnapshot(
                    roomId,
                    publishedSlug,
                    snapshot,
                    {
                      publishedBy: user?.fullName || user?.firstName || 'User',
                      publishedAt: Date.now(),
                      version: `v${Date.now()}`
                    }
                  )
                  
                  // 通知后端同步
                  try {
                    await fetch(`/api/rooms/${roomId}/sync-to-publish`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        version,
                        publishedBy: user?.fullName || user?.firstName || 'User',
                        publishedAt: Date.now()
                      })
                    })
                  } catch (e) {
                    console.warn('后端同步失败:', e)
                  }
                  
                  // 显示成功提示
                  const successNotification = document.createElement('div')
                  successNotification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: #10b981;
                    color: white;
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    z-index: 10000;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    max-width: 350px;
                  `
                  successNotification.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span>🎉</span>
                      <div>
                        <div>【${roomData.name}】快照创建完成！</div>
                        <div style="font-size: 12px; opacity: 0.9; margin-top: 2px;">
                          发布版本: ${version}
                        </div>
                      </div>
                    </div>
                  `
                  document.body.appendChild(successNotification)
                  
                  setTimeout(() => {
                    if (successNotification.parentNode) {
                      successNotification.parentNode.removeChild(successNotification)
                    }
                  }, 4000)
                }
              } catch (error) {
                console.error('延迟快照创建失败:', error)
              }
            }, 2000)
            
            return
          }
          
          try {
            const { snapshotManager } = await import('./SnapshotManager')
            // 生成发布slug
            const publishedSlug = localStorage.getItem(`publishedSlug_${roomId}`) || `${roomId}-${Date.now()}`
            if (!localStorage.getItem(`publishedSlug_${roomId}`)) {
              localStorage.setItem(`publishedSlug_${roomId}`, publishedSlug)
            }
            
            const snapshot = editor.store.getSnapshot()
            const version = await snapshotManager.savePublishSnapshot(
              roomId,
              publishedSlug,
              snapshot,
              {
                publishedBy: user?.fullName || user?.firstName || 'User',
                publishedAt: Date.now(),
                version: `v${Date.now()}`
              }
            )
            
            console.log('✅ 发布快照创建成功:', version)
            
            // 通知后端同步房间到发布路径
            try {
              const response = await fetch(`/api/rooms/${roomId}/sync-to-publish`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  version,
                  publishedBy: user?.fullName || user?.firstName || 'User',
                  publishedAt: Date.now()
                })
              })
              
              if (response.ok) {
                console.log('✅ 房间已同步到发布路径 /p/')
              }
            } catch (syncError) {
              console.warn('⚠️ 后端同步请求失败:', syncError)
            }
            
            // 显示发布成功提示
            const notification = document.createElement('div')
            notification.style.cssText = `
              position: fixed;
              top: 20px;
              right: 20px;
              background: #10b981;
              color: white;
              padding: 12px 16px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 500;
              z-index: 10000;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              max-width: 350px;
            `
            notification.innerHTML = `
              <div style="display: flex; align-items: center; gap: 8px;">
                <span>🎉</span>
                <div>
                  <div>【${roomData.name}】已发布！</div>
                  <div style="font-size: 12px; opacity: 0.9; margin-top: 2px;">
                    快照版本: ${version}
                  </div>
                  <div style="font-size: 12px; opacity: 0.9; margin-top: 2px;">
                    访问 /p/${roomId} 查看发布版本
                  </div>
                </div>
              </div>
            `
            document.body.appendChild(notification)
            
            // 5秒后自动移除提示
            setTimeout(() => {
              if (notification.parentNode) {
                notification.parentNode.removeChild(notification)
              }
            }, 5000)
            
          } catch (snapshotError) {
            console.error('❌ 创建发布快照失败:', snapshotError)
            
            // 显示错误提示
            const errorNotification = document.createElement('div')
            errorNotification.style.cssText = `
              position: fixed;
              top: 20px;
              right: 20px;
              background: #ef4444;
              color: white;
              padding: 12px 16px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 500;
              z-index: 10000;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              max-width: 300px;
            `
            errorNotification.innerHTML = `
              <div style="display: flex; align-items: center; gap: 8px;">
                <span>⚠️</span>
                <div>发布快照创建失败，请使用分享面板手动发布更新</div>
              </div>
            `
            document.body.appendChild(errorNotification)
            
            setTimeout(() => {
              if (errorNotification.parentNode) {
                errorNotification.parentNode.removeChild(errorNotification)
              }
            }, 5000)
          }
        } else {
          // 普通设置保存提示
        const notification = document.createElement('div')
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: #10b981;
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          z-index: 10000;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          max-width: 300px;
        `
        notification.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>✅</span>
            <div>
              <div>房间设置已保存！</div>
              <div style="font-size: 12px; opacity: 0.9; margin-top: 2px;">
                权限: ${permissionInfo.name} · ${historyEffect}
              </div>
            </div>
          </div>
        `
        document.body.appendChild(notification)
        
        // 3秒后自动移除提示
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification)
          }
        }, 3000)
        }
        
        onClose()
      } else {
        console.error('❌ 权限设置保存失败')
        alert('❌ 保存失败，请重试')
      }
    } catch (error) {
      console.error('❌ 保存权限设置时出错:', error)
      alert('❌ 保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  if (isLoading) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2000
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          minWidth: '300px'
        }}>
          <div style={{ textAlign: 'center' }}>
            加载中...
          </div>
        </div>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'transparent',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2000
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '8px',
          minWidth: '300px',
          textAlign: 'center'
        }}>
          <h2 style={{ margin: '0 0 1rem 0', color: '#ef4444' }}>访问被拒绝</h2>
          <p style={{ margin: '0 0 1rem 0', color: '#6b7280' }}>
            只有房间创建者可以修改房间设置
          </p>
          <button
            onClick={onClose}
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
    )
  }

  return (
    <div 
      className="room-settings-modal"
      style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'transparent',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      paddingTop: '80px',
      zIndex: 100000,
        pointerEvents: 'auto'  /* 关键：允许事件 */
    }}
    onClick={(e) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    }}>
      <div style={{
        position: 'relative',
        backgroundColor: 'white',
        borderRadius: '8px',
        minWidth: '420px',
        maxWidth: '500px',
        maxHeight: '80vh',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        cursor: 'default',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100001
      }}
      onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.5rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid #e5e7eb',
          flexShrink: 0
        }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
            房间设置
            {!isOriginalRoom && (
              <span style={{ 
                fontSize: '0.875rem', 
                color: '#6b7280', 
                fontWeight: '400', 
                marginLeft: '0.5rem' 
              }}>
                ({currentRoomType === 'shared' ? '共享空间 - 只读' : '发布展示 - 只读'})
              </span>
            )}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.25rem',
              borderRadius: '4px',
              lineHeight: 1
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#374151'}
            onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
          >
            ×
          </button>
        </div>

        {/* 可滚动内容区域 */}
        <div style={{
          padding: '1.5rem',
          overflowY: 'auto',
          flex: '1 1 auto',
          minHeight: 0
        }}>

        {/* 房间信息（可展开/收起） */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.875rem', color: '#374151', fontWeight: '500' }}>房间信息</div>
              <button
              onClick={() => setShowRoomInfo((v) => !v)}
              style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', background: 'white', cursor: 'pointer', fontSize: '12px', color: '#6b7280' }}
            >
              {showRoomInfo ? '收起' : '展开'}
              </button>
          </div>
          {showRoomInfo && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* 1. 房间名称 */}
              <div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>房间名称</div>
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                  placeholder="输入房间名称"
                />
              </div>

              {/* 2. 房间ID（只读） */}
              <div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>房间ID</div>
                <div style={{ fontFamily: 'monospace', color: '#374151', fontSize: '0.9rem' }}>{roomData?.id}</div>
              </div>

              {/* 3. 房主名称（可编辑） */}
              <div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>房主名称</div>
                <input
                  type="text"
                  value={(roomData as any)?.ownerName || ''}
                  onChange={(e) => setRoomData(prev => prev ? { ...prev, ownerName: e.target.value } as any : prev)}
                  onBlur={async (e) => { try { await roomUtils.updateRoom(roomId, { ownerName: e.target.value } as any) } catch {} }}
                  placeholder="房主名称"
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>

              {/* 4. 房主ID（只读） */}
              <div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>房主ID</div>
                <div style={{ fontFamily: 'monospace', color: '#374151', fontSize: '0.9rem' }}>
                  {(roomData as any)?.ownerId || (roomData as any)?.owner}
                </div>
              </div>

              {/* 5. 简介 */}
              <div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>简介</div>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="请输入简介..."
                  style={{ width: '100%', minHeight: '72px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', resize: 'vertical' }}
                />
              </div>

              {/* 6. 标签 */}
              <div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>标签（用逗号分隔）</div>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="例如：数学, 几何, 演示"
                  style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                />
              </div>

              {/* 7. 创建时间（只读） */}
              <div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>创建时间</div>
                <div style={{ color: '#374151' }}>{roomData?.createdAt ? new Date(roomData.createdAt).toLocaleString() : '-'}</div>
              </div>

              {/* 8. 最后修改（只读） */}
              <div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '4px' }}>最后修改</div>
                <div style={{ color: '#374151' }}>{roomData?.lastModified ? new Date(roomData.lastModified).toLocaleString() : '-'}</div>
              </div>

              {/* 操作按钮 */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button
                  onClick={handleSaveRoomInfo}
                  style={{ padding: '6px 12px', backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                >
                  保存房间信息
              </button>
              <button
                onClick={() => {
                  setNewRoomName(roomData?.name || '')
                    setNewDescription((roomData as any)?.description || '')
                    setNewTags(Array.isArray((roomData as any)?.tags) ? (roomData as any).tags.join(', ') : '')
                  }}
                  style={{ padding: '6px 12px', backgroundColor: '#6b7280', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                >
                  还原
              </button>
            </div>
            </div>
          )}
        </div>

        {/* 原始房间：完整的权限设置区域 */}
        {isOriginalRoom && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '1rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🔐 权限设置
          </div>
          
          {/* 权限选择 - 下拉菜单 */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.5rem', fontWeight: '500' }}>
              访客权限级别
            </div>
            
            {/* 权限下拉菜单 */}
            <select
                 value={tempPermission}
                 onChange={(e) => setTempPermission(e.target.value as SimplePermission)}
              style={{
                width: '100%',
                padding: '0.75rem',
                fontSize: '0.875rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: 'white',
                cursor: 'pointer',
                color: '#374151',
                outline: 'none'
              }}
            >
              {(['editor', 'assist', 'viewer'] as SimplePermission[]).map(level => {
                const info = getPermissionInfo(level)
                return (
                  <option 
                    key={level} 
                    value={level}
                    style={{
                      padding: '0.5rem',
                      fontSize: '0.875rem'
                    }}
                  >
                    {info.icon} {info.name} - {info.description}
                  </option>
                )
              })}
            </select>
            
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                 {tempPermission && getPermissionInfo(tempPermission).description}
            </div>
          </div>
        </div>
        )}

        {/* 原始房间：封面设置（复用 CoverPageSelector 的小地图+缓存逻辑） */}
        {isOriginalRoom && roomData && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#374151', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>🖼️ 房间封面</div>
              <button
                onClick={() => setShowCoverInSettings((v) => !v)}
                style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', background: 'white', cursor: 'pointer', fontSize: '12px', color: '#6b7280' }}
              >
                {showCoverInSettings ? '收起' : '展开'}
              </button>
            </div>
            {showCoverInSettings && (
            <>
            {/* 当前封面独立显示（与画廊缩略图一致） */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '12px',
              padding: '8px',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '6px'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#374151', minWidth: '72px' }}>当前封面</div>
              {(() => {
                const coverPageId = (roomData as any)?.coverPageId as string | undefined
                const currentCoverUrl = (() => {
                  const custom = localStorage.getItem(`gallery-thumbnail-${roomId}`) || localStorage.getItem(`thumbnail-${roomId}`)
                  if (custom) return custom
                  if (coverPageId) {
                    const p = localStorage.getItem(`page-thumbnail-${roomId}-${coverPageId}`) || localStorage.getItem(`gallery-page-thumbnail-${roomId}-${coverPageId}`)
                    if (p) return p
                  }
                  return generateRoomDefaultThumbnail(roomId, roomData?.name || '')
                })()
                return (
                  <img
                    key={String(coverRefreshTick)}
                    src={currentCoverUrl}
                    alt="当前封面"
                    style={{
                      width: '160px',
                      height: '120px',
                      objectFit: 'cover',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb'
                    }}
                  />
                )
              })()}
            </div>
            <CoverPageSelector
              isModal={false}
              room={{
                id: roomData.id,
                name: roomData.name,
                createdAt: roomData.lastModified || Date.now(),
                lastModified: roomData.lastModified || Date.now(),
                owner: roomData.ownerId,
                ownerId: roomData.ownerId,
                ownerName: '',
                isShared: false,
                shared: false,
                permission: roomData.permission,
                publishStatus: 'private',
                publish: false,
                description: '',
                tags: [],
                coverPageId: (roomData as any).coverPageId,
                // 允许上传的自定义封面（新增字段在组件内部会以 localStorage 读取保存）
                customCoverUrl: (roomData as any).customCoverUrl,
              } as unknown as GalleryRoom}
              // 传入实时页列表与当前页，确保“有几页显示几张小地图”且动态更新
              pages={editorPages}
              currentPageId={(() => { try { return editor?.getCurrentPage?.()?.id } catch { return undefined } })()}
              selectedPageId={selectedCoverPageId}
              onSelectCover={async (pageId: string) => {
                try {
                  setSelectedCoverPageId(pageId)
                  await roomUtils.updateRoom(roomId, { coverPageId: pageId })
                  // 清理并刷新缩略图缓存
                  localStorage.removeItem(`thumbnail-${roomId}`)
                  localStorage.removeItem(`room-thumbnail-${roomId}`)
                  localStorage.removeItem(`gallery-thumbnail-${roomId}`)
                  const pageThumbnail = localStorage.getItem(`page-thumbnail-${roomId}-${pageId}`) || localStorage.getItem(`gallery-page-thumbnail-${roomId}-${pageId}`)
                  if (pageThumbnail) {
                    localStorage.setItem(`gallery-thumbnail-${roomId}`, pageThumbnail)
                    localStorage.setItem(`thumbnail-${roomId}`, pageThumbnail)
                  }
                  window.dispatchEvent(new CustomEvent('coverChanged', { detail: { roomId, coverPageId: pageId } }))
                } catch (e) {
                  alert('封面设置失败，请重试')
                }
              }}
              onClose={() => void 0}
            />
            {/* 自定义封面：本地上传图片作为封面 */}
            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = async () => {
                    try {
                      const url = reader.result as string
                      // 保存到房间数据（持久化到本地/云端）
                      await roomUtils.updateRoom(roomId, { coverPageId: '', thumbnail: url } as any)
                      localStorage.setItem(`gallery-thumbnail-${roomId}`, url)
                      localStorage.setItem(`thumbnail-${roomId}`, url)
                      window.dispatchEvent(new CustomEvent('coverChanged', { detail: { roomId, coverPageId: '' } }))
                      alert('自定义封面已设置')
                    } catch {
                      alert('自定义封面设置失败，请重试')
                    }
                  }
                  reader.readAsDataURL(file)
                }}
              />
              <button
                onClick={async () => {
                  try {
                    // 清除封面：恢复为默认缩略图（不依赖页面缩略图）
                    await roomUtils.updateRoom(roomId, { coverPageId: '' } as any)
                    localStorage.removeItem(`gallery-thumbnail-${roomId}`)
                    localStorage.removeItem(`thumbnail-${roomId}`)
                    window.dispatchEvent(new CustomEvent('coverChanged', { detail: { roomId, coverPageId: '' } }))
                  } catch {
                    alert('清除失败，请重试')
                  }
                }}
                style={{ padding: '6px 12px', border: '1px solid #ef4444', background: 'white', color: '#ef4444', borderRadius: '4px', cursor: 'pointer' }}
              >
                清除封面
              </button>
            </div>
            </>
            )}
          </div>
        )}

        {/* 共享/发布房间：只读权限状态显示 */}
        {!isOriginalRoom && permissionConfig && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f0f9ff', borderRadius: '6px', border: '1px solid #0ea5e9' }}>
            <div style={{ fontSize: '0.875rem', color: '#0369a1', marginBottom: '0.75rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📋 当前权限状态 (只读)
            </div>
            
            <div style={{ 
              padding: '0.75rem', 
              backgroundColor: 'white', 
              borderRadius: '4px', 
              border: '1px solid #bae6fd',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ fontSize: '1rem' }}>
                {getPermissionInfo(permissionConfig.permission).icon}
              </span>
              <div>
                <div style={{ fontWeight: '500', color: '#0369a1', fontSize: '0.875rem' }}>
                  {getPermissionInfo(permissionConfig.permission).name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#0284c7', marginTop: '2px' }}>
                  {getPermissionInfo(permissionConfig.permission).description}
                </div>
              </div>
            </div>
            
            <div style={{ fontSize: '0.75rem', color: '#0284c7', marginTop: '0.5rem' }}>
              此房间由原始房间 (/r/) 远程控制，权限设置无法在此处修改
            </div>
          </div>
        )}

        {/* 原始房间：发布选项 */}
        {isOriginalRoom && (
        <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '1rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🚀 发布选项
            </div>
          {/* 发布申请状态显示 */}
          {publishStatus !== 'none' && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              borderRadius: '6px',
              backgroundColor: publishStatus === 'pending' ? '#fef3c7' : 
                             publishStatus === 'approved' ? '#d1fae5' : '#fee2e2',
              color: publishStatus === 'pending' ? '#92400e' : 
                     publishStatus === 'approved' ? '#065f46' : '#991b1b',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}>
              {publishStatus === 'pending' && '📝 发布申请审核中...'}
              {publishStatus === 'approved' && '✅ 发布申请已批准'}
              {publishStatus === 'rejected' && '❌ 发布申请被拒绝'}
            </div>
          )}
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: publishStatus === 'pending' ? 'not-allowed' : 'pointer'
            }}>
              <input
                type="checkbox"
                 checked={tempShared}
                disabled={publishStatus === 'pending'}
                 onChange={(e) => {
                   setTempShared(e.target.checked)
                   // 共享房间到共享空间，路径仍为/r/但支持直播协作
                   if (e.target.checked) {
                     setTempShareMode('live')
                     console.log('共享房间到共享空间：设置为直播协作模式')
                   }
                 }}
                style={{
                  width: '1rem',
                  height: '1rem',
                  opacity: publishStatus === 'pending' ? 0.5 : 1
                }}
              />
              <span style={{ 
                fontSize: '0.875rem', 
                color: publishStatus === 'pending' ? '#9ca3af' : '#374151', 
                fontWeight: '500' 
              }}>
                {publishStatus === 'pending' ? '共享申请审核中' : '共享'}
              </span>
            </label>
            
            {/* 发布设置 - 直接控制发布 */}
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer'
            }}>
              <input
                type="checkbox"
                checked={tempPublish}
                onChange={(e) => {
                  setTempPublish(e.target.checked)
                  console.log('发布状态:', e.target.checked ? '启用' : '禁用')
                }}
                style={{
                  width: '1rem',
                  height: '1rem'
                }}
              />
              <span style={{ 
                fontSize: '0.875rem', 
                color: '#374151', 
                fontWeight: '500' 
              }}>
                发布
              </span>
              {tempPublish && <span style={{ fontSize: '0.75rem', color: '#10b981' }}>● 已发布</span>}
            </label>

                        {/* 发布内容 - 已发布时显示 */}
            {tempPublish && (
              <div style={{
                marginTop: '0.75rem',
                marginLeft: '1.5rem'
              }}>
                {/* 发布链接 */}
                <div style={{
                  marginBottom: '0.75rem',
                  padding: '0.5rem',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #d1fae5',
                  borderRadius: '6px',
                  fontSize: '0.75rem'
                }}>
                  <div style={{ fontWeight: '500', color: '#065f46', marginBottom: '0.25rem' }}>
                    🔗 发布链接
                </div>
                  <div style={{ 
                    color: '#6b7280',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    marginBottom: '0.5rem'
                  }}>
                    {(() => {
                      const storageKey = `publishedSlug_${roomId}`
                      const publishedSlug = localStorage.getItem(storageKey) || roomId
                      return `${window.location.origin}/p/${publishedSlug}`
                    })()}
                  </div>
                </div>

                {/* 操作按钮组 */}
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginBottom: '0.5rem'
                }}>
                  {/* 更新发布按钮 */}
                  <button
                    onClick={async () => {
                      // 等待编辑器就绪，提供多种获取方式
                      let actualEditor = editor || (window as any).globalEditor
                      
                      // 如果仍然没有编辑器，尝试等待一下
                      if (!actualEditor) {
                        console.log('⏳ 编辑器未准备好，等待500ms后重试...')
                        await new Promise(resolve => setTimeout(resolve, 500))
                        actualEditor = editor || (window as any).globalEditor || (window as any).editorRef?.current
                      }
                      
                      if (!actualEditor) {
                        console.warn('⏳ 编辑器还未初始化，请稍后重试...')
                        alert('编辑器正在初始化，请稍后重试')
                        return
                      }

                      try {
                        console.log('📸 开始更新发布内容...')
                        
                        // 获取或创建发布slug
                        const getOrCreatePublishedSlug = (roomId: string): string => {
                          const storageKey = `publishedSlug_${roomId}`
                          let publishedSlug = localStorage.getItem(storageKey)
                          
                          if (!publishedSlug) {
                            // 生成21位短ID
                            publishedSlug = Array.from(crypto.getRandomValues(new Uint8Array(21)), b => 
                              'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]
                            ).join('')
                            localStorage.setItem(storageKey, publishedSlug)
                            console.log(`🆔 为房间 ${roomId} 生成新的发布slug: ${publishedSlug}`)
                          }
                          
                          return publishedSlug
                        }
                        
                        const publishedSlug = getOrCreatePublishedSlug(roomId)
                        
                        // 获取当前快照
                        const snapshot = getSnapshot(actualEditor.store)
                        
                        // 保存发布快照
                        const { snapshotManager } = await import('./SnapshotManager')
                        await snapshotManager.savePublishSnapshot(roomId, publishedSlug, snapshot, {
                          publishedBy: user?.fullName || user?.firstName || 'User',
                          publishedAt: Date.now(),
                          version: Date.now().toString()
                        })
                        
                        // 更新房间的发布状态和最后修改时间
                        await roomUtils.updateRoom(roomId, {
                          publish: true,
                          lastModified: Date.now()
                        })

                        // 确保房间在画廊中显示
                        await roomUtils.setRoomPlaza(roomId, true)
                        
                        alert('✅ 发布内容已更新！')
                        
                        // 重新加载数据以显示最新时间
                        loadRoomData()
                        
                        // 触发事件通知分享面板更新
                        window.dispatchEvent(new CustomEvent('publishLinkUpdated', {
                          detail: { 
                            roomId, 
                            publishedSlug,
                            publishLink: `${window.location.origin}/p/${publishedSlug}`
                          }
                        }))
                        
                      } catch (error) {
                        console.error('❌ 更新发布内容失败:', error)
                        alert('更新发布内容失败: ' + (error as Error).message)
                      }
                    }}
                    style={{
                      padding: '0.4rem 0.6rem',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      flex: 1
                    }}
                  >
                    <span>📸</span>
                    <span>更新发布</span>
                  </button>
                  
                  {/* 复制链接按钮 */}
                  <button
                    onClick={() => {
                      const storageKey = `publishedSlug_${roomId}`
                      const publishedSlug = localStorage.getItem(storageKey) || roomId
                      const publishLink = `${window.location.origin}/p/${publishedSlug}`
                      
                      navigator.clipboard.writeText(publishLink).then(() => {
                        alert('📋 发布链接已复制到剪贴板！')
                      }).catch(err => {
                        console.error('复制失败:', err)
                        alert('复制失败，请手动复制链接')
                      })
                    }}
                    style={{
                      padding: '0.4rem 0.6rem',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      flex: 1
                    }}
                  >
                    <span>📋</span>
                    <span>复制链接</span>
                  </button>
                </div>
                
                {/* 最后更新时间 */}
                  <div style={{
                    fontSize: '0.7rem',
                  color: '#6b7280'
                }}>
                  最后发布: {roomData?.lastModified ? new Date(roomData.lastModified).toLocaleString() : '尚未发布'}
                </div>
                  </div>
                )}


          </div>
          
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '1.5rem' }}>
             共享：其他用户可以通过分享链接访问，支持实时协作
             发布：创建静态展示副本，适合作品发布
                           {(tempShared || tempPublish) && (
              <span style={{ display: 'block', marginTop: '0.25rem' }}>
                  {tempShared && tempPublish ? (
                    <>
                      <div>📡 共享空间：实时协作，访问路径仍为 /r/</div>
                      <div>📸 发布展示：静态展示，/p/ 路径副本</div>
                      <span style={{ display: 'block', marginTop: '0.25rem', color: '#059669' }}>
                        🎯 点击上方"更新发布"按钮同步最新内容到 /p/ 路径
                      </span>
                    </>
                  ) : tempShared ? (
                    '📡 共享空间：实时协作，访问路径仍为 /r/'
                  ) : tempPublish ? (
                    <>
                      <div>📸 发布展示：静态展示，/p/ 路径副本</div>
                      <span style={{ display: 'block', marginTop: '0.25rem', color: '#059669' }}>
                        🎯 点击上方"更新发布"按钮同步最新内容到 /p/ 路径
                      </span>
                    </>
                  ) : null}
              </span>
            )}
          </div>
        </div>
        )}

        {/* 共享/发布房间：只读发布状态显示 */}
        {!isOriginalRoom && permissionConfig && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f0f9ff', borderRadius: '6px', border: '1px solid #0ea5e9' }}>
            <div style={{ fontSize: '0.875rem', color: '#0369a1', marginBottom: '0.75rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📤 发布状态 (只读)
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* 共享空间状态 */}
              <div style={{ 
                padding: '0.75rem', 
                backgroundColor: permissionConfig.shared ? '#ecfdf5' : '#f9fafb', 
                borderRadius: '4px', 
                border: `1px solid ${permissionConfig.shared ? '#d1fae5' : '#e5e7eb'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{ fontSize: '1rem' }}>
                  {permissionConfig.shared ? '📡' : '🏠'}
                </span>
                <div>
                  <div style={{ fontWeight: '500', color: permissionConfig.shared ? '#065f46' : '#374151', fontSize: '0.875rem' }}>
                    {permissionConfig.shared ? '已共享到共享空间' : '私有房间'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: permissionConfig.shared ? '#047857' : '#6b7280', marginTop: '2px' }}>
                    {permissionConfig.shared ? '支持实时协作访问' : '仅房间创建者可访问'}
                  </div>
                </div>
              </div>

              {/* 发布状态 */}
              <div style={{ 
                padding: '0.75rem', 
                backgroundColor: permissionConfig.publish ? '#eff6ff' : '#f9fafb', 
                borderRadius: '4px', 
                border: `1px solid ${permissionConfig.publish ? '#dbeafe' : '#e5e7eb'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{ fontSize: '1rem' }}>
                  {permissionConfig.publish ? '📸' : '🔒'}
                </span>
                <div>
                  <div style={{ fontWeight: '500', color: permissionConfig.publish ? '#1e40af' : '#374151', fontSize: '0.875rem' }}>
                    {permissionConfig.publish ? '已发布' : '未发布'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: permissionConfig.publish ? '#3730a3' : '#6b7280', marginTop: '2px' }}>
                    {permissionConfig.publish ? '静态展示，访问路径 /p/' : '未发布'}
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ fontSize: '0.75rem', color: '#0284c7', marginTop: '0.75rem' }}>
              发布状态由原始房间 (/r/) 控制，无法在此处修改
            </div>
          </div>
        )}

        {/* 当前历史状态显示（只读） */}
        {permissionConfig && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.5rem', fontWeight: '500' }}>
              历史状态
            </div>
            <div style={{
              padding: '0.75rem',
              backgroundColor: permissionConfig.historyLocked ? '#fef3c7' : '#d1fae5',
              color: permissionConfig.historyLocked ? '#92400e' : '#065f46',
              borderRadius: '6px',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>{permissionConfig.historyLocked ? '🔒' : '🔓'}</span>
              <div>
                <div style={{ fontWeight: '500' }}>
                  {permissionConfig.historyLocked ? '历史已锁定' : '历史已解锁'}
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                  {permissionConfig.historyLocked 
                    ? '锁定时刻之前的内容无法编辑' 
                    : '所有内容都可以编辑'
                  }
                </div>
              </div>
            </div>
            
            {permissionConfig.historyLocked && permissionConfig.historyLockTimestamp && (
              <div style={{ 
                marginTop: '0.5rem',
                fontSize: '0.7rem',
                color: '#6b7280',
                fontFamily: 'monospace'
              }}>
                锁定时间: {new Date(permissionConfig.historyLockTimestamp).toLocaleString()}
                {permissionConfig.historyLockedByName && (
                  <span style={{ marginLeft: '1rem' }}>
                    锁定人: {permissionConfig.historyLockedByName}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        </div>

        {/* 底部按钮栏 */}
        <div style={{
          padding: '1.5rem',
          borderTop: '1px solid #e5e7eb',
          flexShrink: 0
        }}>
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            justifyContent: 'flex-end'
          }}>
            <button
              onClick={onClose}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              {isOriginalRoom ? '取消' : '关闭'}
            </button>
            
            {/* 只有原始房间才显示保存按钮 */}
            {isOriginalRoom && (
            <button
              onClick={handleSave}
              disabled={isSaving}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: isSaving ? '#9ca3af' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              {isSaving ? '保存中...' : '保存设置'}
            </button>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}