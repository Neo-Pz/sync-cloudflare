import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useUser } from '@clerk/clerk-react'
import { Room } from './RoomManager'
import { roomUtils } from './roomUtils'
// 封面设置已迁移到 RoomSettings，这里不再需要小地图与封面选择
// 只读展示时不需要使用 editor，上层在画廊中渲染会导致 useEditor 报错
import { TLPageId } from 'tldraw'
import { SimplePermissionManager } from './SimplePermissionManager'

interface RoomInfoProps {
  room: Room
  onClose: () => void
  onRoomUpdate?: (updatedRoom: Room) => void
}

export function RoomInfo({ room, onClose, onRoomUpdate }: RoomInfoProps) {
  const { user } = useUser()
  const editor = null as any
  
  // 读取房间真实状态
  const [roomPermissionConfig, setRoomPermissionConfig] = useState<any>(null)
  
  useEffect(() => {
    const loadRoomPermissionConfig = async () => {
      try {
        const config = await SimplePermissionManager.getRoomPermissionConfig(room.id)
        setRoomPermissionConfig(config)
      } catch (error) {
        console.error('Error loading room permission config:', error)
      }
    }
    
    loadRoomPermissionConfig()
  }, [room.id])
  
  // 仅用于调试挂载/卸载；不再修改 body 样式，避免打开时页面跳动
  useEffect(() => {
    return () => {}
  }, [])
  
  const [editingRoom, setEditingRoom] = useState<Room>({ ...room })
  const [isEditing, setIsEditing] = useState(false)
  
  // 封面设置已迁移到 RoomSettings
  
  // 发布设置面板展开状态，使用 ref 来持久化状态
  const showPublishSettingsRef = useRef(false)
  const [showPublishSettings, setShowPublishSettings] = useState(false)
  
  // 更新展开状态的函数，同时更新 ref 和 state
  const updateShowPublishSettings = (value: boolean) => {
    showPublishSettingsRef.current = value
    setShowPublishSettings(value)
  }
  // const [pages, setPages] = useState<Array<{ id: TLPageId; name: string }>>([])
  // const [selectedPageId, setSelectedPageId] = useState<string>(room.coverPageId || '')
  // const [previewThumbnails, setPreviewThumbnails] = useState<Record<string, string>>({})
  // const [isLoadingThumbnails, setIsLoadingThumbnails] = useState(false)

  // 检查用户是否是房主或房主未知
  // 开发阶段临时方案：所有用户都视为房主，可以编辑任何房间
  // TODO: 后续调整为仅房主和管理员可编辑
  // const isOwner = user?.id === room.ownerId || !room.ownerId || room.ownerId === 'anonymous' || room.ownerName === 'System'
  const isOwner = true // 开发阶段临时方案，允许所有人编辑
  
  // 获取当前用户权限
  const getCurrentUserPermission = () => {
    // 检查URL路径来判断访问权限
    const currentPath = window.location.pathname
    const isReadOnlyAccess = currentPath.includes('/ro/')
    
    // 开发阶段临时方案：所有用户都有编辑权限，除非通过只读链接访问
    // TODO: 后续调整为根据用户角色和房间设置确定权限
    if (isReadOnlyAccess) {
      return 'viewer' // 通过只读链接访问
    } else {
      // 如果房间设置了assist权限，返回assist，否则返回editor
      return room.permission || 'editor' // 使用房间设置的权限，默认为编辑
    }
    
    /* 正式权限逻辑（后续启用）
    if (isOwner) {
      return 'owner' // 房主拥有所有权限
    } else if (isReadOnlyAccess) {
      return 'viewer' // 通过只读链接访问
    } else {
      return room.permission || 'viewer' // 使用房间设置的权限
    }
    */
  }

  const currentPermission = getCurrentUserPermission()

  // 初始化编辑状态，并恢复展开状态
  useEffect(() => {
    setEditingRoom({ ...room })
    // 恢复发布设置的展开状态
    setShowPublishSettings(showPublishSettingsRef.current)
    // 注意：showCoverSection 可以保持当前状态
  }, [room])

  // 封面设置逻辑已移除

  // 封面缩略图生成逻辑已移除

  // 预览缩略图生成逻辑已移除

  const handleSave = async () => {
    // 更新房间信息
    const updatedRoom = {
      ...editingRoom,
      coverPageId: selectedPageId,
      lastModified: Date.now()
    }

    try {
      // 使用 roomUtils 更新房间
      await roomUtils.updateRoom(room.id, updatedRoom)

      // 通知父组件
      if (onRoomUpdate) {
        onRoomUpdate(updatedRoom)
      }

      setIsEditing(false)
      // 不自动关闭面板，让用户手动控制
      // onClose()
    } catch (error) {
      console.error('Error saving room:', error)
      alert('保存房间信息失败')
    }
  }

  // 封面更新逻辑已移除

  const handleCancel = () => {
    setEditingRoom({ ...room })
    setSelectedPageId(room.coverPageId || '')
    setIsEditing(false)
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN')
  }

  return (
    <div 
      style={{ 
        position: 'fixed', 
        top: 0, left: 0, right: 0, bottom: 0, 
        zIndex: 99999, // 增加z-index确保在最上层
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto'
      }} 
      onWheel={(e) => {
        e.stopPropagation()
        // 不调用 e.preventDefault()，让子元素可以正常滚动
      }}
      onMouseMove={(e) => {
        // 只阻止事件冒泡，不阻止默认行为
        e.stopPropagation()
      }}
      onMouseDown={(e) => {
        // 只在点击背景区域时阻止默认行为
        if (e.target === e.currentTarget) {
          e.stopPropagation()
          e.preventDefault()
        }
      }}
      onMouseUp={(e) => {
        // 只在点击背景区域时阻止默认行为
        if (e.target === e.currentTarget) {
          e.stopPropagation()
          e.preventDefault()
        }
      }}
      onTouchStart={(e) => {
        // 只阻止事件冒泡，不阻止默认行为
        e.stopPropagation()
      }}
      onTouchMove={(e) => {
        // 只阻止事件冒泡，不阻止默认行为
        e.stopPropagation()
      }}
      onTouchEnd={(e) => {
        // 只阻止事件冒泡，不阻止默认行为
        e.stopPropagation()
      }}
      onPointerDown={(e) => {
        // 只阻止事件冒泡，不阻止默认行为
        e.stopPropagation()
      }}
      onPointerMove={(e) => {
        // 只阻止事件冒泡，不阻止默认行为
        e.stopPropagation()
      }}
      onPointerUp={(e) => {
        // 只阻止事件冒泡，不阻止默认行为
        e.stopPropagation()
      }}
      onScroll={(e) => {
        // 只阻止事件冒泡，不阻止默认行为
        e.stopPropagation()
      }}
      onClick={(e) => {
        // 只有点击背景层时才关闭面板
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <style>{`
        .room-info-modal * {
          pointer-events: auto !important;
        }
        .room-info-modal {
          z-index: 1000;
          pointer-events: auto !important;
        }
        .room-info-modal .scroll-container {
          pointer-events: auto !important;
          overflow: auto;
          overflow-y: scroll;
          scroll-behavior: smooth;
        }
        .room-info-modal ::-webkit-scrollbar {
          width: 8px;
        }
        .room-info-modal ::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
          margin: 2px;
        }
        .room-info-modal ::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 4px;
          border: 1px solid #f1f1f1;
        }
        .room-info-modal ::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }
        .room-info-modal ::-webkit-scrollbar-thumb:active {
          background: #888;
        }
        
        /* 阻止背景画布事件 */
        body.modal-open {
          overflow: hidden !important;
          position: fixed !important;
          width: 100% !important;
          height: 100% !important;
        }
        body.modal-open * {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
        }
        /* 恢复房间信息面板内所有元素的交互能力 */
        .room-info-modal * {
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          user-select: text !important;
          pointer-events: auto !important;
        }
        .room-info-modal input,
        .room-info-modal button,
        .room-info-modal select,
        .room-info-modal textarea,
        .room-info-modal label {
          pointer-events: auto !important;    /* 关键：允许事件 */
          cursor: pointer !important;
          position: relative !important;
          z-index: 10001 !important;
        }
        /* 确保所有交互区域都能响应事件 */
        .room-info-modal div[onClick],
        .room-info-modal div[onMouseDown],
        .room-info-modal div[style*="cursor: pointer"] {
          pointer-events: auto !important;    /* 关键：允许事件 */
        }
        .room-info-modal select {
          -webkit-user-select: auto !important;
          -moz-user-select: auto !important;
          -ms-user-select: auto !important;
          user-select: auto !important;
          pointer-events: auto !important;
          position: relative !important;
          z-index: 1001 !important;
        }
        .room-info-modal select option {
          pointer-events: auto !important;
          -webkit-user-select: auto !important;
          -moz-user-select: auto !important;
          -ms-user-select: auto !important;
          user-select: auto !important;
          background-color: white !important;
          color: black !important;
        }
        /* 确保select的下拉箭头可以点击 */
        .room-info-modal select::-ms-expand {
          display: block !important;
        }
        
        /* 彻底阻止tldraw画布滚动 */
        body.modal-open .tl-container,
        body.modal-open .tl-canvas,
        body.modal-open .tl-svg-container,
        body.modal-open [data-testid="canvas"] {
          overflow: hidden !important;
          pointer-events: none !important;
        }
      `}</style>
      <div 
        className="room-info-modal"
        style={{
          background: 'white', 
          borderRadius: '12px', 
          maxWidth: '600px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
          pointerEvents: 'auto'
        }} 
        onClick={e => {
          // 允许事件正常传播，不阻止
        }}
        onWheel={(e) => {
          e.stopPropagation()
        }}
        onMouseDown={(e) => {
          // 允许正常的鼠标交互
        }}
        onMouseMove={(e) => {
          e.stopPropagation()
        }}
      >
        {/* 固定标题栏 */}
        <div style={{ 
          padding: '24px 32px 16px 32px', 
          borderBottom: '1px solid #eee',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0
        }}>
          <div style={{ fontWeight: '700', fontSize: '22px' }}>房间信息</div>
          <button 
            style={{ 
              background: 'none', 
              border: 'none', 
              fontSize: '20px', 
              cursor: 'pointer',
              color: '#666'
            }} 
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* 可滚动内容区域 */}
        <div 
          className="scroll-container"
          style={{
            flex: 1,
            padding: '24px 32px 32px 32px',
            maxHeight: '70vh',
            pointerEvents: 'auto'
          }}
          onWheel={(e) => {
            // 允许正常滚动，不拦截
            e.stopPropagation()
          }}
          onMouseDown={(e) => {
            // 允许正常的鼠标交互
          }}
          onClick={(e) => {
            // 允许正常的点击事件
          }}
          onMouseMove={(e) => {
            // 允许正常的鼠标移动
          }}
        >
          {/* 房间基本信息 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '15px' }}>
            {/* 房间名称 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: '600', fontSize: '14px', color: '#666', minWidth: '80px' }}>房间名称：</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editingRoom.name}
                  onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                />
              ) : (
                <span style={{ fontWeight: '500' }}>{room.name}</span>
              )}
            </div>

            {/* 房间ID */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: '600', fontSize: '14px', color: '#666', minWidth: '80px' }}>房间ID：</span>
              <span style={{ color: '#888', fontSize: '13px' }}>{room.id}</span>
            </div>

            {/* 房主名称 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: '600', fontSize: '14px', color: '#666', minWidth: '80px' }}>房主名称：</span>
              <span style={{ color: '#1976d2', fontWeight: '500', fontSize: '14px' }}>
                {room.ownerName || '未知用户'}
              </span>
            </div>

            {/* 房主ID */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: '600', fontSize: '14px', color: '#666', minWidth: '80px' }}>房主ID：</span>
              <span style={{ color: '#888', fontSize: '13px' }}>{room.ownerId}</span>
            </div>

            {/* 状态/发布设置 - 直接可编辑 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: '600', fontSize: '14px', color: '#666', minWidth: '80px' }}>状态：</span>
              
              {isOwner ? (
                // 房主界面 - 可编辑的发布设置
                <div style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  backgroundColor: 'white',
                  width: '100%'
                }}>
                  {/* 共享状态显示 */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    fontSize: '14px',
                    marginRight: '12px'
                  }}>
                    <span style={{ 
                      marginRight: '8px',
                      color: roomPermissionConfig?.shared ? '#10b981' : '#6b7280'
                    }}>
                      {roomPermissionConfig?.shared ? '✓' : '✗'}
                    </span>
                    <span style={{ 
                      color: roomPermissionConfig?.shared ? '#10b981' : '#6b7280',
                      fontWeight: roomPermissionConfig?.shared ? '500' : 'normal'
                    }}>
                      共享
                    </span>
                  </div>

                  {/* 发布状态显示 */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    fontSize: '14px',
                    marginRight: '12px'
                  }}>
                    <span style={{ 
                      marginRight: '8px',
                      color: roomPermissionConfig?.publish ? '#3b82f6' : '#6b7280'
                    }}>
                      {roomPermissionConfig?.publish ? '✓' : '✗'}
                    </span>
                    <span style={{ 
                      color: roomPermissionConfig?.publish ? '#3b82f6' : '#6b7280',
                      fontWeight: roomPermissionConfig?.publish ? '500' : 'normal'
                    }}>
                      发布
                    </span>
                  </div>

                  {/* 访问权限显示 */}
                  <div style={{ minWidth: '120px' }}>
                    <div style={{
                      width: '100%',
                      padding: '6px 8px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '13px',
                      backgroundColor: '#f9fafb',
                      color: '#374151',
                      cursor: 'default'
                    }}>
                      {roomPermissionConfig?.permission === 'viewer' && '仅查看'}
                      {roomPermissionConfig?.permission === 'editor' && '可编辑'}
                      {roomPermissionConfig?.permission === 'assist' && '协助者'}
                    </div>
                  </div>
                </div>
              ) : (
                // 访问者界面 - 只读状态显示
                <div style={{ 
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  backgroundColor: 'white',
                  width: '100%'
                }}>
                  <div style={{ fontSize: '14px', color: '#374151' }}>
                    <span style={{ 
                      display: 'inline-block',
                      marginRight: '8px',
                      color: room.published ? '#10b981' : '#ef4444',
                      fontWeight: '500'
                    }}>
                      {room.published ? '🌐 已发布' : '🔒 私有'}
                    </span>
                  </div>
                  <div style={{ fontSize: '14px', color: '#374151' }}>
                    <span style={{ 
                      display: 'inline-block',
                      marginRight: '8px',
                      color: room.publish ? '#3b82f6' : '#6b7280',
                      fontWeight: '500',
                      opacity: room.published ? 1 : 0.5
                    }}>
                      {room.publish && room.published ? '🏛️ 已发布' : '🏠 未发布'}
                    </span>
                  </div>
                  <div style={{ fontSize: '14px', color: '#374151' }}>
                    <span style={{ 
                      display: 'inline-block',
                      marginRight: '8px',
                      color: '#6b7280'
                    }}>
                      访问权限：
                    </span>
                    <span style={{ fontWeight: '500' }}>
                      {currentPermission === 'editor' ? '✏️ 可编辑' : 
                       currentPermission === 'assist' ? '🤝 辅作' : '👁️ 仅查看'}
                    </span>
                  </div>
                </div>
              )}
            </div>


            {/* 创建时间 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: '600', fontSize: '14px', color: '#666', minWidth: '80px' }}>创建时间：</span>
              <span style={{ color: '#888', fontSize: '13px' }}>{formatDate(room.createdAt)}</span>
            </div>

            {/* 最后修改 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: '600', fontSize: '14px', color: '#666', minWidth: '80px' }}>最后修改：</span>
              <span style={{ color: '#888', fontSize: '13px' }}>{formatDate(room.lastModified)}</span>
            </div>
          </div>

          {/* 简介区域 */}
          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f0f0f0' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: '#666', marginBottom: '8px' }}>简介：</div>
              {isEditing ? (
                <textarea
                  value={editingRoom.description || ''}
                  onChange={(e) => setEditingRoom({ ...editingRoom, description: e.target.value })}
                  placeholder="请输入房间简介..."
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    padding: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '13px',
                    resize: 'vertical'
                  }}
                />
              ) : (
                <div style={{
                  width: '100%',
                  minHeight: '60px',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '13px',
                  backgroundColor: '#f8fafc',
                  color: '#374151',
                  lineHeight: '1.5'
                }}>
                  {room.description || '暂无简介'}
                </div>
              )}
            </div>

            {/* 标签 */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', color: '#666', marginBottom: '8px' }}>标签：</div>
              {isEditing ? (
                <input
                  type="text"
                  value={editingRoom.tags?.join(', ') || ''}
                  onChange={(e) => setEditingRoom({ 
                    ...editingRoom, 
                    tags: e.target.value.split(',').map(tag => tag.trim()).filter(tag => tag)
                  })}
                  placeholder="请输入标签，用逗号分隔..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                />
              ) : (
                <div style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '13px',
                  backgroundColor: '#f8fafc',
                  color: '#374151',
                  minHeight: '20px'
                }}>
                  {room.tags?.join(', ') || '暂无标签'}
                </div>
              )}
            </div>
          </div>
          
          {/* 底部设置区域 */}
          <div style={{ marginTop: '24px', borderTop: '1px solid #eee', paddingTop: '20px' }}>

            {/* 房间封面设置已迁移到“房间设置”，此处移除 */}
          </div>

          {/* 操作按钮：根据需求已移除“关闭”按钮 */}
          <div style={{ height: '1px' }} />
        </div>
      </div>
    </div>
  )
}