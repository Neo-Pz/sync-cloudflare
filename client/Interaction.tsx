import React, { useState, useEffect, useRef } from 'react'
import { useUser } from '@clerk/clerk-react'
import { SharePanel } from './SharePanel'
import { RoomSettings } from './RoomSettings'
import { roomUtils } from './roomUtils'

interface InteractionProps {
  roomId: string
  onClose?: () => void
}

export function Interaction({ roomId, onClose }: InteractionProps) {
  const { user } = useUser()
  const [isOpen, setIsOpen] = useState(false)
  const [isStarred, setIsStarred] = useState(false)
  const [showCommentModal, setShowCommentModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [isRoomOwner, setIsRoomOwner] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Check if user is room owner
  useEffect(() => {
    const checkOwnership = async () => {
      if (!user || !roomId) return
      
      try {
        const room = await roomUtils.getRoom(roomId)
        if (room) {
          setIsRoomOwner(room.ownerId === user.id || room.owner === user.id)
        }
      } catch (error) {
        console.error('Error checking room ownership:', error)
      }
    }
    
    checkOwnership()
  }, [user, roomId])

  // Handle share functionality
  const handleShare = () => {
    setShowShareModal(true)
    console.log('🔗 分享功能')
  }

  // Handle settings functionality
  const handleSettings = () => {
    setShowSettingsModal(true)
    console.log('⚙️ 房间设置')
  }

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Handle star functionality
  const handleStar = () => {
    setIsStarred(!isStarred)
    console.log('⭐ 收藏功能:', isStarred ? '取消收藏' : '收藏')
    // TODO: Implement star API call
  }

  // Handle comment functionality
  const handleComment = () => {
    setShowCommentModal(true)
    console.log('💬 评论功能')
  }



  // Share functions  
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      alert('链接已复制到剪贴板')
    } catch (err) {
      console.error('Failed to copy: ', err)
    }
  }

  return (
    <div className="interaction-dropdown" ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '0.25rem 0.75rem',
          background: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.875rem',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        交互
        <span style={{ fontSize: '0.7rem' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          backgroundColor: 'white',
          border: '1px solid #ddd',
          borderRadius: '4px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          minWidth: '200px',
          zIndex: 2000,
          padding: '1rem'
        }}>
          <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: '600', color: '#374151' }}>
            交互功能
          </h4>
          
          {/* Interaction buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Star */}
            <button
              onClick={handleStar}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                background: isStarred ? '#fef3c7' : 'none',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                color: isStarred ? '#92400e' : '#374151',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = isStarred ? '#fef3c7' : '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = isStarred ? '#fef3c7' : 'transparent'}
            >
              <span>{isStarred ? '⭐' : '☆'}</span>
              <span>Star</span>
            </button>

            {/* Comment */}
            <button
              onClick={handleComment}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                background: 'none',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#374151',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <span>💬</span>
              <span>Comment</span>
            </button>


            {/* Share - Available for everyone */}
            <button
              onClick={handleShare}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                background: 'none',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#374151',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <span>🔗</span>
              <span>Share</span>
            </button>

            {/* Settings - Only for room owners */}
            {isRoomOwner && (
              <button
                onClick={handleSettings}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: 'none',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#374151',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <span>⚙️</span>
                <span>Settings</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Comment Modal */}
      {showCommentModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={() => setShowCommentModal(false)}
        >
          <div 
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '20px',
              width: '400px',
              maxWidth: '90%'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0' }}>发表评论</h3>
            <textarea
              placeholder="写下你的评论..."
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCommentModal(false)}
                style={{
                  padding: '8px 16px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  console.log('💬 评论已提交')
                  setShowCommentModal(false)
                }}
                style={{
                  padding: '8px 16px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                提交
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Share Panel */}
      <SharePanel
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        roomId={roomId}
      />

      {/* Room Settings */}
      <RoomSettings
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        roomId={roomId}
      />

    </div>
  )
}