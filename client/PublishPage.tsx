import React, { useEffect, useState, useMemo } from 'react'
import { Tldraw, createTLStore, defaultShapeUtils, defaultBindingUtils, loadSnapshot, useSync } from 'tldraw'
import { RoomManager } from './RoomManager'
import { UserRoom } from './UserRoom'
import { snapshotManager } from './SnapshotManager'
import { parseRoute } from './routingUtils'
import { CustomShareZone } from './CustomShareZone'
import { multiplayerAssetStore } from './multiplayerAssetStore'

// 发布页面的协作者显示组件 - 通过WebSocket连接到源房间
function PublishCollaboratorsDisplay({ sourceRoomId }: { sourceRoomId: string }) {
  const [collaborators, setCollaborators] = useState<any[]>([])
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!sourceRoomId) return
    // 仅当显式启用时才连接WS，避免本地代理未配置导致400
    const enableWs = localStorage.getItem('publishPage_enable_ws') === '1'
    if (!enableWs) return

    // 创建WebSocket连接到源房间以获取协作者信息
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/api/connect/${sourceRoomId}`
    
    console.log('🔗 发布页面连接到源房间协作服务:', wsUrl)
    
    let ws: WebSocket | null = null
    try {
      ws = new WebSocket(wsUrl)
    } catch (err) {
      console.warn('发布页WS初始化失败，跳过协作显示:', err)
      return
    }
    
    ws.onopen = () => {
      console.log('✅ 发布页面WebSocket连接成功')
      setIsConnected(true)
    }
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        // 监听presence更新消息
        if (message.type === 'presence' && message.collaborators) {
          setCollaborators(message.collaborators)
          console.log('👥 更新协作者列表:', message.collaborators.length, '人在线')
        }
      } catch (error) {
        console.warn('⚠️ 解析WebSocket消息失败:', error)
      }
    }
    
    ws.onclose = () => {
      console.log('🔌 发布页面WebSocket连接关闭')
      setIsConnected(false)
      setCollaborators([])
    }
    
    ws.onerror = (error) => {
      console.error('❌ 发布页面WebSocket连接错误:', error)
      setIsConnected(false)
    }
    
    return () => { try { ws && ws.close() } catch {} }
  }, [sourceRoomId])

  if (collaborators.length === 0) {
    return null
  }

  // 显示最多3个头像，其余用数字表示
  const visibleCollaborators = collaborators.slice(0, 3)
  const remainingCount = Math.max(0, collaborators.length - 3)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 10px',
      background: 'white',
      border: '1px solid #e1e5e9',
      borderRadius: '20px',
      boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)',
      userSelect: 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {visibleCollaborators.map((collaborator, index) => (
          <div
            key={collaborator.userId || index}
            style={{ 
              backgroundColor: collaborator.color || '#64748b',
              zIndex: 3 - index,
              marginLeft: index > 0 ? '-8px' : '0',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontWeight: '600',
              fontSize: '10px',
              border: '2px solid white',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
              position: 'relative',
            }}
            title={collaborator.userName || '协作者'}
          >
            {(collaborator.userName || 'U').charAt(0).toUpperCase()}
          </div>
        ))}
        
        {remainingCount > 0 && (
          <div style={{ 
            backgroundColor: '#64748b',
            marginLeft: '-8px',
            zIndex: 0,
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: '600',
            fontSize: '8px',
            border: '2px solid white',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
          }}>
            +{remainingCount}
          </div>
        )}
      </div>
      
      <div style={{
        fontSize: '12px',
        fontWeight: '600',
        color: '#64748b',
        minWidth: '16px',
        textAlign: 'center'
      }}>
        {collaborators.length}
      </div>
      
      {!isConnected && (
        <div style={{
          fontSize: '10px',
          color: '#ef4444',
          marginLeft: '4px'
        }}>
          ●
        </div>
      )}
    </div>
  )
}

export function PublishPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [publishedSlug, setPublishedSlug] = useState<string>('')
  const [sourceRoomId, setSourceRoomId] = useState<string>('')
  const [showRoomManager, setShowRoomManager] = useState(false)
  const [showUserGallery, setShowUserGallery] = useState(false)
  const [userGalleryTargetUserId, setUserGalleryTargetUserId] = useState<string | null>(null)

  
  // 解析当前URL获取发布slug
  useEffect(() => {
    const path = window.location.pathname
    const slug = path.replace('/p/', '')
    setPublishedSlug(slug)
  }, [])

  // 为发布页面创建协作store，使用源房间ID进行连接
  const getWebSocketUri = (roomId: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    return `${protocol}//${host}/api/connect/${roomId}`
  }

  // 创建本地store用于显示快照
  const store = useMemo(() => {
    return createTLStore({
      shapeUtils: defaultShapeUtils,
      bindingUtils: defaultBindingUtils,
    })
  }, [])

  // 在发布页也暴露 showUserGallery，供 RoomManager 顶部用户名按钮调用
  useEffect(() => {
    ;(window as any).showUserGallery = (targetUserId?: string) => {
      setUserGalleryTargetUserId(targetUserId || null)
      setShowUserGallery(true)
    }
    return () => { delete (window as any).showUserGallery }
  }, [])

  // 加载发布快照
  useEffect(() => {
    if (!publishedSlug) return

    const loadPublishSnapshot = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        console.log('📖 加载发布页面快照:', publishedSlug)
        
        // 从SnapshotManager加载发布快照
        const snapshotData = await snapshotManager.loadPublishSnapshot(publishedSlug)
        
        if (snapshotData) {
          // 加载快照到store - 使用data部分
          loadSnapshot(store, snapshotData.data)
          console.log('✅ 发布快照加载成功')
          console.log('📊 快照数据结构:', snapshotData)
          
          // 获取源房间ID - 从完整的PublishSnapshot对象中获取
          if (snapshotData.roomId) {
            setSourceRoomId(snapshotData.roomId)
            console.log('🔍 设置源房间ID:', snapshotData.roomId)
          } else {
            console.warn('⚠️ 快照数据中未找到房间ID，数据结构:', Object.keys(snapshotData))
          }
        } else {
          console.warn('⚠️ 未找到发布快照')
          setError('发布内容未找到')
        }
      } catch (error) {
        console.error('❌ 加载发布快照失败:', error)
        setError('加载发布内容失败')
      } finally {
        setIsLoading(false)
      }
    }

    loadPublishSnapshot()
  }, [publishedSlug, store])

  // 处理编辑器挂载
  const handleMount = (editor: any) => {
    // 设置为只读模式
    editor.updateInstanceState({ isReadonly: true })
    
    // 添加发布模式标识
    const titleElement = document.querySelector('title')
    if (titleElement) {
      titleElement.textContent = `发布作品 - ${publishedSlug}`
    }
    
    console.log('📱 发布编辑器已挂载 (只读模式)')
  }

  if (isLoading) {
    return (
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        color: '#6b7280'
      }}>
        <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>📖</div>
        <div>正在加载发布内容...</div>
        <div style={{ fontSize: '0.875rem', marginTop: '10px' }}>
          发布ID: {publishedSlug}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        color: '#ef4444'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '20px' }}>😢</div>
        <div style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
          {error}
        </div>
        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '20px' }}>
          发布ID: {publishedSlug}
        </div>
        <button
          onClick={() => window.history.back()}
          style={{
            padding: '8px 16px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          返回
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {/* 我的画廊弹窗（与 /r 一致） */}
      {showUserGallery && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 3000,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            width: '90%', maxWidth: '1200px', height: '80%',
            backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <UserRoom
              currentUserId={undefined}
              targetUserId={userGalleryTargetUserId || undefined}
              onRoomChange={(roomId: string) => {
                const slug = localStorage.getItem(`publishedSlug_${roomId}`)
                if (slug) {
                  window.open(`/p/${slug}`, '_blank')
                } else {
                  window.open(`/r/${roomId}`, '_blank')
                }
              }}
              onClose={() => { setShowUserGallery(false); setUserGalleryTargetUserId(null) }}
              onShowUserGallery={(tid: string) => { setUserGalleryTargetUserId(tid); setShowUserGallery(true) }}
            />
          </div>
        </div>
      )}
      {/* 画廊弹窗（与 /r 保持一致样式） */}
      {showRoomManager && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 2500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '90%',
            maxWidth: '1200px',
            height: '80%',
            backgroundColor: 'white',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <RoomManager
              currentRoomId={sourceRoomId}
              onRoomChange={(roomId: string) => {
                const slug = localStorage.getItem(`publishedSlug_${roomId}`)
                if (slug) {
                  window.open(`/p/${slug}`, '_blank')
                } else {
                  window.open(`/r/${roomId}`, '_blank')
                }
                setShowRoomManager(false)
              }}
              onRoomCreate={() => {}}
              onClose={() => setShowRoomManager(false)}
            />
          </div>
        </div>
      )}
      <Tldraw
        store={store}
        onMount={handleMount}
        components={{
          HelpMenu: null, // 隐藏帮助菜单
          DebugMenu: null, // 隐藏调试菜单
          MainMenu: null, // 移除左上角主菜单
          InFrontOfTheCanvas: () => (
            <>
              {/* 协作者菜单 - 显示源房间的协作者 */}
              {sourceRoomId && (
                <div style={{
                  position: 'fixed',
                  top: '16px',
                  right: '150px', // 避免与发布版按钮重叠
                  zIndex: 1000
                }}>
                  <PublishCollaboratorsDisplay sourceRoomId={sourceRoomId} />
                </div>
              )}
            </>
          )
        }}
      />
      
      {/* 右上角发布版按钮 - 点击跳转源房间 */}
      <button
        onClick={() => {
          console.log('🖱️ 发布版按钮被点击, sourceRoomId:', sourceRoomId)
          if (sourceRoomId) {
            console.log('🔗 正在跳转到源房间:', `/r/${sourceRoomId}`)
            window.open(`/r/${sourceRoomId}`, '_blank')
          } else {
            console.warn('⚠️ 源房间ID未加载，无法跳转')
          }
        }}
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          background: 'rgba(16, 185, 129, 0.9)',
          color: 'white',
          padding: '6px 12px',
          borderRadius: '20px',
          fontSize: '0.75rem',
          fontWeight: '600',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
          zIndex: 10000, // 提高z-index确保在最上层
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          border: 'none',
          cursor: sourceRoomId ? 'pointer' : 'default',
          transition: 'all 0.2s ease',
          opacity: sourceRoomId ? 1 : 0.7,
          pointerEvents: 'auto' // 确保能接收点击事件
        }}
        onMouseEnter={(e) => {
          if (sourceRoomId) {
            e.currentTarget.style.background = 'rgba(16, 185, 129, 1)'
            e.currentTarget.style.transform = 'scale(1.05)'
          }
        }}
        onMouseLeave={(e) => {
          if (sourceRoomId) {
            e.currentTarget.style.background = 'rgba(16, 185, 129, 0.9)'
            e.currentTarget.style.transform = 'scale(1)'
          }
        }}
        title={sourceRoomId ? `点击进入源房间: ${sourceRoomId}` : '加载中...'}
        disabled={!sourceRoomId}
      >
        <span>📖</span>
        <span>发布版</span>
      </button>

      {/* 画廊按钮：与 /r 一致，打开 RoomManager 覆盖层。左键打开画廊；右键/长按打开“我的画廊”。*/}
      <button
        onClick={() => setShowRoomManager(true)}
        onContextMenu={(e) => { e.preventDefault();
          try {
            // 检测登录状态（Clerk）
            const userJson = localStorage.getItem('clerk-user') || localStorage.getItem('__clerk_client_user')
            if (!userJson) {
              // 触发登录弹窗（沿用 App.tsx 隐藏 SignInButton 的方式）；若不可用，回到首页再触发
              const tryOpen = () => {
                const btn = document.getElementById('hidden-signin-button') as HTMLElement | null
                if (btn) btn.click()
              }
              // 先尝试本页已有隐藏按钮（若来自 App 挂载）
              tryOpen()
              // 再兜底：延迟重试一次；仍无则跳转首页
              setTimeout(() => {
                const btn = document.getElementById('hidden-signin-button') as HTMLElement | null
                if (btn) btn.click(); else window.location.href = '/'
              }, 50)
              return
            }
            // 已登录则打开“我的画廊”
            (window as any).showUserGallery?.()
          } catch {
            (window as any).showUserGallery?.()
          }
        }}
        style={{
          position: 'absolute',
          top: '16px',
          right: '100px',
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '9999px',
          padding: '6px 10px',
          fontSize: '0.875rem',
          cursor: 'pointer',
          zIndex: 10000
        }}
        title="画廊"
      >
        🎨 画廊
      </button>
      

    </div>
  )
}