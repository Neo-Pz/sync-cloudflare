/**
 * 视窗状态编码/解码工具
 * 用于在URL中记录和恢复精确的视窗位置、缩放等状态
 * 
 * URL格式参考tldraw官网：
 * https://www.tldraw.com/f/roomId?d=v-128.0.1703.932.pageId
 * 
 * 编码格式：v{x}.{y}.{width}.{height}.{pageId}
 * - x: 视窗中心X坐标
 * - y: 视窗中心Y坐标  
 * - width: 视窗宽度
 * - height: 视窗高度
 * - pageId: 当前页面ID（base64编码）
 */

export interface ViewportState {
  x: number
  y: number
  width: number
  height: number
  pageId: string
  zoom?: number
}

/**
 * 将视窗状态编码为URL参数
 */
export function encodeViewportState(state: ViewportState): string {
  const { x, y, width, height, pageId } = state
  
  // 对坐标进行四舍五入，减少URL长度
  const roundedX = Math.round(x * 100) / 100
  const roundedY = Math.round(y * 100) / 100
  const roundedWidth = Math.round(width * 100) / 100
  const roundedHeight = Math.round(height * 100) / 100
  
  // 将pageId编码为base64，但使用URL安全字符
  const encodedPageId = btoa(pageId)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  
  return `v${roundedX}.${roundedY}.${roundedWidth}.${roundedHeight}.${encodedPageId}`
}

/**
 * 从URL参数解码视窗状态
 */
export function decodeViewportState(encoded: string): ViewportState | null {
  try {
    // 检查是否以 'v' 开头
    if (!encoded.startsWith('v')) {
      return null
    }
    
    // 移除 'v' 前缀并分割
    const parts = encoded.slice(1).split('.')
    if (parts.length < 5) {
      return null
    }
    
    const x = parseFloat(parts[0])
    const y = parseFloat(parts[1])
    const width = parseFloat(parts[2])
    const height = parseFloat(parts[3])
    
    // 解码pageId
    let encodedPageId = parts.slice(4).join('.')
    // 恢复base64填充
    const padding = encodedPageId.length % 4
    if (padding) {
      encodedPageId += '='.repeat(4 - padding)
    }
    // 恢复URL安全字符
    encodedPageId = encodedPageId.replace(/-/g, '+').replace(/_/g, '/')
    
    const pageId = atob(encodedPageId)
    
    // 验证数值有效性
    if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
      return null
    }
    
    return {
      x,
      y,
      width,
      height,
      pageId,
      zoom: width > 0 ? 1920 / width : 1 // 估算缩放比例
    }
  } catch (error) {
    console.error('Failed to decode viewport state:', error)
    return null
  }
}

/**
 * 从tldraw编辑器获取当前视窗状态
 */
export function getCurrentViewportState(editor: any): ViewportState | null {
  try {
    if (!editor) {
      return null
    }
    
    // 获取当前视窗信息
    const viewport = editor.getViewportScreenBounds()
    const camera = editor.getCamera()
    const currentPageId = editor.getCurrentPageId()
    
    if (!viewport || !camera || !currentPageId) {
      return null
    }
    
    return {
      x: camera.x,
      y: camera.y,
      width: viewport.w / camera.z,
      height: viewport.h / camera.z,
      pageId: currentPageId,
      zoom: camera.z
    }
  } catch (error) {
    console.error('Failed to get current viewport state:', error)
    return null
  }
}

/**
 * 将视窗状态应用到tldraw编辑器
 */
export function applyViewportState(editor: any, state: ViewportState): boolean {
  try {
    if (!editor || !state) {
      return false
    }
    
    // 切换到指定页面
    if (state.pageId) {
      try {
        const pages = editor.getPages()
        console.log('📄 Available pages:', pages?.map((p: any) => ({ id: p.id, name: p.name })))
        console.log('📄 Target pageId:', state.pageId)
        
        // 直接使用完整的pageId查找页面
        const targetPage = pages.find((p: any) => p.id === state.pageId)
        if (targetPage) {
          editor.setCurrentPage(targetPage.id)
          console.log(`✅ Switched to page by ID:`, targetPage.id)
        } else {
          console.warn('❌ Page not found by ID:', state.pageId)
          console.warn('Available page IDs:', pages?.map((p: any) => p.id))
        }
      } catch (pageError) {
        console.warn('❌ Failed to switch page:', pageError)
      }
    }
    
    // 设置相机位置和缩放 - 延迟确保页面切换完成
    setTimeout(() => {
      try {
        const viewport = editor.getViewportScreenBounds()
        if (viewport && state.zoom) {
          editor.setCamera({
            x: state.x,
            y: state.y,
            z: state.zoom
          })
          console.log('✅ Applied viewport with zoom:', { x: state.x, y: state.y, z: state.zoom })
        } else {
          // 如果没有缩放信息，尝试根据width/height计算
          const currentViewport = editor.getViewportScreenBounds()
          if (currentViewport && state.width > 0) {
            const zoom = currentViewport.w / state.width
            editor.setCamera({
              x: state.x,
              y: state.y,
              z: zoom
            })
            console.log('✅ Applied viewport with calculated zoom:', { x: state.x, y: state.y, z: zoom })
          } else {
            // 使用默认缩放
            editor.setCamera({
              x: state.x,
              y: state.y,
              z: 1
            })
            console.log('✅ Applied viewport with default zoom:', { x: state.x, y: state.y, z: 1 })
          }
        }
      } catch (cameraError) {
        console.warn('❌ Failed to set camera:', cameraError)
      }
    }, 100) // 延迟应用视窗位置，确保页面切换完成
    
    return true
  } catch (error) {
    console.error('Failed to apply viewport state:', error)
    return false
  }
}

