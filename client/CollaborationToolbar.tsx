import { useEditor } from 'tldraw'
import { useState, useCallback } from 'react'
import { CollaborationUtils } from './CollaborationUtils'

interface CollaborationToolbarProps {
  className?: string
}

export function CollaborationToolbar({ className }: CollaborationToolbarProps) {
  const editor = useEditor()
  const [isSharing, setIsSharing] = useState(false)

  const handleShareViewport = useCallback(async () => {
    if (!editor) return
    
    setIsSharing(true)
    try {
      await CollaborationUtils.shareViewport(editor)
      // 这里可以添加分享反馈，比如显示链接或通知
    } catch (error) {
      console.error('Failed to share viewport:', error)
    } finally {
      setIsSharing(false)
    }
  }, [editor])

  const handleFitAllCollaborators = useCallback(() => {
    if (!editor) return
    
    try {
      const collaborators = editor.getCollaborators()
      if (collaborators.length === 0) return

      // 计算包含所有协作者视区的边界
      const cameras = collaborators
        .filter(c => c.camera)
        .map(c => c.camera!)
      
      if (cameras.length === 0) return

      // 计算最大边界
      const bounds = cameras.reduce((acc, camera) => {
        const viewport = editor.getViewportScreenBounds()
        const x1 = camera.x - viewport.w / (2 * camera.z)
        const y1 = camera.y - viewport.h / (2 * camera.z)
        const x2 = camera.x + viewport.w / (2 * camera.z)
        const y2 = camera.y + viewport.h / (2 * camera.z)
        
        return {
          minX: Math.min(acc.minX, x1),
          minY: Math.min(acc.minY, y1),
          maxX: Math.max(acc.maxX, x2),
          maxY: Math.max(acc.maxY, y2)
        }
      }, {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
      })

      // 缩放到包含所有协作者的视区
      editor.zoomToBounds({
        x: bounds.minX,
        y: bounds.minY,
        w: bounds.maxX - bounds.minX,
        h: bounds.maxY - bounds.minY
      }, {
        animation: { duration: 800 },
        targetZoom: 0.8 // 稍微留点边距
      })
      
    } catch (error) {
      console.error('Failed to fit all collaborators:', error)
    }
  }, [editor])

  const handleStopAllFollowing = useCallback(() => {
    if (!editor) return
    CollaborationUtils.stopFollowing(editor)
  }, [editor])

  if (!editor) return null

  return (
    <div 
      className={className || ''}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}
    >
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px',
          background: 'white',
          border: '1px solid #e1e5e9',
          borderRadius: '8px',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.05)'
        }}
      >
        <button
          style={{
            width: '32px',
            height: '32px',
            border: 'none',
            borderRadius: '6px',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            transition: 'all 0.15s ease',
            position: 'relative'
          }}
          onClick={handleFitAllCollaborators}
          title="查看所有协作者"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f3f4f6'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          👥
        </button>
        
        <button
          style={{
            width: '32px',
            height: '32px',
            border: 'none',
            borderRadius: '6px',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            transition: 'all 0.15s ease',
            position: 'relative'
          }}
          onClick={handleStopAllFollowing}
          title="停止跟踪"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#f3f4f6'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          🚫👀
        </button>
        
        <button
          style={{
            width: '32px',
            height: '32px',
            border: 'none',
            borderRadius: '6px',
            background: 'transparent',
            cursor: isSharing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            transition: 'all 0.15s ease',
            position: 'relative',
            opacity: isSharing ? 0.5 : 1,
            animation: isSharing ? 'spin 1s linear infinite' : 'none'
          }}
          onClick={handleShareViewport}
          disabled={isSharing}
          title="分享当前视图"
          onMouseEnter={(e) => {
            if (!isSharing) {
              e.currentTarget.style.background = '#f3f4f6'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }
          }}
          onMouseLeave={(e) => {
            if (!isSharing) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.transform = 'translateY(0)'
            }
          }}
        >
          {isSharing ? '📤' : '🔗'}
        </button>
      </div>
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}