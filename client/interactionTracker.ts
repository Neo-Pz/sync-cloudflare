// Interaction Tracker - Comprehensive tracking of user interactions with rooms

import { collaborationService, InteractionEvent } from './collaborationService'
import { roomUserStatsManager } from './roomUserStatsManager'

export interface InteractionMetrics {
  roomId: string
  visitCount: number
  totalTimeSpent: number // in milliseconds
  lastVisitAt: number
  isStarred: boolean
  starredAt?: number
  hasCommented: boolean
  lastCommentAt?: number
  hasShared: boolean
  lastSharedAt?: number
  shareCount: number
}

export interface VisitSession {
  roomId: string
  userId: string
  userName?: string
  startTime: number
  endTime?: number
  duration?: number
  actions: string[]
}

export class InteractionTracker {
  private static instance: InteractionTracker
  private currentSession: VisitSession | null = null
  private interactionMetrics: Map<string, InteractionMetrics> = new Map()
  private visitSessions: VisitSession[] = []
  private heartbeatInterval: number | null = null

  static getInstance(): InteractionTracker {
    if (!InteractionTracker.instance) {
      InteractionTracker.instance = new InteractionTracker()
    }
    return InteractionTracker.instance
  }

  // Start tracking a room visit
  async startVisit(roomId: string, userId: string, userName: string): Promise<void> {
    // End previous session if exists
    if (this.currentSession) {
      await this.endVisit()
    }

    const startTime = Date.now()
    this.currentSession = {
      roomId,
      userId,
      userName,
      startTime,
      actions: ['visit']
    }

    // Update metrics
    let metrics = this.interactionMetrics.get(roomId)
    if (!metrics) {
      metrics = {
        roomId,
        visitCount: 0,
        totalTimeSpent: 0,
        lastVisitAt: startTime,
        isStarred: false,
        hasCommented: false,
        hasShared: false,
        shareCount: 0
      }
      this.interactionMetrics.set(roomId, metrics)
    }

    metrics.visitCount++
    metrics.lastVisitAt = startTime

    // Record visit interaction
    await collaborationService.recordInteractionEvent({
      roomId,
      userId,
      userName,
      interactionType: 'visit',
      timestamp: startTime,
      metadata: {
        visitCount: metrics.visitCount
      }
    })

    // Start heartbeat for session tracking
    this.startHeartbeat()
    this.saveMetrics()

    // 记录到新的统计管理器
    roomUserStatsManager.recordVisit(roomId, userId, userName)

    console.log(`🏠 Started visit tracking for room ${roomId}`)
  }

  // End current visit session
  async endVisit(): Promise<void> {
    if (!this.currentSession) return

    const endTime = Date.now()
    const duration = endTime - this.currentSession.startTime

    // Update session
    this.currentSession.endTime = endTime
    this.currentSession.duration = duration

    // Update metrics
    const metrics = this.interactionMetrics.get(this.currentSession.roomId)
    if (metrics) {
      metrics.totalTimeSpent += duration
    }

    // Save session
    this.visitSessions.push({ ...this.currentSession })
    this.saveVisitSessions()

    // Stop heartbeat
    this.stopHeartbeat()
    
    console.log(`🏁 Ended visit tracking for room ${this.currentSession.roomId}, duration: ${duration}ms`)
    
    this.currentSession = null
    this.saveMetrics()
  }

  // Record user action during visit
  recordAction(action: string): void {
    if (this.currentSession) {
      this.currentSession.actions.push(action)
    }
  }

