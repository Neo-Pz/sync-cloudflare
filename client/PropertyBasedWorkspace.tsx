// Property-Based Workspace - Replaces URL-based room management with property table system

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useUser } from '@clerk/clerk-react'
import { UserRoom } from './UserRoom'
import { collaborationService } from './collaborationService'
import { interactionTracker, trackVisit } from './interactionTracker'

export interface WorkspaceRoom {
  id: string
  name: string
  ownerId: string
  ownerName: string
  lastModified: number
  createdAt: number
  permission: 'viewer' | 'editor' | 'assist'
  userRole: 'creator' | 'editor' | 'assistant' | 'viewer'
  relationshipType: 'owned' | 'collaborated' | 'visited'
  isStarred: boolean
  visitCount: number
  lastVisitAt: number
}

interface PropertyBasedWorkspaceProps {
  onRoomChange: (roomId: string) => void
  currentRoomId?: string
}

export function PropertyBasedWorkspace({ onRoomChange, currentRoomId }: PropertyBasedWorkspaceProps) {
  const { user, isLoaded } = useUser()
  const [workspaceRooms, setWorkspaceRooms] = useState<WorkspaceRoom[]>([])
  const [selectedRoom, setSelectedRoom] = useState<string | null>(currentRoomId || null)
  const [showUserGallery, setShowUserGallery] = useState(false)
  const [viewMode, setViewMode] = useState<'recent' | 'owned' | 'collaborated' | 'starred'>('recent')
  const [isLoading, setIsLoading] = useState(true)

  const userId = user?.id || 'anonymous'
  const userName = user?.fullName || user?.firstName || 'Anonymous User'

  // Load workspace rooms based on user's property relationships
  const loadWorkspaceRooms = useCallback(async () => {
    setIsLoading(true)
    try {
      // Get collaboration data
      const collaboratedRooms = collaborationService.getUserCollaboratedRooms(userId)
      const interactedRooms = collaborationService.getUserInteractedRooms(userId)
      
      // Get interaction metrics
      const allMetrics = interactionTracker.getAllMetrics()
      const starredRooms = interactionTracker.getStarredRooms()
      
      // Combine all room IDs
      const allRoomIds = new Set([
        ...collaboratedRooms,
        ...interactedRooms,
        ...allMetrics.map(m => m.roomId)
      ])

      // Load room data for each ID
      const { roomUtils } = await import('./roomUtils')
      const roomsData: WorkspaceRoom[] = []

      for (const roomId of allRoomIds) {
        try {
          const roomData = await roomUtils.getRoom(roomId)
          if (!roomData) continue

          // Determine user relationship and role
          const userRole = collaborationService.getUserRole(roomId)
          let relationshipType: 'owned' | 'collaborated' | 'visited' = 'visited'
          
          if (roomData.ownerId === userId || roomData.owner === userId) {
            relationshipType = 'owned'
          } else if (userRole === 'editor' || userRole === 'assistant') {
            relationshipType = 'collaborated'
          }

          // Get interaction metrics
          const metrics = interactionTracker.getMetrics(roomId)
          const isStarred = metrics?.isStarred || false
          const visitCount = metrics?.visitCount || 0
          const lastVisitAt = metrics?.lastVisitAt || 0

          const workspaceRoom: WorkspaceRoom = {
            id: roomData.id,
            name: roomData.name,
            ownerId: roomData.ownerId || roomData.owner,
            ownerName: roomData.ownerName || 'Unknown',
            lastModified: roomData.lastModified,
            createdAt: roomData.createdAt,
            permission: roomData.permission || 'viewer',
            userRole,
            relationshipType,
            isStarred,
            visitCount,
            lastVisitAt
          }

          roomsData.push(workspaceRoom)
        } catch (error) {
          console.error(`Error loading room ${roomId}:`, error)
        }
      }

      // Sort by last interaction/modification
      roomsData.sort((a, b) => {
        const aTime = Math.max(a.lastVisitAt, a.lastModified)
        const bTime = Math.max(b.lastVisitAt, b.lastModified)
        return bTime - aTime
      })

      setWorkspaceRooms(roomsData)
    } catch (error) {
      console.error('Error loading workspace rooms:', error)
      setWorkspaceRooms([])
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  // Load rooms on mount and when user changes
  useEffect(() => {
    if (isLoaded) {
      loadWorkspaceRooms()
    }
  }, [loadWorkspaceRooms, isLoaded])

  // Filter rooms based on view mode
  const filteredRooms = useMemo(() => {
    switch (viewMode) {
      case 'owned':
        return workspaceRooms.filter(room => room.relationshipType === 'owned')
      case 'collaborated':
        return workspaceRooms.filter(room => room.relationshipType === 'collaborated')
      case 'starred':
        return workspaceRooms.filter(room => room.isStarred)
      case 'recent':
      default:
        return workspaceRooms
    }
  }, [workspaceRooms, viewMode])

  // Handle room selection and navigation
  const handleRoomSelect = useCallback(async (roomId: string) => {
    const room = workspaceRooms.find(r => r.id === roomId)
    if (!room) return

    setSelectedRoom(roomId)
    
    // Track the visit
    await trackVisit(roomId, userId, userName)
    
    // Initialize collaboration tracking
    await collaborationService.initializeCollaboration(roomId, userId, userName)
    
    // Change to the room
    onRoomChange(roomId)
    
    // Refresh workspace to update visit counts
    setTimeout(() => loadWorkspaceRooms(), 1000)
  }, [workspaceRooms, userId, userName, onRoomChange, loadWorkspaceRooms])

  // Handle star toggle
  const handleStarToggle = useCallback(async (roomId: string, starred: boolean) => {
    await interactionTracker.toggleStar(roomId, userId, userName, starred)
    loadWorkspaceRooms() // Refresh to update star status
  }, [userId, userName, loadWorkspaceRooms])

  // Format time ago
  const formatTimeAgo = useCallback((timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (minutes < 1) return '刚才'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    return new Date(timestamp).toLocaleDateString()
  }, [])

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '200px',
        color: '#6b7280'
      }}>
        Loading workspace...
      </div>
    )
  }

  if (showUserGallery) {
    return (
      <UserRoom
        currentUserId={userId}
        onRoomChange={handleRoomSelect}
        onClose={() => setShowUserGallery(false)}
      />
    )
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: '#f8f9fa',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: 'white'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#111827'
          }}>
            工作空间
          </h2>
          
          <button
            onClick={() => setShowUserGallery(true)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            用户画廊
          </button>
        </div>

        {/* View mode tabs */}
        <div style={{
          display: 'flex',
          gap: '0.5rem'
        }}>
          {[
            { key: 'recent', label: '最近访问', count: workspaceRooms.length },
            { key: 'owned', label: '我创建的', count: workspaceRooms.filter(r => r.relationshipType === 'owned').length },
            { key: 'collaborated', label: '协作中的', count: workspaceRooms.filter(r => r.relationshipType === 'collaborated').length },
            { key: 'starred', label: '收藏的', count: workspaceRooms.filter(r => r.isStarred).length }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setViewMode(tab.key as any)}
              style={{
                padding: '0.5rem 0.75rem',
                backgroundColor: viewMode === tab.key ? '#3b82f6' : '#f3f4f6',
                color: viewMode === tab.key ? 'white' : '#374151',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              {tab.label}
              <span style={{
                backgroundColor: viewMode === tab.key ? 'rgba(255,255,255,0.2)' : '#d1d5db',
                color: viewMode === tab.key ? 'white' : '#6b7280',
                padding: '0.125rem 0.375rem',
                borderRadius: '0.75rem',
                fontSize: '0.625rem',
                fontWeight: '600'
              }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Room List */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '1rem'
      }}>
        {filteredRooms.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: '#6b7280',
            padding: '2rem'
          }}>
            {viewMode === 'owned' && '您还没有创建任何房间'}
            {viewMode === 'collaborated' && '您还没有参与协作的房间'}
            {viewMode === 'starred' && '您还没有收藏任何房间'}
            {viewMode === 'recent' && '没有找到相关房间'}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gap: '0.5rem'
          }}>
            {filteredRooms.map(room => (
              <div
                key={room.id}
                style={{
                  padding: '0.75rem',
                  backgroundColor: selectedRoom === room.id ? '#eff6ff' : 'white',
                  border: selectedRoom === room.id ? '2px solid #3b82f6' : '1px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => handleRoomSelect(room.id)}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.25rem'
                    }}>
                      <h3 style={{
                        margin: 0,
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        color: '#111827'
                      }}>
                        {room.name}
                      </h3>
                      
                      {/* Role badge */}
                      <span style={{
                        fontSize: '0.625rem',
                        padding: '0.125rem 0.375rem',
                        borderRadius: '0.25rem',
                        fontWeight: '500',
                        backgroundColor: 
                          room.userRole === 'creator' ? '#dbeafe' :
                          room.userRole === 'editor' ? '#d1fae5' :
                          room.userRole === 'assistant' ? '#fef3c7' : '#f3f4f6',
                        color:
                          room.userRole === 'creator' ? '#1e40af' :
                          room.userRole === 'editor' ? '#065f46' :
                          room.userRole === 'assistant' ? '#92400e' : '#374151'
                      }}>
                        {room.userRole === 'creator' ? '创建者' :
                         room.userRole === 'editor' ? '编辑' :
                         room.userRole === 'assistant' ? '辅助' : '访客'}
                      </span>
                    </div>
                    
                    <div style={{
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      marginBottom: '0.25rem'
                    }}>
                      创建者: {room.ownerName}
                    </div>
                    
                    <div style={{
                      display: 'flex',
                      gap: '1rem',
                      fontSize: '0.75rem',
                      color: '#9ca3af'
                    }}>
                      <span>
                        最后修改: {formatTimeAgo(room.lastModified)}
                      </span>
                      {room.visitCount > 0 && (
                        <span>
                          访问 {room.visitCount} 次
                        </span>
                      )}
                      {room.lastVisitAt > 0 && (
                        <span>
                          上次访问: {formatTimeAgo(room.lastVisitAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Star button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStarToggle(room.id, !room.isStarred)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0.25rem',
                      fontSize: '1rem',
                      color: room.isStarred ? '#f59e0b' : '#d1d5db'
                    }}
                    title={room.isStarred ? '取消收藏' : '收藏'}
                  >
                    {room.isStarred ? '★' : '☆'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer with statistics */}
      <div style={{
        padding: '0.75rem 1rem',
        borderTop: '1px solid #e5e7eb',
        backgroundColor: 'white',
        fontSize: '0.75rem',
        color: '#6b7280'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>
            {viewMode === 'recent' && `共 ${filteredRooms.length} 个相关房间`}
            {viewMode === 'owned' && `共 ${filteredRooms.length} 个创建的房间`}
            {viewMode === 'collaborated' && `共 ${filteredRooms.length} 个协作房间`}
            {viewMode === 'starred' && `共 ${filteredRooms.length} 个收藏房间`}
          </span>
          
          <span>
            基于属性的房间管理系统
          </span>
        </div>
      </div>
    </div>
  )
}