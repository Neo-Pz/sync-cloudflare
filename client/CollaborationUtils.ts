import { Editor, TLInstancePresence } from 'tldraw'

export class CollaborationUtils {
  static async followUser(editor: Editor, userId: string) {
    const collaborator = editor.getCollaborators().find(c => c.userId === userId)
    if (!collaborator) return false

    try {
      editor.startFollowingUser(userId)
      
      // 如果用户在不同页面，切换到该页面
      if (collaborator.currentPageId !== editor.getCurrentPageId()) {
        editor.setCurrentPage(collaborator.currentPageId)
      }
      
      // 平滑移动到用户位置
      if (collaborator.camera) {
        editor.setCamera(collaborator.camera, { 
          animation: { duration: 800, easing: (t) => t * (2 - t) } 
        })
      }
      
      return true
    } catch (error) {
      console.error('Failed to follow user:', error)
      return false
    }
  }

  static async goToUser(editor: Editor, userId: string) {
    const collaborator = editor.getCollaborators().find(c => c.userId === userId)
    if (!collaborator) return false

    try {
      // 如果用户在不同页面，切换到该页面
      if (collaborator.currentPageId !== editor.getCurrentPageId()) {
        editor.setCurrentPage(collaborator.currentPageId)
      }
      
      // 移动到用户位置
      if (collaborator.camera) {
        editor.setCamera(collaborator.camera, { 
          animation: { duration: 600, easing: (t) => 1 - Math.pow(1 - t, 3) } 
        })
      }
      
      // 短暂高亮用户选中的形状
      if (collaborator.selectedShapeIds.length > 0) {
        const currentSelection = editor.getSelectedShapeIds()
        editor.setSelectedShapes(collaborator.selectedShapeIds)
        
        // 2秒后恢复原来的选择
        setTimeout(() => {
          editor.setSelectedShapes(currentSelection)
        }, 2000)
      }
      
      return true
    } catch (error) {
      console.error('Failed to go to user:', error)
      return false
    }
  }

  static stopFollowing(editor: Editor) {
    try {
      editor.stopFollowingUser()
      return true
    } catch (error) {
      console.error('Failed to stop following:', error)
      return false
    }
  }

  static getUserStatus(collaborator: TLInstancePresence): 'online' | 'away' | 'offline' {
    if (!collaborator.lastActivityTimestamp) return 'offline'
    
    const timeSinceLastActivity = Date.now() - collaborator.lastActivityTimestamp
    
    if (timeSinceLastActivity < 10000) return 'online' // 10秒内
    if (timeSinceLastActivity < 60000) return 'away'   // 1分钟内
    return 'offline'
  }

  static formatLastSeen(collaborator: TLInstancePresence): string {
    if (!collaborator.lastActivityTimestamp) return '从未活动'
    
    const timeSinceLastActivity = Date.now() - collaborator.lastActivityTimestamp
    
    if (timeSinceLastActivity < 10000) return '刚刚活动'
    if (timeSinceLastActivity < 60000) return '1分钟前'
    if (timeSinceLastActivity < 3600000) return `${Math.floor(timeSinceLastActivity / 60000)}分钟前`
    if (timeSinceLastActivity < 86400000) return `${Math.floor(timeSinceLastActivity / 3600000)}小时前`
    
    return `${Math.floor(timeSinceLastActivity / 86400000)}天前`
  }

  static getStatusColor(status: 'online' | 'away' | 'offline'): string {
    switch (status) {
      case 'online': return '#22c55e'
      case 'away': return '#f59e0b' 
      case 'offline': return '#6b7280'
    }
  }

  static async highlightUserSelection(editor: Editor, userId: string, duration = 3000) {
    const collaborator = editor.getCollaborators().find(c => c.userId === userId)
    if (!collaborator || collaborator.selectedShapeIds.length === 0) return

    try {
      const originalSelection = editor.getSelectedShapeIds()
      
      // 临时选中用户的选择
      editor.setSelectedShapes(collaborator.selectedShapeIds)
      
      // 移动视图到选中的形状
      const bounds = editor.getSelectionBounds()
      if (bounds) {
        editor.zoomToBounds(bounds, { 
          animation: { duration: 500 },
          targetZoom: Math.min(editor.getZoomLevel() * 1.2, 2)
        })
      }
      
      // 恢复原始选择
      setTimeout(() => {
        editor.setSelectedShapes(originalSelection)
      }, duration)
      
    } catch (error) {
      console.error('Failed to highlight user selection:', error)
    }
  }

  static createCollaboratorTooltip(collaborator: TLInstancePresence): string {
    const status = this.getUserStatus(collaborator)
    const lastSeen = this.formatLastSeen(collaborator)
    const currentPage = collaborator.currentPageId
    
    return `${collaborator.userName}
状态: ${status === 'online' ? '在线' : status === 'away' ? '离开' : '离线'}
最后活动: ${lastSeen}
当前页面: ${currentPage}
选中项目: ${collaborator.selectedShapeIds.length}个`
  }

  static async shareViewport(editor: Editor) {
    // 获取当前视口信息
    const viewport = editor.getViewportScreenBounds()
    const camera = editor.getCamera()
    const currentPageId = editor.getCurrentPageId()
    
    const shareData = {
      viewport,
      camera, 
      currentPageId,
      timestamp: Date.now(),
      action: 'share-viewport'
    }
    
    // 这里可以通过WebSocket或其他方式分享视口
    console.log('Sharing viewport:', shareData)
    
    // 显示分享反馈
    return shareData
  }
}