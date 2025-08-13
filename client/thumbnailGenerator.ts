import { Editor, TLPageId } from 'tldraw'

export interface ThumbnailOptions {
  pageId?: TLPageId
  width?: number
  height?: number
  scale?: number
  background?: boolean
}

/**
 * 使用 tldraw 小地图功能生成页面缩略图
 */
export async function generatePageThumbnail(
  editor: Editor,
  pageId: TLPageId,
  options: ThumbnailOptions = {}
): Promise<string> {
  const { width = 200, height = 150, scale = 0.3, background = true } = options

  try {
    // 保存当前状态
    const originalPageId = editor.getCurrentPageId()
    const originalSelection = editor.getSelectedShapeIds()
    
    // 切换到目标页面
    if (pageId !== originalPageId) {
      editor.setCurrentPage(pageId)
    }
    
    // 等待页面加载完成
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // 获取页面的所有形状
    const shapeIds = editor.getCurrentPageShapeIds()
    
    if (shapeIds.size === 0) {
      // 恢复原始状态
      if (pageId !== originalPageId) {
        editor.setCurrentPage(originalPageId)
      }
      return generateDefaultThumbnail(width, height)
    }
    
    // 生成缩略图 - 使用正确的 tldraw API
    let blob: Blob | null = null
    
    try {
      // 调试：查看 editor 对象有哪些方法
      console.log('Available editor methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(editor)).filter(name => typeof editor[name] === 'function'))
      
      // 尝试使用 exportToBlob 方法
      if (typeof editor.exportToBlob === 'function') {
        console.log('Using exportToBlob')
        blob = await editor.exportToBlob({
          format: 'png',
          ids: [...shapeIds],
          scale: scale,
          background: background,
          padding: 16
        })
      }
      // 备用方法：使用 toImage
      else if (typeof editor.toImage === 'function') {
        console.log('Using toImage')
        blob = await editor.toImage([...shapeIds], {
          format: 'png',
          background: background,
          scale: scale,
          padding: 16
        })
      }
      // 尝试使用 getSvg 方法
      else if (typeof editor.getSvg === 'function') {
        console.log('Using getSvg fallback')
        const svg = await editor.getSvg([...shapeIds], {
          scale: scale,
          background: background,
          padding: 16
        })
        if (svg) {
          // 将 SVG 转换为 canvas 然后转为 blob
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          const img = new Image()
          
          blob = await new Promise((resolve) => {
            img.onload = () => {
              canvas.width = width
              canvas.height = height
              ctx?.drawImage(img, 0, 0, width, height)
              canvas.toBlob(resolve, 'image/png')
            }
            img.src = 'data:image/svg+xml;base64,' + btoa(svg.outerHTML)
          })
        }
      }
      // 如果都不可用
      else {
        console.warn('No suitable export method available')
        blob = null
      }
    } catch (error) {
      console.warn('缩略图生成方法调用失败，使用备用方案:', error)
      blob = null
    }
    
    // 恢复原始状态
    if (pageId !== originalPageId) {
      editor.setCurrentPage(originalPageId)
    }
    editor.setSelectedShapes([...originalSelection])
    
    if (!blob) {
      return generateDefaultThumbnail(width, height)
    }
    
    // 转换为 data URL
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      // 检查 blob 结构，有些 API 返回 { blob: Blob } 对象
      const actualBlob = (blob as any)?.blob || blob
      reader.readAsDataURL(actualBlob)
    })
    
  } catch (error) {
    console.error('生成缩略图失败:', error)
    return generateDefaultThumbnail(width, height)
  }
}

/**
 * 生成所有页面的缩略图
 */
export async function generateAllPageThumbnails(
  editor: Editor,
  options: ThumbnailOptions = {}
): Promise<{ pageId: TLPageId; name: string; thumbnail: string }[]> {
  const pages = editor.getPages()
  const results: { pageId: TLPageId; name: string; thumbnail: string }[] = []
  
  for (const page of pages) {
    const thumbnail = await generatePageThumbnail(editor, page.id, options)
    results.push({
      pageId: page.id,
      name: page.name,
      thumbnail
    })
  }
  
  return results
}

/**
 * 生成默认缩略图
 */
export function generateDefaultThumbnail(width: number = 200, height: number = 150): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  
  if (!ctx) return ''
  
  // 绘制默认背景
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, width, height)
  
  // 绘制边框
  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, width - 2, height - 2)
  
  // 绘制图标
  ctx.fillStyle = '#64748b'
  ctx.font = '24px system-ui'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('📝', width / 2, height / 2)
  
  return canvas.toDataURL('image/png')
}