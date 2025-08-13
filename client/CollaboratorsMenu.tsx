import { useEditor, TLInstancePresence } from 'tldraw'
import { useEffect, useState, useRef } from 'react'
import { CollaboratorsList } from './CollaboratorsList'

interface CollaboratorsMenuProps {
  className?: string
}

export function CollaboratorsMenu({ className }: CollaboratorsMenuProps) {
  const editor = useEditor()
  const [collaborators, setCollaborators] = useState<TLInstancePresence[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [followingUserId, setFollowingUserId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)



  useEffect(() => {
    if (!editor) return

    const updateCollaborators = () => {
      const collabs = editor.getCollaborators()
      setCollaborators(collabs)
      
      // 更新跟踪状态
      const currentFollowing = editor.getInstanceState().followingUserId
      setFollowingUserId(currentFollowing)
    }

    // 初始更新
    updateCollaborators()

    // 监听协作者变化
    const unsubscribe = editor.store.listen(() => {
      updateCollaborators()
    }, {
      source: 'user',
      scope: 'presence'
    })

    return unsubscribe
  }, [editor])

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleQuickFollow = (userId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    if (!editor) return
    
    if (followingUserId === userId) {
      editor.stopFollowingUser()
    } else {
      editor.startFollowingUser(userId)
    }
  }

  if (collaborators.length === 0) {
    return null
  }

  // 显示最多3个头像，其余用数字表示
  const visibleCollaborators = collaborators.slice(0, 3)
  const remainingCount = Math.max(0, collaborators.length - 3)

  return (
    <div 
      className={className || ''} 
      ref={menuRef}
      style={{ position: 'relative', zIndex: 1000 }}
    >
      {/* 协作者头像按钮 */}
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 10px',
          background: 'white',
          border: '1px solid #e1e5e9',
          borderRadius: '20px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)',
          userSelect: 'none'
        }}
        onClick={() => setIsOpen(!isOpen)}
        title={`${collaborators.length}位协作者在线`}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#f8fafc'
          e.currentTarget.style.borderColor = '#cbd5e1'
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'white'
          e.currentTarget.style.borderColor = '#e1e5e9'
          e.currentTarget.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.05)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {/* Show collaborators */}
              {visibleCollaborators.map((collaborator, index) => {
                const isFollowing = followingUserId === collaborator.userId
                return (
                  <div
                    key={collaborator.userId}
                    style={{ 
                      backgroundColor: collaborator.color,
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
                      border: isFollowing ? '2px solid #3b82f6' : '2px solid white',
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                      position: 'relative',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer',
                      boxShadow: isFollowing ? '0 0 0 2px rgba(59, 130, 246, 0.3)' : 'none',
                      animation: isFollowing ? 'followingPulse 2s infinite' : 'none'
                    }}
                    onDoubleClick={(e) => handleQuickFollow(collaborator.userId, e)}
                    title={`${collaborator.userName}${isFollowing ? ' (跟踪中)' : ''}`}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.1)'
                      e.currentTarget.style.zIndex = '10'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)'
                      e.currentTarget.style.zIndex = String(3 - index)
                    }}
                  >
                    {collaborator.userName.charAt(0).toUpperCase()}
                  </div>
                )
              })}
              
              {remainingCount > 0 && (
                <div
                  style={{ 
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
                    position: 'relative',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer'
                  }}
                >
                  +{remainingCount}
                </div>
              )}
        </div>

        
        <div 
          style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#64748b',
            minWidth: '16px',
            textAlign: 'center'
          }}
        >
          {collaborators.length}
        </div>
      </div>

      {/* 协作者列表弹出菜单 */}
      {isOpen && (
        <div 
          style={{
            position: 'absolute',
            top: '100%',
            right: '0',
            marginTop: '8px',
            zIndex: 1001,
            animation: 'slideDown 0.2s ease-out'
          }}
        >
          <CollaboratorsList />
        </div>
      )}


      <style>{`
        @keyframes followingPulse {
          0%, 100% {
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
          }
          50% {
            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.5);
          }
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}