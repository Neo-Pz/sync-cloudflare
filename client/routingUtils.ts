/**
 * Semantic Routing System for TLDraw Rooms
 * 
 * This file provides utilities for managing semantic URLs for different types of rooms.
 * 
 * Supported Route Patterns:
 * 
 * 1. Gallery Rooms: /galleries/:gallerySlug/rooms/:roomSlug
 *    - Example: /galleries/impressionism/rooms/east-wing
 *    - Room ID format: gallery-impressionism-east-wing
 *    - Use case: Thematic collections, art galleries, curated spaces
 * 
 * 2. User Rooms: /users/:userSlug/rooms/:roomSlug  
 *    - Example: /users/john-doe/rooms/my-project
 *    - Room ID format: user-john-doe-my-project
 *    - Use case: Personal workspaces, user portfolios
 * 
 * 3. Plaza Rooms: /plaza/:roomSlug
 *    - Example: /plaza/shared-canvas
 *    - Room ID format: plaza-shared-canvas
 *    - Use case: Public collaboration spaces, featured rooms
 * 
 * 4. Workspace Rooms: /workspace/:roomSlug
 *    - Example: /workspace/team-brainstorm
 *    - Room ID format: workspace-team-brainstorm
 *    - Use case: Team collaboration, project spaces
 * 
 * 5. Direct Rooms: /rooms/:roomId (Legacy support)
 *    - Example: /rooms/abc123def456
 *    - Room ID format: abc123def456 (as-is)
 *    - Use case: Direct access, legacy URLs, unstructured room IDs
 */

export interface ParsedRoute {
  type: 'gallery' | 'user' | 'plaza' | 'workspace' | 'direct' | 'default' | 'board' | 'snapshot' | 'plaza-list'
  roomId: string
  displayPath: string
  gallerySlug?: string
  userSlug?: string  
  roomSlug?: string
  pageId?: string
  viewport?: { x: number, y: number, width: number, height: number }
}

export interface RoomMetadata {
  routeType?: 'gallery' | 'user' | 'plaza' | 'workspace'
  slug?: string
  gallerySlug?: string
  userSlug?: string
  name?: string
  [key: string]: any
}

/**
 * Parse a URL path into route information
 */
