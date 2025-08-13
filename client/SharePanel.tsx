import React, { useState, useEffect } from 'react'
import { roomUtils } from './roomUtils'
import { getCurrentViewportState } from './viewportUtils'
import { BoardUrlUtils } from './urlUtils'
import { SimplePermissionManager } from './SimplePermissionManager'
import { SimplePermissionDisplay } from './SimplePermissionDisplay'
import { ShareLinkGenerator } from './ShareLinkGenerator'
import { snapshotManager } from './SnapshotManager'
import { useUser } from '@clerk/clerk-react'

interface SharePanelProps {
  isOpen: boolean
  onClose: () => void
  roomId: string
  editor?: any
}

export function SharePanel({ isOpen, onClose, roomId, editor }: SharePanelProps) {
  const { user } = useUser()
  const [showQR, setShowQR] = useState(false)
  // 移除includeViewport选项，默认总是包含视窗
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle')
  // 房间状态和对应的分享模式
  const [roomStatus, setRoomStatus] = useState<'private' | 'shared' | 'published'>('private')
  const [shareMode, setShareMode] = useState<'private' | 'live' | 'snapshot'>('private')

  // 房间权限配置状态
  const [roomConfig, setRoomConfig] = useState<any>(null)
  
  // 链接类型选择状态 ('shared' 表示共享/原始房间链接, 'published' 表示发布链接)
  const [selectedLinkType, setSelectedLinkType] = useState<'shared' | 'published'>('shared')
  
  // 响应式设计检测
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 480)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 加载房间权限配置
  useEffect(() => {
    const loadRoomConfig = async () => {
      if (!isOpen) return
      
      try {
        // 导入SimplePermissionManager来获取权限配置
        const { SimplePermissionManager } = await import('./SimplePermissionManager')
        const config = await SimplePermissionManager.getRoomPermissionConfig(roomId)
        setRoomConfig(config)
        console.log('🔍 SharePanel: 房间配置已加载:', config)
      } catch (error) {
        console.error('❌ SharePanel: 加载房间配置失败:', error)
      }
    }
    
    loadRoomConfig()
  }, [isOpen, roomId])

  // 根据当前URL路径和房间配置确定分享模式
  useEffect(() => {
    const determineShareModeFromURL = () => {
      if (!isOpen || !roomConfig) return
      
      const currentPath = window.location.pathname
      console.log('🔍 当前URL路径:', currentPath)
      console.log('🔍 房间配置:', roomConfig)
      
      // 根据URL路径确定分享模式
      if (currentPath.startsWith('/r/')) {
        // /r/ 路径下，根据房间实际配置确定模式
        if (roomConfig.shared && roomConfig.publish) {
          // 既共享又发布，优先显示发布模式
          setRoomStatus('published')
          setShareMode('snapshot')
          console.log(`📍 共享+发布模式 (/r/)，显示发布模式以便更新`)
        } else if (roomConfig.publish) {
          // 仅发布
          setRoomStatus('published')
          setShareMode('snapshot')
          console.log(`📍 发布模式 (/r/)，显示更新功能`)
        } else if (roomConfig.shared) {
          // 仅共享
          setRoomStatus('shared')
          setShareMode('live')
          console.log(`📍 共享空间模式 (/r/)，支持实时协作`)
        } else {
          // 私有房间
          setRoomStatus('private')
          setShareMode('private')
          console.log('📍 私有房间模式 (/r/)')
        }
      } else if (currentPath.startsWith('/p/')) {
        setRoomStatus('published')
        setShareMode('snapshot')
        console.log('📍 检测到发布展示模式 (/p/)')
      } else {
        // 默认为私有模式
        setRoomStatus('private')
        setShareMode('private')
        console.log('📍 默认私有房间模式')
      }
    }
    
    determineShareModeFromURL()
  }, [isOpen, roomId, roomConfig])
  
  // 监听简化权限变更和分享模式变更，实时更新分享链接
  useEffect(() => {
    const handlePermissionChange = (event: CustomEvent) => {
      const { roomId: changedRoomId } = event.detail
      
      if (changedRoomId === roomId && isOpen) {
        console.log(`🔄 SharePanel: 检测到简化权限变更，重新加载房间配置`)
        // 重新加载房间配置
        setTimeout(async () => {
          try {
            const { SimplePermissionManager } = await import('./SimplePermissionManager')
            const config = await SimplePermissionManager.getRoomPermissionConfig(roomId)
            setRoomConfig(config)
            console.log('🔄 SharePanel: 房间配置已重新加载:', config)
            
            // 重新生成分享链接
            if (syncStatus === 'success') {
              setTimeout(() => {
                generateShareLink()
              }, 100)
            }
          } catch (error) {
            console.error('❌ SharePanel: 重新加载房间配置失败:', error)
          }
        }, 100)
      }
    }

    const handleShareModeChange = (event: CustomEvent) => {
      const { roomId: changedRoomId, mode } = event.detail
      
      if (changedRoomId === roomId && isOpen) {
        console.log(`🔄 SharePanel: 检测到分享模式变更为 ${mode}`)
        setShareMode(mode)
        // 重新生成分享链接
        setTimeout(() => {
          generateShareLink()
        }, 100)
      }
    }

    if (isOpen) {
      window.addEventListener('simplePermissionChanged', handlePermissionChange as EventListener)
      window.addEventListener('shareModeChanged', handleShareModeChange as EventListener)
      
      return () => {
        window.removeEventListener('simplePermissionChanged', handlePermissionChange as EventListener)
        window.removeEventListener('shareModeChanged', handleShareModeChange as EventListener)
      }
    }
  }, [roomId, isOpen, syncStatus])

  // 根据房间配置智能设置默认链接类型
  useEffect(() => {
    if (roomConfig) {
      // 如果房间有发布功能，默认选择发布链接
      // 如果只有共享功能，选择共享链接
      if (roomConfig.publish) {
        setSelectedLinkType('published')
      } else if (roomConfig.shared) {
        setSelectedLinkType('shared')
      }
    }
  }, [roomConfig])

  // 监听链接类型变化，自动重新生成链接
  useEffect(() => {
    if (isOpen && roomConfig) {
      generateShareLink()
    }
  }, [selectedLinkType, isOpen, roomConfig])

  // 监听发布链接更新事件
  useEffect(() => {
    const handlePublishLinkUpdated = (event: CustomEvent) => {
      console.log('📡 收到发布链接更新事件:', event.detail)
      // 如果当前选择的是发布链接，重新生成
      if (selectedLinkType === 'published' && event.detail?.roomId === roomId) {
        generateShareLink()
      }
    }

    window.addEventListener('publishLinkUpdated', handlePublishLinkUpdated as EventListener)
    
    return () => {
      window.removeEventListener('publishLinkUpdated', handlePublishLinkUpdated as EventListener)
    }
  }, [selectedLinkType, roomId])

  // ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        console.log('ESC 键关闭面板')
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // 确保房间已同步到云端数据库
  useEffect(() => {
    const ensureRoomSynced = async () => {
      if (!isOpen) return

      setSyncStatus('syncing')
      setIsSyncing(true)

      try {
        // 获取房间信息
        const room = await roomUtils.getRoom(roomId)
        if (!room) {
          console.error('Room not found:', roomId)
          setSyncStatus('error')
          return
        }

        // 尝试从云端获取房间，如果不存在则同步
        try {
          const { RoomAPI } = await import('./roomAPI')
          const cloudRoom = await RoomAPI.getRoom(roomId)

          if (!cloudRoom) {
            // 房间不存在于云端，需要同步
            console.log('Room not found in cloud, syncing...')
            await RoomAPI.createRoom(room)
            console.log('Room successfully synced to cloud')
          } else {
            console.log('Room already exists in cloud')
          }

          setSyncStatus('success')
        } catch (cloudError) {
          console.warn('Failed to sync room to cloud:', cloudError)
          setSyncStatus('error')
        }
      } catch (error) {
        console.error('Error ensuring room sync:', error)
        setSyncStatus('error')
      } finally {
        setIsSyncing(false)
      }
    }

    ensureRoomSynced()
  }, [isOpen, roomId])

  // 生成分享链接状态
  const [shareLink, setShareLink] = useState<string>('')
  const [isGeneratingLink, setIsGeneratingLink] = useState(false)

  // 生成分享链接 - 根据用户选择的链接类型：
  // shared: /r/{roomId} (共享/原始房间链接)
  // published: /p/{publishedSlug} (发布链接)
  const generateShareLink = () => {
    setIsGeneratingLink(true)
    
    try {
      const baseUrl = window.location.origin
      let shareUrl = ''
      
      if (selectedLinkType === 'published') {
        // 发布链接：使用发布slug
        const publishedSlug = localStorage.getItem(`publishedSlug_${roomId}`)
        if (publishedSlug) {
          shareUrl = `${baseUrl}/p/${publishedSlug}`
        } else {
          // 如果没有发布slug，回退到房间ID
          shareUrl = `${baseUrl}/p/${roomId}`
        }
      } else {
        // 共享链接：使用原始房间ID
        shareUrl = `${baseUrl}/r/${roomId}`
      }
      
      // 检查编辑器状态并添加更详细的调试信息
      console.log('SharePanel: generateShareLink called')
      console.log('SharePanel: editor prop:', editor)
      console.log('SharePanel: editor type:', typeof editor)
      console.log('SharePanel: editor methods available:', editor ? Object.keys(editor) : 'no editor')
      
      if (editor) {
        try {
          // 检查编辑器是否完全初始化
          if (typeof editor.getCurrentPage !== 'function') {
            console.warn('Editor exists but getCurrentPage method not available')
            throw new Error('Editor not fully initialized')
          }
          
          // 获取当前页面
          const currentPage = editor.getCurrentPage()
          console.log('Current page:', currentPage)
          
          if (currentPage && currentPage.id) {
            const pageId = currentPage.id
            shareUrl += `?p=${encodeURIComponent(pageId)}`
            console.log('Added pageId:', pageId)
            
            // 获取视窗信息 - 仅在直播模式下包含
            if (shareMode === 'live') {
              try {
                if (typeof editor.getViewportScreenBounds !== 'function' || typeof editor.getCamera !== 'function') {
                  console.warn('Editor viewport methods not available')
                  throw new Error('Editor viewport methods not available')
                }
                
                const viewport = editor.getViewportScreenBounds()
                const camera = editor.getCamera()
                console.log('Viewport:', viewport, 'Camera:', camera)
                
                if (viewport && camera) {
                  const x = Math.round(camera.x)
                  const y = Math.round(camera.y)
                  const width = Math.round(viewport.w / camera.z)
                  const height = Math.round(viewport.h / camera.z)
                  
                  const viewportStr = `v${x}.${y}.${width}.${height}`
                  shareUrl += `&d=${viewportStr}`
                  console.log('Added viewport:', viewportStr)
                }
              } catch (viewportError) {
                console.warn('Failed to get viewport:', viewportError)
              }
            } else {
              console.log('更新模式不包含视窗参数')
            }
          } else {
            console.warn('No current page found')
          }
        } catch (editorError) {
          console.warn('Failed to get editor state:', editorError)
        }
      } else {
        console.warn('No editor available - editor prop is:', editor)
      }
      
      console.log('Generated share URL:', shareUrl)
      setShareLink(shareUrl)
      setIsGeneratingLink(false)
      
    } catch (error) {
      console.error('Failed to generate share link:', error)
      setShareLink(`${window.location.origin}/r/${roomId}`)
      setIsGeneratingLink(false)
    }
  }

  // 当参数变化时重新生成链接
  useEffect(() => {
    if (isOpen && syncStatus === 'success') {
      // 延迟生成分享链接，等待编辑器初始化，并添加重试机制
      let attempts = 0
      const maxAttempts = 5
      
      const tryGenerateLink = () => {
        attempts++
        console.log(`SharePanel: Attempt ${attempts} to generate share link`)
        console.log(`SharePanel: editor at attempt ${attempts}:`, editor)
        
        if (editor && typeof editor.getCurrentPage === 'function') {
          console.log('SharePanel: Editor ready, generating link')
          generateShareLink()
        } else if (attempts < maxAttempts) {
          console.log(`SharePanel: Editor not ready, retrying in 500ms (attempt ${attempts}/${maxAttempts})`)
          setTimeout(tryGenerateLink, 500)
        } else {
          console.warn('SharePanel: Max attempts reached, generating basic link')
          generateShareLink()
        }
      }
      
      // 开始第一次尝试，延迟500ms
      const timer = setTimeout(tryGenerateLink, 500)
      
      return () => clearTimeout(timer)
    }
  }, [isOpen, syncStatus, editor])

  // 遮罩点击关闭 - 增强版本
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    console.log('遮罩被点击', e.target, e.currentTarget)
    // 确保点击的是遮罩本身，而不是内容区
    if (e.target === e.currentTarget) {
      console.log('点击遮罩，关闭面板')
      onClose()
    }
  }

  // 备用关闭方法
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    console.log('备用关闭方法被触发')
    onClose()
  }

  const copyQRImageToClipboard = async () => {
    try {
      const qrUrl = generateQRCode(shareLink)
      const response = await fetch(qrUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ])
      onClose() // 立即关闭
    } catch (err) {
      try {
        await navigator.clipboard.writeText(shareLink)
        onClose() // 立即关闭
      } catch (linkErr) {
        // 复制失败也直接关闭
        onClose()
      }
    }
  }

  const copyLinkToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      console.log('✅ Share link copied successfully')
      onClose()
    } catch (err) {
      console.error('❌ Error copying link:', err)
      onClose()
    }
  }

  const generateQRCode = (text: string) => {
    // 简单的二维码生成 - 使用在线服务
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`
  }



  const saveQRCodeImage = async () => {
    try {
      const qrUrl = generateQRCode(shareLink)
      const response = await fetch(qrUrl)
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = `qr-code-${roomId}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
      onClose() // 立即关闭
    } catch (error) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="share-panel-modal"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.0)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          width: '520px',
          maxWidth: '92vw',
          maxHeight: '80vh',
          overflow: 'auto',
          zIndex: 100001,
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: isMobile ? '1rem' : '1.5rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid #e5e7eb',
          flexShrink: 0
        }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>分享房间</h3>
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
          padding: isMobile ? '1rem' : '1.5rem',
          overflowY: 'auto',
          flex: '1 1 auto',
          minHeight: 0
        }}>

        {/* 同步状态 */}
        {syncStatus === 'syncing' && (
          <div style={{
            backgroundColor: '#fef3c7',
            color: '#92400e',
            padding: '0.75rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span>🔄</span>
            正在同步房间到云端...
          </div>
        )}

        {syncStatus === 'error' && (
          <div style={{
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            padding: '0.75rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span>⚠️</span>
            同步失败，分享链接可能无法正常工作
          </div>
        )}

        {/* 权限状态显示 */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.5rem', fontWeight: '500' }}>
            当前房间权限
          </div>
          <SimplePermissionDisplay roomId={roomId} showDetails={true} />
        </div>

        {/* 当前分享模式状态显示 */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '0.75rem', fontWeight: '500' }}>
            当前房间版本
          </div>
          
          {/* 模式状态显示 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.75rem',
            backgroundColor: shareMode === 'private' ? '#f9fafb' : shareMode === 'live' ? '#ecfdf5' : '#eff6ff',
            border: `1px solid ${shareMode === 'private' ? '#e5e7eb' : shareMode === 'live' ? '#d1fae5' : '#dbeafe'}`,
            borderRadius: '6px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flex: 1
            }}>
              <span style={{ fontSize: '1.25rem' }}>
                {shareMode === 'private' ? '🏠' : shareMode === 'live' ? '📡' : '📸'}
              </span>
              <div>
                <div style={{ 
                  fontWeight: '500', 
                  color: shareMode === 'private' ? '#374151' : shareMode === 'live' ? '#065f46' : '#1e40af',
                  fontSize: '0.875rem'
                }}>
                  {shareMode === 'private' ? '我的房间' : shareMode === 'live' ? '共享空间' : '发布展示'}
                  {roomConfig && roomConfig.shared && roomConfig.publish && shareMode === 'snapshot' && (
                    <span style={{ fontSize: '0.75rem', color: '#059669', marginLeft: '0.5rem' }}>
                      (共享+发布)
                    </span>
                  )}
                </div>
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: shareMode === 'private' ? '#6b7280' : shareMode === 'live' ? '#047857' : '#3730a3',
                  marginTop: '2px'
                }}>
                  {shareMode === 'private' ? '私有编辑' : shareMode === 'live' ? '实时协作' : '静态展示'}
                </div>
              </div>
            </div>
          </div>
          
          {/* 链接类型选择器 - 只在有共享或发布功能时显示 */}
          {(roomConfig && (roomConfig.shared || roomConfig.publish)) && (
            <div style={{ marginTop: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                选择链接类型：
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {/* 共享链接选项 */}
                {roomConfig.shared && (
                  <button
                    onClick={() => setSelectedLinkType('shared')}
                    style={{
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      border: `1px solid ${selectedLinkType === 'shared' ? '#3b82f6' : '#d1d5db'}`,
                      backgroundColor: selectedLinkType === 'shared' ? '#3b82f6' : 'white',
                      color: selectedLinkType === 'shared' ? 'white' : '#374151',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    <span>📡</span>
                    <span>共享链接</span>
                  </button>
                )}
                
                {/* 发布链接选项 */}
                {roomConfig.publish && (
                  <button
                    onClick={() => setSelectedLinkType('published')}
                    style={{
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.75rem',
                      fontWeight: '500',
                      border: `1px solid ${selectedLinkType === 'published' ? '#10b981' : '#d1d5db'}`,
                      backgroundColor: selectedLinkType === 'published' ? '#10b981' : 'white',
                      color: selectedLinkType === 'published' ? 'white' : '#374151',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    <span>📸</span>
                    <span>发布链接</span>
                  </button>
                )}
              </div>
              
              {/* 链接类型说明 */}
              <div style={{
                fontSize: '0.675rem',
                color: '#9ca3af',
                marginTop: '0.5rem',
                lineHeight: '1.3'
              }}>
                {selectedLinkType === 'shared' ? (
                  '📡 共享链接：访问者可以实时协作编辑，链接为 /r/ 路径'
                ) : (
                  '📸 发布链接：访问者看到静态展示版本，链接为 /p/ 路径'
                )}
              </div>
            </div>
          )}
          
          {/* 模式说明 */}
          <div style={{
            fontSize: '0.75rem',
            color: '#6b7280',
            marginTop: '0.5rem',
            lineHeight: '1.4'
          }}>
            {shareMode === 'private' ? (
              '这是您的私有房间，只有您可以编辑和访问'
            ) : shareMode === 'live' ? (
              '这是共享空间模式，访问者可以通过相同链接进行实时协作'
            ) : roomConfig && roomConfig.shared && roomConfig.publish ? (
              '房间同时启用了共享和发布模式，/r/ 路径支持协作，/p/ 路径显示静态展示'
            ) : (
              '这是发布展示版本，/p/ 路径显示静态快照内容'
            )}
          </div>
          
          <div style={{
            fontSize: '0.75rem',
            color: '#9ca3af',
            marginTop: '0.25rem'
          }}>
            {shareMode === 'private' ? (
              '通过房间设置可以发布到共享空间或发布白板'
            ) : shareMode === 'live' ? (
              '共享空间与私有房间使用相同的 /r/ 路径，但支持协作'
            ) : roomConfig && roomConfig.publish ? (
              <>
                <span style={{ color: '#059669' }}>✅ 房间已发布</span>
                <br />
                <span>点击"Publish changes"可同步最新内容到 /p/ 路径的静态副本</span>
              </>
            ) : (
              '发布版本创建 /p/ 路径静态副本，通过"Publish changes"同步最新内容'
            )}
          </div>
        </div>
        
        {/* 分享设置说明 */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            fontSize: '0.875rem',
            color: '#10b981',
            padding: '0.75rem',
            backgroundColor: '#ecfdf5',
            borderRadius: '6px',
            border: '1px solid #d1fae5',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span>📍</span>
            <span>分享链接将自动包含当前视窗位置和缩放级别</span>
          </div>
        </div>

        {/* 分享方式切换 */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <button
              onClick={() => setShowQR(false)}
              style={{
                flex: 1,
                backgroundColor: !showQR ? '#3b82f6' : '#f3f4f6',
                color: !showQR ? 'white' : '#6b7280',
                border: 'none',
                padding: '0.5rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              链接
            </button>
            <button
              onClick={() => setShowQR(true)}
              style={{
                flex: 1,
                backgroundColor: showQR ? '#3b82f6' : '#f3f4f6',
                color: showQR ? 'white' : '#6b7280',
                border: 'none',
                padding: '0.5rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              二维码
            </button>
          </div>

          {/* 内容区域 */}
          {showQR ? (
            <div style={{ textAlign: 'center' }}>
              {isGeneratingLink || !shareLink ? (
                <div style={{
                  width: '180px',
                  height: '180px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  marginBottom: '1rem',
                  backgroundColor: '#f9fafb',
                  color: '#9ca3af',
                  fontSize: '0.875rem'
                }}>
                  正在生成二维码...
                </div>
              ) : (
                <img
                  src={generateQRCode(shareLink)}
                  alt="QR Code"
                  style={{ 
                    maxWidth: '180px', 
                    height: 'auto', 
                    marginBottom: '1rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px'
                  }}
                />
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={copyQRImageToClipboard}
                  disabled={syncStatus !== 'success' || isGeneratingLink || !shareLink}
                  style={{
                    flex: 1,
                    backgroundColor: syncStatus === 'success' ? '#10b981' : '#9ca3af',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.5rem',
                    fontSize: '0.875rem',
                    cursor: syncStatus === 'success' ? 'pointer' : 'not-allowed',
                    fontWeight: '500'
                  }}
                >
                  复制图片
                </button>
                <button
                  onClick={saveQRCodeImage}
                  disabled={syncStatus !== 'success' || isGeneratingLink || !shareLink}
                  style={{
                    flex: 1,
                    backgroundColor: syncStatus === 'success' ? '#3b82f6' : '#9ca3af',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '0.5rem',
                    fontSize: '0.875rem',
                    cursor: syncStatus === 'success' ? 'pointer' : 'not-allowed',
                    fontWeight: '500'
                  }}
                >
                  保存图片
                </button>
              </div>
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={isGeneratingLink ? '正在生成永久分享链接...' : shareLink}
                readOnly
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  backgroundColor: '#f9fafb',
                  color: isGeneratingLink ? '#9ca3af' : '#374151',
                  marginBottom: '1rem',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={copyLinkToClipboard}
                  disabled={syncStatus !== 'success' || isGeneratingLink || !shareLink}
                  style={{
                    flex: 1,
                    backgroundColor: syncStatus === 'success' ? '#10b981' : '#9ca3af',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    cursor: syncStatus === 'success' ? 'pointer' : 'not-allowed',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
                >
                  {syncStatus === 'syncing' ? '同步中...' : '复制链接'}
                </button>
                <button
                  onClick={() => {
                    console.log('Manual regenerate button clicked')
                    generateShareLink()
                  }}
                  disabled={syncStatus !== 'success' || isGeneratingLink}
                  style={{
                    backgroundColor: syncStatus === 'success' ? '#3b82f6' : '#9ca3af',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem',
                    borderRadius: '6px',
                    cursor: syncStatus === 'success' ? 'pointer' : 'not-allowed',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    minWidth: '80px'
                  }}
                  title="重新生成链接"
                >
                  🔄
                </button>
              </div>
            </div>
          )}
        </div>
        
        </div> {/* 结束可滚动内容区域 */}
      </div>
    </div>
  )
}