/**
 * 静态缩略图生成器
 * 专门为画廊提供快速加载的静态缩略图
 */
import { Editor, TLPageId } from 'tldraw'

export interface StaticThumbnailOptions {
  width?: number
  height?: number
  quality?: number
  format?: 'png' | 'jpeg' | 'webp'
}

/**
 * 生成优化的静态缩略图
 * 使用较小的尺寸和压缩来提高加载速度
 */
export async function generateStaticThumbnail(
  editor: Editor,
  pageId: TLPageId,
  options: StaticThumbnailOptions = {}
): Promise<string> {
  const { width = 160, height = 120, quality = 0.7, format = 'jpeg' } = options

  try {
    // 保存当前状态
    const originalPageId = editor.getCurrentPageId()
    
    // 切换到目标页面
    if (pageId !== originalPageId) {
      editor.setCurrentPage(pageId)
    }
    
    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // 获取页面形状
    const shapeIds = editor.getCurrentPageShapeIds()
    
    if (shapeIds.size === 0) {
      // 恢复状态
      if (pageId !== originalPageId) {
        editor.setCurrentPage(originalPageId)
      }
      return generateStaticPlaceholder(width, height, 'empty')
    }
    
    let blob: Blob | null = null
    
    try {
      // 使用较小的scale来减少文件大小
      const exportOptions = {
        format: format,
        ids: [...shapeIds],
        scale: 0.5, // 使用较小的scale
        background: true,
        padding: 8
      }

      if (typeof editor.exportToBlob === 'function') {
        blob = await editor.exportToBlob(exportOptions)
      } else if (typeof editor.toImage === 'function') {
        blob = await editor.toImage([...shapeIds], exportOptions)
      }
    } catch (error) {
      console.warn('导出缩略图失败，使用备用方案:', error)
      blob = null
    }
    
    // 恢复状态
    if (pageId !== originalPageId) {
      editor.setCurrentPage(originalPageId)
    }
    
    if (!blob) {
      return generateStaticPlaceholder(width, height, 'error')
    }
    
    // 使用Canvas进一步优化图片
    return optimizeImageBlob(blob, width, height, quality, format)
    
  } catch (error) {
    console.error('生成静态缩略图失败:', error)
    return generateStaticPlaceholder(width, height, 'error')
  }
}

/**
 * 优化图片blob，调整尺寸和质量
 */
async function optimizeImageBlob(
  blob: Blob, 
  width: number, 
  height: number, 
  quality: number,
  format: 'png' | 'jpeg' | 'webp'
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      if (!ctx) {
        resolve(generateStaticPlaceholder(width, height, 'error'))
        return
      }
      
      canvas.width = width
      canvas.height = height
      
      // 计算适合的绘制尺寸，保持宽高比
      const imgAspect = img.width / img.height
      const canvasAspect = width / height
      
      let drawWidth, drawHeight, drawX, drawY
      
      if (imgAspect > canvasAspect) {
        // 图片更宽，以高度为准
        drawHeight = height
        drawWidth = height * imgAspect
        drawX = (width - drawWidth) / 2
        drawY = 0
      } else {
        // 图片更高，以宽度为准
        drawWidth = width
        drawHeight = width / imgAspect
        drawX = 0
        drawY = (height - drawHeight) / 2
      }
      
      // 绘制白色背景
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      
      // 绘制图片
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)
      
      // 导出为指定格式
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 
                      format === 'webp' ? 'image/webp' : 'image/png'
      
      resolve(canvas.toDataURL(mimeType, quality))
    }
    
    img.onerror = () => {
      resolve(generateStaticPlaceholder(width, height, 'error'))
    }
    
    // 获取blob URL
    const actualBlob = (blob as any)?.blob || blob
    img.src = URL.createObjectURL(actualBlob)
  })
}

/**
 * 生成静态占位符缩略图
 */