export function parseRoute(path: string): ParsedRoute {
  console.log('🔍 parseRoute called with path:', path)
  
  // Board URL: /board/roomId[.pageIndex][.v0.0.800.600] (支持简单数字索引)
  const boardMatch = path.match(/^\/board\/(.+)\/?$/)
  if (boardMatch) {
    const boardPath = boardMatch[1]
    
    // Parse board path components
    const parts = boardPath.split('.')
    if (parts.length >= 1) {
      const roomId = parts[0]
      let pageId = undefined
      let viewport = undefined
      
      // Find viewport information (starts with 'v')
      const viewportIndex = parts.findIndex(part => part.startsWith('v'))
      
      // 解析页面索引：/board/roomId[.pageIndex][.vx.y.w.h]
      if (viewportIndex > 1) {
        // 有页面索引，位于roomId和viewport之间
        const pageIndexStr = parts[1]
        const pageIndex = parseInt(pageIndexStr, 10)
        if (!isNaN(pageIndex)) {
          pageId = `page:${pageIndex}`
        }
      } else if (parts.length > 1 && viewportIndex === -1) {
        // 没有viewport信息，但可能有页面索引
        const pageIndexStr = parts[1]
        const pageIndex = parseInt(pageIndexStr, 10)
        if (!isNaN(pageIndex)) {
          pageId = `page:${pageIndex}`
        }
      }
      
      // Parse viewport information
      if (viewportIndex >= 1 && viewportIndex + 3 <= parts.length) {
        const vPart = parts[viewportIndex]
        const x = parseFloat(vPart.substring(1)) // Remove 'v' prefix
        const y = parseFloat(parts[viewportIndex + 1])
        const width = parseFloat(parts[viewportIndex + 2])
        const height = parseFloat(parts[viewportIndex + 3])
        
        if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
          viewport = { x, y, width, height }
        }
      }
      
      return {
        type: 'board',
        roomId: roomId,
        pageId: pageId,
        viewport: viewport,
        displayPath: path
      }
    }
  }
  
  // Gallery room: /galleries/impressionism/rooms/east-wing
  const galleryMatch = path.match(/^\/galleries\/([^/]+)\/rooms\/([^/]+)\/?$/)
  if (galleryMatch) {
    return {
      type: 'gallery',
      gallerySlug: galleryMatch[1],
      roomSlug: galleryMatch[2],
      roomId: `gallery-${galleryMatch[1]}-${galleryMatch[2]}`,
      displayPath: `/galleries/${galleryMatch[1]}/rooms/${galleryMatch[2]}`
    }
  }
  
  // User room: /users/john-doe/rooms/my-project
  const userMatch = path.match(/^\/users\/([^/]+)\/rooms\/([^/]+)\/?$/)
  if (userMatch) {
    return {
      type: 'user',
      userSlug: userMatch[1],
      roomSlug: userMatch[2], 
      roomId: `user-${userMatch[1]}-${userMatch[2]}`,
      displayPath: `/users/${userMatch[1]}/rooms/${userMatch[2]}`
    }
  }
  
  // Plaza list: /plaza (no room slug)
  const plazaListMatch = path.match(/^\/plaza\/?$/)
  if (plazaListMatch) {
    return {
      type: 'plaza-list',
      roomId: 'plaza-list',
      displayPath: '/plaza'
    }
  }
  
  // Plaza room: /plaza/shared-canvas
  const plazaMatch = path.match(/^\/plaza\/([^/]+)\/?$/)
  if (plazaMatch) {
    return {
      type: 'plaza',
      roomSlug: plazaMatch[1],
      roomId: `plaza-${plazaMatch[1]}`,
      displayPath: `/plaza/${plazaMatch[1]}`
    }
  }
  
  // Workspace room: /workspace/team-brainstorm
  const workspaceMatch = path.match(/^\/workspace\/([^/]+)\/?$/)
  if (workspaceMatch) {
    return {
      type: 'workspace',
      roomSlug: workspaceMatch[1],
      roomId: `workspace-${workspaceMatch[1]}`,
      displayPath: `/workspace/${workspaceMatch[1]}`
    }
  }
  
  // Legacy board room access (handled above in main board parsing)
  // This section is now redundant and removed to avoid duplicate identifier
  
  // Direct room access: /rooms/abc123 or /r/abc123 or /p/abc123 (with query params support)
  const directMatch = path.match(/^\/(?:rooms|r|ro|p)\/([^/]+)\/?$/)
  const isSnapshotRoute = path.startsWith('/p/')
  console.log('🎯 Direct route matching:', { path, directMatch, isSnapshotRoute })
  
  if (directMatch) {
    const baseRoomId = directMatch[1]
    // p路径和r路径都使用相同的房间ID，通过不同的路由类型区分
    const roomId = baseRoomId
    console.log('🔧 Processing direct route:', { baseRoomId, roomId, isSnapshotRoute })
    let pageId = undefined
    let viewport = undefined
    
    // 解析查询参数格式的pageId和viewport
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      console.log('🔍 Parsing URL query params:', window.location.search)
      
      // 获取页面ID
      const pageParam = urlParams.get('p')
      if (pageParam) {
        // 直接使用完整的页面ID，不再区分索引和ID
        pageId = decodeURIComponent(pageParam)
        console.log('📄 Parsed pageId:', pageId)
      }
      
      // 解析视窗信息
      const viewportParam = urlParams.get('d')
      if (viewportParam && viewportParam.startsWith('v')) {
        try {
          const parts = viewportParam.slice(1).split('.')
          console.log('🔍 Parsing viewport parts:', parts)
          if (parts.length >= 4) {
            const x = parseFloat(parts[0])
            const y = parseFloat(parts[1])
            const width = parseFloat(parts[2])
            const height = parseFloat(parts[3])
            
            if (!isNaN(x) && !isNaN(y) && !isNaN(width) && !isNaN(height)) {
              viewport = { x, y, width, height }
              console.log('📍 Parsed viewport:', viewport)
            }
          }
        } catch (error) {
          console.warn('Failed to parse viewport from query params:', error)
        }
      }
    }
    
    const result = {
      type: isSnapshotRoute ? 'snapshot' as const : 'direct' as const,
      roomId: roomId,
      pageId: pageId,
      viewport: viewport,
      displayPath: isSnapshotRoute ? `/p/${baseRoomId}` : `/r/${baseRoomId}`
    }
    console.log('🎯 Direct route parsed:', result)
    return result
  }
  
  // Default fallback - will be handled by App.tsx root redirect logic
  return {
    type: 'default',
    roomId: 'default-room',
    displayPath: '/'
  }
}

/**
 * Generate a standardized room URL with optional page and viewport (using query params)
 */
