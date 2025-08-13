/**
 * 分享链接生成器
 * 统一管理分享链接的生成逻辑，确保格式一致性
 */
import { Editor } from 'tldraw'
import { getCurrentViewportState } from './viewportUtils'

export interface ShareLinkOptions {
  includeViewport?: boolean
  includePageId?: boolean
  usePageIndex?: boolean // 是否使用页面索引而不是页面ID
}

export interface ViewportInfo {
  x: number
  y: number
  width: number
  height: number
}

export interface PageInfo {
  id: string
  name: string
  index: number
}

/**
 * 分享链接生成器类
 */
export class ShareLinkGenerator {
  
  /**
   * 生成完整的分享链接
   * 格式: /r/{roomId}?p={pageId}&d=v{x}.{y}.{width}.{height}
   */
  static generateShareLink(
    roomId: string,
    editor?: Editor,
    options: ShareLinkOptions = {}
  ): string {
    const {
      includeViewport = true,
      includePageId = true,
      usePageIndex = false
    } = options

    console.log('🔗 ShareLinkGenerator: Generating share link for room:', roomId)
    
    const baseUrl = window.location.origin
    let shareUrl = `${baseUrl}/r/${roomId}`
    const params = new URLSearchParams()

    // 获取页面信息
    if (includePageId && editor) {
      try {
        const pageInfo = this.getCurrentPageInfo(editor)
        if (pageInfo) {
          if (usePageIndex) {
            // 使用页面索引 (从0开始)
            params.set('p', pageInfo.index.toString())
            console.log('📄 Added page index:', pageInfo.index)
          } else {
            // 使用页面ID
            params.set('p', pageInfo.id)
            console.log('📄 Added page ID:', pageInfo.id)
          }
        }
      } catch (error) {
        console.warn('❌ Failed to get page info:', error)
      }
    }

    // 获取视窗信息
    if (includeViewport && editor) {
      try {
        const viewport = this.getCurrentViewport(editor)
        if (viewport) {
          const viewportStr = `v${viewport.x}.${viewport.y}.${viewport.width}.${viewport.height}`
          params.set('d', viewportStr)
          console.log('🎯 Added viewport:', viewportStr)
        }
      } catch (error) {
        console.warn('❌ Failed to get viewport info:', error)
      }
    }

    // 组合最终URL
    if (params.toString()) {
      shareUrl += '?' + params.toString()
    }

    console.log('✅ Generated share link:', shareUrl)
    return shareUrl
  }

  /**
   * 获取当前页面信息
   */
  static getCurrentPageInfo(editor: Editor): PageInfo | null {
    try {
      const currentPage = editor.getCurrentPage()
      const pages = editor.getPages()
      
      if (!currentPage || !pages) {
        console.warn('⚠️ No current page or pages found')
        return null
      }

      const pageIndex = pages.findIndex(page => page.id === currentPage.id)
      
      return {
        id: currentPage.id,
        name: currentPage.name,
        index: pageIndex >= 0 ? pageIndex : 0
      }
    } catch (error) {
      console.error('❌ Error getting current page info:', error)
      return null
    }
  }

  /**
   * 获取当前视窗信息
   */
  static getCurrentViewport(editor: Editor): ViewportInfo | null {
    try {
      const viewportState = getCurrentViewportState(editor)
      
      if (!viewportState) {
        console.warn('⚠️ No viewport state available')
        return null
      }

      // 验证视窗数据的有效性
      if (typeof viewportState.x !== 'number' || isNaN(viewportState.x) ||
          typeof viewportState.y !== 'number' || isNaN(viewportState.y) ||
          typeof viewportState.width !== 'number' || isNaN(viewportState.width) ||
          typeof viewportState.height !== 'number' || isNaN(viewportState.height)) {
        console.warn('⚠️ Invalid viewport data:', viewportState)
        return null
      }

      return {
        x: Math.round(viewportState.x),
        y: Math.round(viewportState.y),
        width: Math.round(viewportState.width),
        height: Math.round(viewportState.height)
      }
    } catch (error) {
      console.error('❌ Error getting viewport info:', error)
      return null
    }
  }

  /**
   * 生成基本分享链接（仅房间ID）
   */
  static generateBasicShareLink(roomId: string): string {
    const baseUrl = window.location.origin
    return `${baseUrl}/r/${roomId}`
  }

  /**
   * 生成带页面的分享链接
   */
  static generatePageShareLink(roomId: string, pageId: string): string {
    const baseUrl = window.location.origin
    return `${baseUrl}/r/${roomId}?p=${encodeURIComponent(pageId)}`
  }