  // Star/unstar a room
  async toggleStar(roomId: string, userId: string, userName: string, starred: boolean): Promise<void> {
    const metrics = this.getOrCreateMetrics(roomId)
    metrics.isStarred = starred
    
    const timestamp = Date.now()
    
    if (starred) {
      metrics.starredAt = timestamp
    } else {
      delete metrics.starredAt
    }

    // 统一发送star事件，用metadata区分是添加还是移除收藏
    await collaborationService.recordInteractionEvent({
      roomId,
      userId,
      userName,
      interactionType: 'star',
      timestamp,
      metadata: {
        starred: starred,
        action: starred ? 'add' : 'remove'
      }
    })

    // 记录到新的统计管理器
    roomUserStatsManager.recordStar(roomId, userId, userName, starred)

    console.log(`${starred ? '⭐ Starred' : '☆ Unstarred'} room ${roomId}`)
    this.recordAction(starred ? 'star' : 'unstar')
    this.saveMetrics()
  }

  // Record a comment on a room
  async recordComment(roomId: string, userId: string, userName: string, comment: string): Promise<void> {
    const metrics = this.getOrCreateMetrics(roomId)
    metrics.hasCommented = true
    metrics.lastCommentAt = Date.now()

    await collaborationService.recordInteractionEvent({
      roomId,
      userId,
      userName,
      interactionType: 'comment',
      timestamp: Date.now(),
      metadata: {
        comment: comment.substring(0, 100) // Store first 100 chars for context
      }
    })

    // 记录到新的统计管理器
    roomUserStatsManager.recordComment(roomId, userId, userName, comment)

    this.recordAction('comment')
    this.saveMetrics()
    console.log(`💬 Recorded comment on room ${roomId}`)
  }


  // Record sharing a room
  async recordShare(roomId: string, userId: string, userName: string, shareMethod: string): Promise<void> {
    const metrics = this.getOrCreateMetrics(roomId)
    metrics.hasShared = true
    metrics.lastSharedAt = Date.now()
    metrics.shareCount++

    await collaborationService.recordInteractionEvent({
      roomId,
      userId,
      userName,
      interactionType: 'share',
      timestamp: Date.now(),
      metadata: {
        shareMethod,
        shareCount: metrics.shareCount
      }
    })

    // 记录到新的统计管理器
    roomUserStatsManager.recordShare(roomId, userId, userName, shareMethod)

    this.recordAction('share')
    this.saveMetrics()
    console.log(`🔗 Recorded share of room ${roomId} via ${shareMethod}`)
  }

  // Get interaction metrics for a room
  getMetrics(roomId: string): InteractionMetrics | null {
    return this.interactionMetrics.get(roomId) || null
  }

  // Get all user's interaction metrics
  getAllMetrics(): InteractionMetrics[] {
    return Array.from(this.interactionMetrics.values())
  }

  // Get visit history for a room
  getRoomVisitHistory(roomId: string): VisitSession[] {
    return this.visitSessions.filter(session => session.roomId === roomId)
  }

  // Get recent unique visitors for a room (dedup by userId, sorted by last time)
  getRecentVisitors(roomId: string, limit: number = 10): { userId: string; userName?: string; lastAt: number }[] {
    const sessions = this.getRoomVisitHistory(roomId)
    const lastByUser = new Map<string, { userId: string; userName?: string; lastAt: number }>()
    for (const s of sessions) {
      const lastAt = s.endTime || s.startTime
      const prev = lastByUser.get(s.userId)
      if (!prev || lastAt > prev.lastAt) {
        lastByUser.set(s.userId, { userId: s.userId, userName: s.userName, lastAt })
      }
    }
    return Array.from(lastByUser.values()).sort((a, b) => b.lastAt - a.lastAt).slice(0, limit)
  }

  // Get user's total time spent across all rooms
  getTotalTimeSpent(): number {
    return Array.from(this.interactionMetrics.values())
      .reduce((total, metrics) => total + metrics.totalTimeSpent, 0)
  }

  // Get most visited rooms
  getMostVisitedRooms(limit: number = 10): InteractionMetrics[] {
    return Array.from(this.interactionMetrics.values())
      .sort((a, b) => b.visitCount - a.visitCount)
      .slice(0, limit)
  }

