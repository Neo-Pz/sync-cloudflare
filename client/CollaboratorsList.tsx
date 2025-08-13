import { TLInstancePresence } from 'tldraw'
import { CollaborationUtils } from './CollaborationUtils'

interface CollaboratorsListProps {
  className?: string
  collaborators: TLInstancePresence[]
  followingUserId: string | null
  onFollowUser: (userId: string) => void
  onGoToUser: (userId: string) => void
  onHighlightUser: (userId: string) => void
}

export function CollaboratorsList({ 
  className, 
  collaborators, 
  followingUserId,
  onFollowUser,
  onGoToUser,
  onHighlightUser
}: CollaboratorsListProps) {

  const handleFollowUser = async (userId: string) => {
    if (!editor) return
    
    if (followingUserId === userId) {
      CollaborationUtils.stopFollowing(editor)
    } else {
      await CollaborationUtils.followUser(editor, userId)
    }
  }

  const handleGoToUser = async (userId: string) => {
    if (!editor) return
    
    await CollaborationUtils.goToUser(editor, userId)
  }

  const handleHighlightUser = async (userId: string) => {
    if (!editor) return
    
    await CollaborationUtils.highlightUserSelection(editor, userId)
  }

  if (collaborators.length === 0) {
    return null
  }

  return (
    <div 
      className={className || ''}
      style={{
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e1e5e9',
        minWidth: '280px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
      }}
    >
      <div 
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #e1e5e9',
          background: '#f8fafc',
          borderRadius: '8px 8px 0 0'
        }}
      >
        <span 
          style={{
            fontWeight: '600',
            fontSize: '14px',
            color: '#374151'
          }}
        >
          协作者 ({collaborators.length})
        </span>
      </div>
      
      <div 
        style={{
          padding: '8px 0',
          maxHeight: '300px',
          overflowY: 'auto'
        }}
      >
        {collaborators.map((collaborator) => (
          <div
            key={collaborator.userId}
            style={{ 
              borderLeft: `3px solid ${collaborator.color}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f8fafc'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                flex: '1',
                gap: '12px'
              }}
            >
              <div 
                style={{ 
                  backgroundColor: collaborator.color,
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '14px',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                }}
              >
                {collaborator.userName.charAt(0).toUpperCase()}
              </div>
              <div 
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px'
                }}
              >
                <span 
                  style={{
                    fontWeight: '500',
                    fontSize: '14px',
                    color: '#374151',
                    lineHeight: '1.2'
                  }}
                >
                  {collaborator.userName}
                </span>
                <div 
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span 
                    style={{ 
                      backgroundColor: CollaborationUtils.getStatusColor(CollaborationUtils.getUserStatus(collaborator)),
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      flexShrink: '0'
                    }}
                  ></span>
                  <span 
                    style={{
                      fontSize: '11px',
                      color: '#6b7280',
                      lineHeight: '1.2'
                    }}
                  >
                    {CollaborationUtils.formatLastSeen(collaborator)}
                  </span>
                </div>
                {collaborator.selectedShapeIds.length > 0 && (
                  <span 
                    style={{
                      fontSize: '10px',
                      color: '#9ca3af',
                      fontStyle: 'italic',
                      lineHeight: '1.2'
                    }}
                  >
                    选中 {collaborator.selectedShapeIds.length} 个项目
                  </span>
                )}
              </div>
            </div>
            
            <div 
              style={{
                display: 'flex',
                gap: '4px'
              }}
            >
              {collaborator.selectedShapeIds.length > 0 && (
                <button
                  style={{
                    width: '28px',
                    height: '28px',
                    border: 'none',
                    borderRadius: '6px',
                    background: '#f3f4f6',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => handleHighlightUser(collaborator.userId)}
                  title="高亮用户选择"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#fef3c7'
                    e.currentTarget.style.transform = 'scale(1.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f3f4f6'
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
                >
                  ✨
                </button>
              )}
              <button
                style={{
                  width: '28px',
                  height: '28px',
                  border: 'none',
                  borderRadius: '6px',
                  background: followingUserId === collaborator.userId ? '#3b82f6' : '#f3f4f6',
                  color: followingUserId === collaborator.userId ? 'white' : 'inherit',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => handleGoToUser(collaborator.userId)}
                title="定位到用户位置"
                onMouseEnter={(e) => {
                  if (followingUserId === collaborator.userId) {
                    e.currentTarget.style.background = '#2563eb'
                  } else {
                    e.currentTarget.style.background = '#fef3c7'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (followingUserId === collaborator.userId) {
                    e.currentTarget.style.background = '#3b82f6'
                  } else {
                    e.currentTarget.style.background = '#f3f4f6'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }
                }}
              >
                📍
              </button>
              <button
                style={{
                  width: '28px',
                  height: '28px',
                  border: 'none',
                  borderRadius: '6px',
                  background: followingUserId === collaborator.userId ? '#3b82f6' : '#f3f4f6',
                  color: followingUserId === collaborator.userId ? 'white' : 'inherit',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  transition: 'all 0.15s ease',
                  animation: followingUserId === collaborator.userId ? 'pulse 2s infinite' : 'none'
                }}
                onClick={() => handleFollowUser(collaborator.userId)}
                title={followingUserId === collaborator.userId ? '停止跟踪' : '跟踪用户'}
                onMouseEnter={(e) => {
                  if (followingUserId === collaborator.userId) {
                    e.currentTarget.style.background = '#2563eb'
                  } else {
                    e.currentTarget.style.background = '#dbeafe'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (followingUserId === collaborator.userId) {
                    e.currentTarget.style.background = '#3b82f6'
                  } else {
                    e.currentTarget.style.background = '#f3f4f6'
                    e.currentTarget.style.transform = 'translateY(0)'
                  }
                }}
              >
                {followingUserId === collaborator.userId ? '👁️' : '👀'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  )
}