/**
 * 生成包含视窗状态的分享链接 V2
 * 新格式: /board/{roomId}.{pageId}.v{x}.{y}.{width}.{height}
 */
export function generateShareUrlWithViewportV2(
  baseUrl: string,
  roomId: string,
  editor: any,
  permission: 'viewer' | 'editor' | 'assist' = 'viewer'
): string {
  const viewportState = getCurrentViewportState(editor)
  
  if (!viewportState) {
    return `${baseUrl}/r/${roomId}`
  }

  const { x, y, width, height, pageId } = viewportState
  
  // 使用查询参数格式
  const params = new URLSearchParams()
  params.set('p', pageId)
  params.set('d', `v${x}.${y}.${width}.${height}`)
  
  return `${baseUrl}/r/${roomId}?${params.toString()}`
}

/**
 * 生成包含视窗状态的分享链接（保持向后兼容）
 */
export function generateShareUrlWithViewport(
  baseUrl: string,
  roomId: string,
  editor: any,
  permission: 'viewer' | 'editor' | 'assist' = 'viewer'
): string {
  // 使用新格式
  return generateShareUrlWithViewportV2(baseUrl, roomId, editor, permission)
}

/**
 * 解析新格式URL并应用视窗状态
 * 格式: /board/{roomId}.{pageId}.v{x}.{y}.{width}.{height}
 */
export function parseCustomUrlAndApply(editor: any): boolean {
  try {
    const match = window.location.pathname.match(/\/board\/([^\.]+)\.([^\.]+)\.v([\d\.-]+)\.([\d\.-]+)\.([\d\.-]+)\.([\d\.-]+)/)
    if (!match) {
      return false
    }

    const [, roomId, pageId, x, y, width, height] = match
    
    // 构建视窗状态
    const viewportState: ViewportState = {
      x: parseFloat(x),
      y: parseFloat(y),
      width: parseFloat(width),
      height: parseFloat(height),
      pageId: pageId,
      zoom: width > 0 ? editor.getViewportScreenBounds()?.w / parseFloat(width) : 1
    }
    
    // 验证数值有效性
    if (isNaN(viewportState.x) || isNaN(viewportState.y) || isNaN(viewportState.width) || isNaN(viewportState.height)) {
      console.warn('Invalid viewport parameters in URL')
      return false
    }
    
    console.log('📍 解析新格式URL中的视窗状态:', viewportState)
    
    // 延迟应用，确保编辑器完全初始化
    setTimeout(() => {
      applyViewportState(editor, viewportState)
    }, 100)
    
    return true
  } catch (error) {
    console.error('Failed to parse custom URL format:', error)
    return false
  }
}

/**
 * 从URL解析并应用视窗状态（保持向后兼容）
 */
export function parseAndApplyViewportFromUrl(editor: any): boolean {
  try {
    // 首先尝试解析新格式
    if (parseCustomUrlAndApply(editor)) {
      return true
    }
    
    // 回退到旧格式
    const urlParams = new URLSearchParams(window.location.search)
    const viewportParam = urlParams.get('d')
    
    if (!viewportParam) {
      return false
    }
    
    const viewportState = decodeViewportState(viewportParam)
    if (!viewportState) {
      return false
    }
    
    console.log('📍 应用URL中的视窗状态（旧格式）:', viewportState)
    
    // 延迟应用，确保编辑器完全初始化
    setTimeout(() => {
      applyViewportState(editor, viewportState)
    }, 100)
    
    return true
  } catch (error) {
    console.error('Failed to parse and apply viewport from URL:', error)
    return false
  }
}

/**
 * 示例用法：
 * 
 * // 获取当前视窗状态
 * const state = getCurrentViewportState(editor)
 * console.log(state) // { x: -128, y: 0, width: 1703, height: 932, pageId: 'page:abc123' }
 * 
 * // 生成新格式分享链接
 * const shareUrl = generateShareUrlWithViewportV2('https://example.com', 'room123', editor, 'viewer')
 * console.log(shareUrl) // 输出: https://example.com/board/room123.page:abc123.v-128.0.1703.932
 * 
 * // 解析新格式URL并应用视窗状态
 * // URL: /board/room123.page:abc123.v-128.0.1703.932
 * parseCustomUrlAndApply(editor) // 自动切换到指定页面和视窗位置
 * 
 * // 向后兼容的函数会自动选择合适的格式
 * parseAndApplyViewportFromUrl(editor) // 支持新旧两种格式
 */