  // Get starred rooms
  getStarredRooms(): InteractionMetrics[] {
    return Array.from(this.interactionMetrics.values())
      .filter(metrics => metrics.isStarred)
      .sort((a, b) => (b.starredAt || 0) - (a.starredAt || 0))
  }

  // Get rooms with comments
  getCommentedRooms(): InteractionMetrics[] {
    return Array.from(this.interactionMetrics.values())
      .filter(metrics => metrics.hasCommented)
      .sort((a, b) => (b.lastCommentAt || 0) - (a.lastCommentAt || 0))
  }

  // Get shared rooms
  getSharedRooms(): InteractionMetrics[] {
    return Array.from(this.interactionMetrics.values())
      .filter(metrics => metrics.hasShared)
      .sort((a, b) => (b.lastSharedAt || 0) - (a.lastSharedAt || 0))
  }

  // Check if user has specific interaction with room
  hasInteraction(roomId: string, interactionType: 'visit' | 'star' | 'comment' | 'report' | 'share'): boolean {
    const metrics = this.interactionMetrics.get(roomId)
    if (!metrics) return false

    switch (interactionType) {
      case 'visit':
        return metrics.visitCount > 0
      case 'star':
        return metrics.isStarred
      case 'comment':
        return metrics.hasCommented
      case 'share':
        return metrics.hasShared
      default:
        return false
    }
  }

  // Get all room IDs user has interacted with
  getAllInteractedRoomIds(): string[] {
    return Array.from(this.interactionMetrics.keys())
  }

  // Get rooms by specific interaction type
  getRoomsByInteractionType(interactionType: 'visit' | 'star' | 'comment' | 'report' | 'share'): string[] {
    const roomIds: string[] = []
    
    for (const [roomId, metrics] of this.interactionMetrics.entries()) {
      if (this.hasInteraction(roomId, interactionType)) {
        roomIds.push(roomId)
      }
    }
    
    return roomIds
  }

  // Get interaction count for a specific room and type
  getInteractionCount(roomId: string, interactionType: 'visit' | 'share'): number {
    const metrics = this.interactionMetrics.get(roomId)
    if (!metrics) return 0

    switch (interactionType) {
      case 'visit':
        return metrics.visitCount
      case 'share':
        return metrics.shareCount
      default:
        return 0
    }
  }

  // Get last interaction timestamp for a room
  getLastInteractionTime(roomId: string, interactionType: 'visit' | 'star' | 'comment' | 'share'): number | null {
    const metrics = this.interactionMetrics.get(roomId)
    if (!metrics) return null

    switch (interactionType) {
      case 'visit':
        return metrics.lastVisitAt || null
      case 'star':
        return metrics.starredAt || null
      case 'comment':
        return metrics.lastCommentAt || null
      case 'share':
        return metrics.lastSharedAt || null
      default:
        return null
    }
  }

  // Export all interaction data for external use
  exportInteractionData(): {
    metrics: InteractionMetrics[]
    sessions: VisitSession[]
  } {
    return {
      metrics: this.getAllMetrics(),
      sessions: [...this.visitSessions]
    }
  }

  // Get interaction summary for analytics
  getInteractionSummary(): {
    totalRoomsVisited: number
    totalVisits: number
    totalTimeSpent: number
    averageSessionDuration: number
    roomsStarred: number
    roomsCommented: number
    roomsShared: number
    roomsReported: number
  } {
    const allMetrics = this.getAllMetrics()
    const totalVisits = allMetrics.reduce((sum, m) => sum + m.visitCount, 0)
    const totalTimeSpent = allMetrics.reduce((sum, m) => sum + m.totalTimeSpent, 0)
    const completedSessions = this.visitSessions.filter(s => s.duration)
    const averageSessionDuration = completedSessions.length > 0
      ? completedSessions.reduce((sum, s) => sum + (s.duration || 0), 0) / completedSessions.length
      : 0

    return {
      totalRoomsVisited: allMetrics.length,
      totalVisits,
      totalTimeSpent,
      averageSessionDuration,
      roomsStarred: allMetrics.filter(m => m.isStarred).length,
      roomsCommented: allMetrics.filter(m => m.hasCommented).length,
      roomsShared: allMetrics.filter(m => m.hasShared).length,
    }
  }