export function generateBoardUrl(roomId: string, pageId?: string, viewport?: { x: number, y: number, width: number, height: number }): string {
  let url = `/r/${roomId}`
  const params = new URLSearchParams()
  
  if (pageId) {
    params.set('p', pageId)
  }
  
  if (viewport) {
    params.set('d', `v${viewport.x}.${viewport.y}.${viewport.width}.${viewport.height}`)
  }
  
  if (params.toString()) {
    url += `?${params.toString()}`
  }
  
  return url
}

/**
 * Generate a semantic URL for a room based on its metadata and context
 */
export function generateRoomUrl(room: RoomMetadata, roomId: string, currentUser?: any): string {
  // If room has specific routing metadata, use it
  if (room.routeType && room.slug) {
    switch (room.routeType) {
      case 'gallery':
        return `/galleries/${room.gallerySlug || 'default'}/rooms/${room.slug}`
      case 'user':
        const userSlug = room.userSlug || 
                        currentUser?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || 
                        currentUser?.username || 
                        currentUser?.id || 
                        'anonymous'
        return `/users/${userSlug}/rooms/${room.slug}`
      case 'plaza':
        return `/plaza/${room.slug}`
      case 'workspace':
        return `/workspace/${room.slug}`
    }
  }
  
  // Detect room type from roomId prefix pattern
  if (roomId.startsWith('gallery-')) {
    const parts = roomId.replace('gallery-', '').split('-')
    if (parts.length >= 2) {
      const gallerySlug = parts[0]
      const roomSlug = parts.slice(1).join('-')
      return `/galleries/${gallerySlug}/rooms/${roomSlug}`
    }
  }
  
  if (roomId.startsWith('user-')) {
    const parts = roomId.replace('user-', '').split('-')
    if (parts.length >= 2) {
      const userSlug = parts[0]
      const roomSlug = parts.slice(1).join('-')
      return `/users/${userSlug}/rooms/${roomSlug}`
    }
  }
  
  if (roomId.startsWith('plaza-')) {
    const roomSlug = roomId.replace('plaza-', '')
    return `/plaza/${roomSlug}`
  }
  
  if (roomId.startsWith('workspace-')) {
    const roomSlug = roomId.replace('workspace-', '')
    return `/workspace/${roomSlug}`
  }
  
  // Fallback to direct room URL for legacy/unstructured room IDs
  return `/r/${roomId}`
}

/**
 * Create a room ID from route components
 */
export function createRoomId(type: string, ...components: string[]): string {
  switch (type) {
    case 'gallery':
      return `gallery-${components.join('-')}`
    case 'user':
      return `user-${components.join('-')}`
    case 'plaza':
      return `plaza-${components.join('-')}`
    case 'workspace':
      return `workspace-${components.join('-')}`
    case 'direct':
    default:
      return components[0] || 'default-room'
  }
}

/**
 * Validate if a slug is URL-safe
 */
export function validateSlug(slug: string): boolean {
  // Must be 3-50 characters, alphanumeric, hyphens, underscores only
  return /^[a-z0-9][a-z0-9_-]{2,49}$/i.test(slug)
}

/**
 * Convert a name to a URL-safe slug
 */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, '') // Remove invalid characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50) // Limit length
}

/**
 * Get room type from room ID
 */
export function getRoomType(roomId: string): string {
  if (roomId.startsWith('gallery-')) return 'gallery'
  if (roomId.startsWith('user-')) return 'user'
  if (roomId.startsWith('plaza-')) return 'plaza'
  if (roomId.startsWith('workspace-')) return 'workspace'
  return 'direct'
}

/**
 * Examples of usage:
 * 
 * // Parsing URLs
 * const route = parseRoute('/galleries/impressionism/rooms/east-wing')
 * // { type: 'gallery', gallerySlug: 'impressionism', roomSlug: 'east-wing', roomId: 'gallery-impressionism-east-wing' }
 * 
 * // Generating URLs
 * const url = generateRoomUrl({ routeType: 'gallery', gallerySlug: 'modern-art', slug: 'west-wing' }, 'gallery-modern-art-west-wing')
 * // '/galleries/modern-art/rooms/west-wing'
 * 
 * // Creating room IDs
 * const roomId = createRoomId('user', 'john-doe', 'my-canvas')
 * // 'user-john-doe-my-canvas'
 * 
 * // Converting names to slugs
 * const slug = nameToSlug('My Awesome Art Gallery!')
 * // 'my-awesome-art-gallery'
 */