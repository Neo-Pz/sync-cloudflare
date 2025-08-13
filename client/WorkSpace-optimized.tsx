// 生产环境优化版本 - WorkSpace组件
import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useUser } from '@clerk/clerk-react'
import { useEditor, useValue, TLPageId, Editor } from '@tldraw/editor'
import { TldrawUiButton, TldrawUiButtonIcon, useTranslation } from 'tldraw'
import { api, Room, UserRoomStats } from './api'
import { formatPermissionInfo } from './permissionUtils'
import './WorkSpace.css'

interface WorkspaceRoom {
  id: string
  name: string
  lastVisited: number
  isExpanded: boolean
  pages: Array<{ name: string; id: TLPageId }>
  permission?: 'viewer' | 'editor' | 'assist'
  historyLocked?: boolean
}

interface WorkSpaceProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export function WorkSpace({ isOpen, onOpenChange }: WorkSpaceProps) {
  const editor = useEditor()
  const { user, isLoaded } = useUser()
  const msg = useTranslation()
  
  const pages = useValue('pages', () => editor.getPages(), [editor])
  const currentPage = useValue('currentPage', () => editor.getCurrentPage(), [editor])
  
  const [workspaceRooms, setWorkspaceRooms] = useState<WorkspaceRoom[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')

  // 获取当前房间ID
  const currentRoomId = useMemo(() => {
    const path = window.location.pathname
    const match = path.match(/^\/(?:r(?:o)?|p)\/([^/]+)\/?/)
    return match ? decodeURIComponent(match[1]) : 'shared-room'
  }, [])

  // 从数据库加载用户最近房间
  const loadRecentRooms = useCallback(async () => {
    if (!user?.id || !isLoaded) return
    
    setIsLoading(true)
    try {
      const [recentStats, allRooms] = await Promise.all([
        api.getUserRecentRooms(user.id, 15),
        api.getRooms()
      ])

      // 合并统计数据和房间详情
      const roomsMap = new Map(allRooms.map(room => [room.id, room]))
      
      const workspaceData: WorkspaceRoom[] = recentStats
        .map(stats => {
          const room = roomsMap.get(stats.roomId)
          if (!room) return null
          
          return {
            id: stats.roomId,
            name: room.name,
            lastVisited: stats.lastVisit,
            isExpanded: false,
            pages: [], // 页面信息将在需要时加载
            permission: room.permission,
            historyLocked: room.historyLocked,
          }
        })
        .filter(Boolean) as WorkspaceRoom[]

      // 添加当前房间（如果不在列表中）
      if (currentRoomId !== 'shared-room' && !workspaceData.find(r => r.id === currentRoomId)) {
        const currentRoom = roomsMap.get(currentRoomId)
        if (currentRoom) {
          workspaceData.unshift({
            id: currentRoom.id,
            name: currentRoom.name,
            lastVisited: Date.now(),
            isExpanded: true,
            pages: pages.map(page => ({ name: page.name, id: page.id })),
            permission: currentRoom.permission,
            historyLocked: currentRoom.historyLocked,
          })
        }
      }

      setWorkspaceRooms(workspaceData)
    } catch (error) {
      console.error('Failed to load recent rooms:', error)
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, isLoaded, currentRoomId, pages])

  // 初始加载
  useEffect(() => {
    if (isOpen) {
      loadRecentRooms()
    }
  }, [isOpen, loadRecentRooms])

  // 记录当前房间访问
  useEffect(() => {
    if (user && currentRoomId !== 'shared-room') {
      const userName = user.emailAddresses?.[0]?.emailAddress?.split('@')[0] || user.fullName || 'User'
      
      api.getRoom(currentRoomId)
        .then(room => api.recordRoomVisit(user.id, userName, currentRoomId, room.name))
        .catch(console.error)
    }
  }, [user, currentRoomId])

  // 排序房间：当前房间优先，然后按访问时间
  const sortedRooms = useMemo(() => {
    return [...workspaceRooms].sort((a, b) => {
      if (a.id === currentRoomId) return -1
      if (b.id === currentRoomId) return 1
      return b.lastVisited - a.lastVisited
    })
  }, [workspaceRooms, currentRoomId])

  // 创建新房间
  const handleCreateRoom = useCallback(async () => {
    if (!newRoomName.trim() || !user) return

    try {
      const userName = user.emailAddresses?.[0]?.emailAddress?.split('@')[0] || user.fullName || 'User'
      
      const room = await api.createRoom({
        name: newRoomName.trim(),
        ownerId: user.id,
        ownerName: userName,
        shared: false,
        permission: 'editor',
      })

      // 记录创建活动
      await api.recordRoomCreate(user.id, userName, room.id, room.name)
      
      // 跳转到新房间
      window.location.href = `/r/${encodeURIComponent(room.name)}`
      
      setNewRoomName('')
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to create room:', error)
      alert('创建房间失败，请重试')
    }
  }, [newRoomName, user, onOpenChange])

  // 切换房间展开状态
  const toggleRoomExpanded = useCallback((roomId: string) => {
    setWorkspaceRooms(prev => prev.map(room => 
      room.id === roomId ? { ...room, isExpanded: !room.isExpanded } : room
    ))
  }, [])

  // 跳转到房间
  const navigateToRoom = useCallback((room: WorkspaceRoom) => {
    const url = `/r/${encodeURIComponent(room.name)}`
    window.location.href = url
    onOpenChange(false)
  }, [onOpenChange])

  if (!isOpen) return null

  return (
    <div className="tlui-workspace">
      <div className="tlui-workspace-header">
        <h3>工作空间</h3>
        <button onClick={() => onOpenChange(false)}>×</button>
      </div>

      {/* 创建新房间 */}
      <div className="tlui-workspace-create">
        <input
          type="text"
          placeholder="输入房间名称..."
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
          className="tlui-workspace-input"
        />
        <TldrawUiButton
          type="icon"
          onClick={handleCreateRoom}
          disabled={!newRoomName.trim()}
        >
          <TldrawUiButtonIcon icon="plus" />
        </TldrawUiButton>
      </div>

      {/* 房间列表 */}
      <div className="tlui-workspace-rooms">
        {isLoading ? (
          <div className="tlui-workspace-loading">加载中...</div>
        ) : sortedRooms.length === 0 ? (
          <div className="tlui-workspace-empty">暂无访问过的房间</div>
        ) : (
          sortedRooms.map((room) => (
            <div key={room.id} className="tlui-workspace-room">
              <div className="tlui-workspace-room-header">
                <TldrawUiButton
                  type="icon"
                  onClick={() => toggleRoomExpanded(room.id)}
                  className="tlui-workspace-expand-btn"
                >
                  <TldrawUiButtonIcon icon={room.isExpanded ? 'chevron-down' : 'chevron-right'} />
                </TldrawUiButton>
                
                <div 
                  className="tlui-workspace-room-name"
                  onClick={() => navigateToRoom(room)}
                  title={room.name}
                >
                  {room.name}
                  {room.id === currentRoomId && <span className="tlui-workspace-current">当前</span>}
                </div>

                <div className="tlui-workspace-room-info">
                  {room.permission && (
                    <span className={`tlui-workspace-permission ${room.permission}`}>
                      {formatPermissionInfo({ mode: room.permission }).displayName}
                    </span>
                  )}
                  {room.historyLocked && (
                    <span className="tlui-workspace-locked">🔒</span>
                  )}
                </div>
              </div>

              {room.isExpanded && room.pages.length > 0 && (
                <div className="tlui-workspace-pages">
                  {room.pages.map((page) => (
                    <div key={page.id} className="tlui-workspace-page">
                      {page.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}