  // Private helper methods
  private getOrCreateMetrics(roomId: string): InteractionMetrics {
    let metrics = this.interactionMetrics.get(roomId)
    if (!metrics) {
      metrics = {
        roomId,
        visitCount: 0,
        totalTimeSpent: 0,
        lastVisitAt: 0,
        isStarred: false,
        hasCommented: false,
        hasShared: false,
        shareCount: 0
      }
      this.interactionMetrics.set(roomId, metrics)
    }
    return metrics
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    // Send heartbeat every 30 seconds to keep session alive
    this.heartbeatInterval = window.setInterval(() => {
      if (this.currentSession) {
        this.recordAction('heartbeat')
      }
    }, 30000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  // Storage methods
  private saveMetrics(): void {
    try {
      const metricsArray = Array.from(this.interactionMetrics.entries())
      localStorage.setItem('interaction-metrics', JSON.stringify(metricsArray))
    } catch (error) {
      console.error('Failed to save interaction metrics:', error)
    }
  }

  private saveVisitSessions(): void {
    try {
      localStorage.setItem('visit-sessions', JSON.stringify(this.visitSessions))
    } catch (error) {
      console.error('Failed to save visit sessions:', error)
    }
  }

  private loadMetrics(): void {
    try {
      const saved = localStorage.getItem('interaction-metrics')
      if (saved) {
        const metricsArray = JSON.parse(saved)
        this.interactionMetrics = new Map(metricsArray)
      }
    } catch (error) {
      console.error('Failed to load interaction metrics:', error)
      this.interactionMetrics = new Map()
    }
  }

  private loadVisitSessions(): void {
    try {
      const saved = localStorage.getItem('visit-sessions')
      if (saved) {
        this.visitSessions = JSON.parse(saved)
      }
    } catch (error) {
      console.error('Failed to load visit sessions:', error)
      this.visitSessions = []
    }
  }

  // Initialize the tracker
  async initialize(): Promise<void> {
    this.loadMetrics()
    this.loadVisitSessions()

    // Handle page unload to ensure visit session is properly ended
    window.addEventListener('beforeunload', () => {
      if (this.currentSession) {
        // Synchronous save for beforeunload
        this.endVisit()
      }
    })

    // Handle page visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.currentSession) {
        this.recordAction('page_hidden')
      } else if (!document.hidden && this.currentSession) {
        this.recordAction('page_visible')
      }
    })

    console.log('🔍 Interaction tracker initialized')
  }

  // Cleanup method
  destroy(): void {
    this.stopHeartbeat()
    if (this.currentSession) {
      this.endVisit()
    }
  }
}

// Export singleton instance
export const interactionTracker = InteractionTracker.getInstance()

// Initialize on module load
interactionTracker.initialize()

// Utility functions for easy integration
export const trackVisit = (roomId: string, userId: string, userName: string) => 
  interactionTracker.startVisit(roomId, userId, userName)

export const getRecentVisitors = (roomId: string, limit?: number) =>
  interactionTracker.getRecentVisitors(roomId, limit)

export const trackAction = (action: string) => 
  interactionTracker.recordAction(action)

export const trackStar = (roomId: string, userId: string, userName: string, starred: boolean) => 
  interactionTracker.toggleStar(roomId, userId, userName, starred)

export const trackComment = (roomId: string, userId: string, userName: string, comment: string) => 
  interactionTracker.recordComment(roomId, userId, userName, comment)

export const trackShare = (roomId: string, userId: string, userName: string, method: string) => 
  interactionTracker.recordShare(roomId, userId, userName, method)

// 开发环境下导入测试文件
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  import('./roomStatsTest')
}