export function generateStaticPlaceholder(
  width: number = 160, 
  height: number = 120, 
  type: 'empty' | 'error' | 'loading' = 'empty'
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  
  if (!ctx) return ''
  
  // 根据类型设置不同的样式
  const styles = {
    empty: {
      bg: '#f8fafc',
      border: '#e2e8f0',
      icon: '📄',
      text: '空白页面',
      color: '#64748b'
    },
    error: {
      bg: '#fef2f2',
      border: '#fecaca',
      icon: '⚠️',
      text: '加载失败',
      color: '#dc2626'
    },
    loading: {
      bg: '#f0f9ff',
      border: '#bae6fd',
      icon: '⏳',
      text: '加载中...',
      color: '#0284c7'
    }
  }
  
  const style = styles[type]
  
  // 绘制背景
  ctx.fillStyle = style.bg
  ctx.fillRect(0, 0, width, height)
  
  // 绘制边框
  ctx.strokeStyle = style.border
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1)
  
  // 绘制网格（更精细）
  ctx.strokeStyle = style.border
  ctx.lineWidth = 0.5
  for (let x = 0; x <= width; x += 20) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = 0; y <= height; y += 20) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  
  // 绘制中心内容
  ctx.fillStyle = style.color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  
  // 绘制图标
  ctx.font = `${Math.min(width, height) / 6}px system-ui`
  ctx.fillText(style.icon, width / 2, height / 2 - 10)
  
  // 绘制文字（如果空间足够）
  if (height > 80) {
    ctx.font = `${Math.min(width, height) / 12}px system-ui`
    ctx.fillText(style.text, width / 2, height / 2 + 15)
  }
  
  return canvas.toDataURL('image/jpeg', 0.8)
}

/**
 * 为房间生成基于ID的默认缩略图
 * 每个房间都有独特的视觉标识
 */
export function generateRoomDefaultThumbnail(
  roomId: string,
  roomName: string = '',
  width: number = 160,
  height: number = 120
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  
  if (!ctx) return ''
  
  // 基于房间ID生成固定的颜色和图案
  const hash = roomId.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0)
    return a & a
  }, 0)
  
  const colorIndex = Math.abs(hash) % 6
  const colors = [
    { primary: '#3b82f6', secondary: '#dbeafe', accent: '#1d4ed8' },
    { primary: '#ef4444', secondary: '#fee2e2', accent: '#dc2626' },
    { primary: '#10b981', secondary: '#d1fae5', accent: '#059669' },
    { primary: '#f59e0b', secondary: '#fef3c7', accent: '#d97706' },
    { primary: '#8b5cf6', secondary: '#ede9fe', accent: '#7c3aed' },
    { primary: '#06b6d4', secondary: '#cffafe', accent: '#0891b2' }
  ]
  
  const color = colors[colorIndex]
  
  // 绘制渐变背景
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, color.secondary)
  gradient.addColorStop(1, '#ffffff')
  
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  
  // 绘制网格
  ctx.strokeStyle = color.primary + '20'
  ctx.lineWidth = 1
  for (let x = 0; x <= width; x += 15) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = 0; y <= height; y += 15) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  
  // 绘制几何图案
  const patternType = Math.abs(hash >> 8) % 4
  ctx.fillStyle = color.primary + '80'
  
  switch (patternType) {
    case 0: // 圆形
      ctx.beginPath()
      ctx.arc(width * 0.3, height * 0.3, width * 0.15, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(width * 0.7, height * 0.7, width * 0.1, 0, Math.PI * 2)
      ctx.fill()
      break
    case 1: // 矩形
      ctx.fillRect(width * 0.2, height * 0.2, width * 0.3, height * 0.25)
      ctx.fillRect(width * 0.55, height * 0.55, width * 0.25, height * 0.2)
      break
    case 2: // 三角形
      ctx.beginPath()
      ctx.moveTo(width * 0.3, height * 0.2)
      ctx.lineTo(width * 0.5, height * 0.5)
      ctx.lineTo(width * 0.1, height * 0.5)
      ctx.fill()
      break
    case 3: // 线条
      ctx.strokeStyle = color.primary
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(width * 0.2, height * 0.3)
      ctx.quadraticCurveTo(width * 0.5, height * 0.1, width * 0.8, height * 0.4)
      ctx.stroke()
      break
  }
  
  // 绘制房间名称首字母（如果有）
  if (roomName) {
    const firstChar = roomName.charAt(0).toUpperCase()
    ctx.fillStyle = color.accent
    ctx.font = `bold ${width / 8}px system-ui`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // 绘制背景圆
    ctx.beginPath()
    ctx.arc(width * 0.85, height * 0.15, width * 0.08, 0, Math.PI * 2)
    ctx.fillStyle = color.primary
    ctx.fill()
    
    // 绘制字母
    ctx.fillStyle = '#ffffff'
    ctx.fillText(firstChar, width * 0.85, height * 0.15)
  }
  
  return canvas.toDataURL('image/jpeg', 0.85)
}

