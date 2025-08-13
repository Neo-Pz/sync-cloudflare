// 新的URL格式工具
// 格式: board/{roomid}.{pageid}.v{x}.{y}.{width}.{height}

export interface ViewportInfo {
  x: number
  y: number
  width: number
  height: number
}

export interface BoardUrlParts {
  roomId: string
  pageId?: string
  viewport?: ViewportInfo
}

export class BoardUrlUtils {
  // 生成board URL
  static generateBoardUrl(
    roomId: string, 
    pageId?: string, 
    viewport?: ViewportInfo
  ): string {
    const baseUrl = window.location.origin
    let path = `/r/${roomId}`
    
    // 添加页面ID（处理特殊字符）
    if (pageId && pageId !== 'default') {
      // 对页面ID进行URL编码，替换特殊字符
      const encodedPageId = pageId.replace(/[:.]/g, '_')
      path += `.${encodedPageId}`
    }
    
    // 添加视窗信息（确保所有值都是有效数字）
    if (viewport && 
        typeof viewport.x === 'number' && !isNaN(viewport.x) &&
        typeof viewport.y === 'number' && !isNaN(viewport.y) &&
        typeof viewport.width === 'number' && !isNaN(viewport.width) &&
        typeof viewport.height === 'number' && !isNaN(viewport.height)) {
      path += `.v${viewport.x}.${viewport.y}.${viewport.width}.${viewport.height}`
    }
    
    return `${baseUrl}${path}`
  }
  
  // 解析board URL
  static parseBoardUrl(url: string): BoardUrlParts | null {
    try {
      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split('/')
      
      if (pathParts[1] !== 'board' || !pathParts[2]) {
        return null
      }
      
      const boardPart = pathParts[2]
      return this.parseBoardPath(boardPart)
    } catch (error) {
      console.error('Failed to parse board URL:', error)
      return null
    }
  }
  
  // 解析board路径部分
  static parseBoardPath(boardPath: string): BoardUrlParts | null {
    try {
      // 分割路径：roomId.pageId.v{x}.{y}.{width}.{height}
      const parts = boardPath.split('.')
      
      if (parts.length < 1) {
        return null
      }
      
      const result: BoardUrlParts = {
        roomId: parts[0]
      }
      
      let currentIndex = 1
      
      // 检查是否有视窗信息（以v开头）
      const viewportIndex = parts.findIndex(part => part.startsWith('v'))
      
      if (viewportIndex > 1) {
        // 有页面ID，解码特殊字符
        const encodedPageId = parts.slice(1, viewportIndex).join('.')
        result.pageId = encodedPageId.replace(/_/g, ':') // 恢复原始页面ID
        currentIndex = viewportIndex
      } else if (viewportIndex === 1) {
        // 没有页面ID，直接是视窗
        currentIndex = viewportIndex
      } else if (parts.length > 1) {
        // 没有视窗信息，但有页面ID
        const encodedPageId = parts.slice(1).join('.')
        result.pageId = encodedPageId.replace(/_/g, ':') // 恢复原始页面ID
      }
      
      // 解析视窗信息
      if (viewportIndex >= 0 && currentIndex + 3 < parts.length) {
        const vPart = parts[currentIndex]
        const x = parseFloat(vPart.substring(1)) // 去掉'v'前缀
        const y = parseFloat(parts[currentIndex + 1])
        const width = parseFloat(parts[currentIndex + 2])
        const height = parseFloat(parts[currentIndex + 3])
        
        if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
          result.viewport = { x, y, width, height }
        }
      }
      
      return result
    } catch (error) {
      console.error('Failed to parse board path:', error)
      return null
    }
  }
  
  // 从当前URL获取board信息
  static getCurrentBoardInfo(): BoardUrlParts | null {
    return this.parseBoardUrl(window.location.href)
  }
  
  // 更新当前URL的视窗信息
  static updateCurrentViewport(viewport: ViewportInfo): void {
    const current = this.getCurrentBoardInfo()
    if (!current) return
    
    const newUrl = this.generateBoardUrl(current.roomId, current.pageId, viewport)
    window.history.replaceState({}, '', newUrl)
  }
  
  // 生成分享链接（包含当前视窗）
  static generateShareUrl(roomId: string, pageId?: string, viewport?: ViewportInfo): string {
    return this.generateBoardUrl(roomId, pageId, viewport)
  }
  
  // 检查URL是否为board格式
  static isBoardUrl(url: string): boolean {
    try {
      const urlObj = new URL(url)
      return urlObj.pathname.startsWith('/r/') || urlObj.pathname.startsWith('/board/')
    } catch {
      return false
    }
  }
  
  // 从URL中提取房间ID
  static getRoomIdFromUrl(url: string): string | null {
    const boardInfo = this.parseBoardUrl(url)
    return boardInfo?.roomId || null
  }
  
  // 从URL中提取页面ID
  static getPageIdFromUrl(url: string): string | null {
    const boardInfo = this.parseBoardUrl(url)
    return boardInfo?.pageId || null
  }
  
  // 从URL中提取视窗信息
  static getViewportFromUrl(url: string): ViewportInfo | null {
    const boardInfo = this.parseBoardUrl(url)
    return boardInfo?.viewport || null
  }
}

// 使用示例和测试
/*
// 生成URL
const url1 = BoardUrlUtils.generateBoardUrl('room123')
// 结果: https://domain.com/board/room123

const url2 = BoardUrlUtils.generateBoardUrl('room123', 'home')
// 结果: https://domain.com/board/room123.home

const url3 = BoardUrlUtils.generateBoardUrl('room123', 'home', {x: 100, y: 200, width: 800, height: 600})
// 结果: https://domain.com/board/room123.home.v100.200.800.600

// 解析URL
const parsed1 = BoardUrlUtils.parseBoardUrl('https://domain.com/board/room123')
// 结果: { roomId: 'room123' }

const parsed2 = BoardUrlUtils.parseBoardUrl('https://domain.com/board/room123.home')
// 结果: { roomId: 'room123', pageId: 'home' }

const parsed3 = BoardUrlUtils.parseBoardUrl('https://domain.com/board/room123.home.v100.200.800.600')
// 结果: { roomId: 'room123', pageId: 'home', viewport: {x: 100, y: 200, width: 800, height: 600} }

// 复杂页面ID测试
const url4 = BoardUrlUtils.generateBoardUrl('room123', 'folder.subfolder.page')
// 结果: https://domain.com/board/room123.folder.subfolder.page

const parsed4 = BoardUrlUtils.parseBoardUrl('https://domain.com/board/room123.folder.subfolder.page.v0.0.1920.1080')
// 结果: { roomId: 'room123', pageId: 'folder.subfolder.page', viewport: {x: 0, y: 0, width: 1920, height: 1080} }
*/