  /**
   * 生成带视窗的分享链接
   */
  static generateViewportShareLink(
    roomId: string, 
    pageId: string, 
    viewport: ViewportInfo
  ): string {
    const baseUrl = window.location.origin
    const params = new URLSearchParams()
    
    params.set('p', pageId)
    params.set('d', `v${viewport.x}.${viewport.y}.${viewport.width}.${viewport.height}`)
    
    return `${baseUrl}/r/${roomId}?${params.toString()}`
  }

  /**
   * 解析分享链接
   */
  static parseShareLink(url: string): {
    roomId: string | null
    pageId: string | null
    viewport: ViewportInfo | null
    isValid: boolean
  } {
    try {
      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split('/')
      
      // 检查路径格式 /r/{roomId}
      if (pathParts.length >= 3 && pathParts[1] === 'r') {
        const roomId = pathParts[2]
        const params = urlObj.searchParams
        
        const pageId = params.get('p')
        const viewportStr = params.get('d')
        
        let viewport: ViewportInfo | null = null
        if (viewportStr && viewportStr.startsWith('v')) {
          const coords = viewportStr.substring(1).split('.')
          if (coords.length === 4) {
            const [x, y, width, height] = coords.map(Number)
            if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
              viewport = { x, y, width, height }
            }
          }
        }
        
        return {
          roomId,
          pageId,
          viewport,
          isValid: true
        }
      }
      
      return {
        roomId: null,
        pageId: null,
        viewport: null,
        isValid: false
      }
    } catch (error) {
      console.error('❌ Error parsing share link:', error)
      return {
        roomId: null,
        pageId: null,
        viewport: null,
        isValid: false
      }
    }
  }

  /**
   * 验证分享链接格式
   */
  static validateShareLink(url: string): boolean {
    const parsed = this.parseShareLink(url)
    return parsed.isValid && parsed.roomId !== null
  }

  /**
   * 复制分享链接到剪贴板
   */
  static async copyShareLink(shareLink: string): Promise<boolean> {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareLink)
        console.log('✅ Share link copied to clipboard')
        return true
      } else {
        // 备用方案：使用传统方法
        const textArea = document.createElement('textarea')
        textArea.value = shareLink
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        
        const successful = document.execCommand('copy')
        document.body.removeChild(textArea)
        
        if (successful) {
          console.log('✅ Share link copied to clipboard (fallback)')
          return true
        } else {
          console.warn('❌ Failed to copy to clipboard')
          return false
        }
      }
    } catch (error) {
      console.error('❌ Error copying to clipboard:', error)
      return false
    }
  }

  /**
   * 生成二维码数据URL
   */
  static generateQRCode(shareLink: string, size: number = 200): string {
    // 这里可以集成二维码生成库，目前返回占位符
    // 实际实现时可以使用 qrcode.js 或类似库
    console.log('📱 QR Code requested for:', shareLink)
    
    // 返回一个简单的SVG二维码占位符
    const svg = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="white"/>
        <rect x="20" y="20" width="20" height="20" fill="black"/>
        <rect x="60" y="20" width="20" height="20" fill="black"/>
        <rect x="100" y="20" width="20" height="20" fill="black"/>
        <rect x="140" y="20" width="20" height="20" fill="black"/>
        <text x="${size/2}" y="${size/2}" text-anchor="middle" font-size="12" fill="black">QR Code</text>
        <text x="${size/2}" y="${size/2 + 20}" text-anchor="middle" font-size="10" fill="gray">分享链接</text>
      </svg>
    `
    
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
  }
}

/**
 * React Hook 用于生成分享链接
 */
export function useShareLink(roomId: string, editor?: Editor, options?: ShareLinkOptions) {
  const [shareLink, setShareLink] = React.useState<string>('')
  const [isGenerating, setIsGenerating] = React.useState(false)

  const generateLink = React.useCallback(() => {
    setIsGenerating(true)
    try {
      const link = ShareLinkGenerator.generateShareLink(roomId, editor, options)
      setShareLink(link)
    } catch (error) {
      console.error('Error generating share link:', error)
      setShareLink(ShareLinkGenerator.generateBasicShareLink(roomId))
    } finally {
      setIsGenerating(false)
    }
  }, [roomId, editor, options])

  const copyToClipboard = React.useCallback(async () => {
    if (shareLink) {
      return await ShareLinkGenerator.copyShareLink(shareLink)
    }
    return false
  }, [shareLink])

  React.useEffect(() => {
    if (roomId) {
      generateLink()
    }
  }, [generateLink])

  return {
    shareLink,
    isGenerating,
    generateLink,
    copyToClipboard
  }
}

// 添加 React import（如果需要）
import * as React from 'react'