/**
 * 缓存管理
 */
export class ThumbnailCache {
  private static readonly CACHE_PREFIX = 'static-thumbnail-'
  private static readonly MAX_CACHE_SIZE = 50 // 最多缓存50个缩略图
  
  static set(key: string, thumbnail: string): void {
    try {
      const cacheKey = this.CACHE_PREFIX + key
      localStorage.setItem(cacheKey, thumbnail)
      
      // 更新缓存列表
      this.updateCacheList(key)
    } catch (error) {
      console.warn('缓存缩略图失败:', error)
      // 如果存储空间不足，清理旧缓存
      this.cleanup()
    }
  }
  
  static get(key: string): string | null {
    try {
      const cacheKey = this.CACHE_PREFIX + key
      return localStorage.getItem(cacheKey)
    } catch (error) {
      console.warn('读取缓存缩略图失败:', error)
      return null
    }
  }
  
  static remove(key: string): void {
    try {
      const cacheKey = this.CACHE_PREFIX + key
      localStorage.removeItem(cacheKey)
      this.removeCacheList(key)
    } catch (error) {
      console.warn('删除缓存缩略图失败:', error)
    }
  }
  
  private static updateCacheList(key: string): void {
    try {
      const listKey = this.CACHE_PREFIX + 'list'
      const existingList = JSON.parse(localStorage.getItem(listKey) || '[]')
      
      // 移除旧的记录（如果存在）
      const filtered = existingList.filter((item: any) => item.key !== key)
      
      // 添加新记录
      filtered.push({ key, timestamp: Date.now() })
      
      // 限制缓存数量
      const limited = filtered
        .sort((a: any, b: any) => b.timestamp - a.timestamp)
        .slice(0, this.MAX_CACHE_SIZE)
      
      localStorage.setItem(listKey, JSON.stringify(limited))
    } catch (error) {
      console.warn('更新缓存列表失败:', error)
    }
  }
  
  private static removeCacheList(key: string): void {
    try {
      const listKey = this.CACHE_PREFIX + 'list'
      const existingList = JSON.parse(localStorage.getItem(listKey) || '[]')
      const filtered = existingList.filter((item: any) => item.key !== key)
      localStorage.setItem(listKey, JSON.stringify(filtered))
    } catch (error) {
      console.warn('更新缓存列表失败:', error)
    }
  }
  
  private static cleanup(): void {
    try {
      const listKey = this.CACHE_PREFIX + 'list'
      const existingList = JSON.parse(localStorage.getItem(listKey) || '[]')
      
      // 按时间排序，删除最旧的缓存
      const sorted = existingList.sort((a: any, b: any) => a.timestamp - b.timestamp)
      const toRemove = sorted.slice(0, Math.max(1, sorted.length - this.MAX_CACHE_SIZE + 10))
      
      toRemove.forEach((item: any) => {
        localStorage.removeItem(this.CACHE_PREFIX + item.key)
      })
      
      // 更新列表
      const remaining = sorted.slice(toRemove.length)
      localStorage.setItem(listKey, JSON.stringify(remaining))
    } catch (error) {
      console.warn('清理缓存失败:', error)
    }
  }
}