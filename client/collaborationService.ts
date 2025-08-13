// Collaboration Service - Client-side utilities for tracking collaboration and interactions

export interface CollaborationEvent {
  roomId: string
  userId: string
  userName: string
  eventType: 'create' | 'edit' | 'assist' | 'join' | 'leave'
  timestamp: number
  details?: {
    elementId?: string
    elementType?: string
    action?: string
    data?: any
  }
}

export interface InteractionEvent {
  roomId: string
  userId: string
  userName: string
  interactionType: 'visit' | 'star' | 'comment' | 'report' | 'share'
  timestamp: number
  metadata?: {
    comment?: string
    reason?: string
    shareMethod?: string
    duration?: number
  }
}

export interface UserCollaborationStatus {
  roomId: string
  role: 'creator' | 'editor' | 'assistant' | 'viewer'
  joinedAt: number
  lastActiveAt: number
  contributionCount: number
  assistanceLocked: boolean
}

export class CollaborationService {
  private static instance: CollaborationService
  private collaborationEvents: CollaborationEvent[] = []
  private interactionEvents: InteractionEvent[] = []
  private userStatus: Map<string, UserCollaborationStatus> = new Map()

  static getInstance(): CollaborationService {
    if (!CollaborationService.instance) {
      CollaborationService.instance = new CollaborationService()
    }
    return CollaborationService.instance
  }

  // Initialize collaboration tracking for a room
  async initializeCollaboration(roomId: string, userId: string, userName: string): Promise<void> {
    const existing = this.userStatus.get(roomId)
    if (existing) {
      // Update last active time
      existing.lastActiveAt = Date.now()
      this.saveCollaborationStatus()
      return
    }

    // Determine user role based on room ownership and existing data
    const roomData = await this.getRoomData(roomId)
    let role: 'creator' | 'editor' | 'assistant' | 'viewer' = 'viewer'
    
    if (roomData?.ownerId === userId) {
      role = 'creator'
    } else {
      // Check for existing collaboration data
      const savedCollabs = this.loadCollaborationData()
      const existingCollab = savedCollabs.find(c => c.roomId === roomId && c.userId === userId)
      if (existingCollab) {
        role = existingCollab.role === 'assistant' ? 'assistant' : 'editor'
      }
    }

    const status: UserCollaborationStatus = {
      roomId,
      role,
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
      contributionCount: 0,
      assistanceLocked: false
    }

    this.userStatus.set(roomId, status)
    this.saveCollaborationStatus()

    // Record join event
    await this.recordCollaborationEvent({
      roomId,
      userId,
      userName,
      eventType: 'join',
      timestamp: Date.now()
    })
  }

  // Record collaboration events (create, edit, assist)
  async recordCollaborationEvent(event: CollaborationEvent): Promise<void> {
    this.collaborationEvents.push(event)
    
    // Update user status
    const status = this.userStatus.get(event.roomId)
    if (status) {
      status.lastActiveAt = event.timestamp
      if (event.eventType === 'edit' || event.eventType === 'create') {
        status.contributionCount++
      }
    }

    // Save to localStorage
    this.saveCollaborationEvents()
    this.saveCollaborationStatus()

    // Send to server if available
    try {
      await this.syncToServer(event)
    } catch (error) {
      console.warn('Failed to sync collaboration event to server:', error)
    }
  }

  // Record interaction events (visit, star, comment, etc.)
  async recordInteractionEvent(event: InteractionEvent): Promise<void> {
    // Check for duplicate recent events
    const recent = this.interactionEvents.filter(e => 
      e.roomId === event.roomId && 
      e.userId === event.userId && 
      e.interactionType === event.interactionType &&
      Math.abs(e.timestamp - event.timestamp) < 60000 // Within 1 minute
    )

    if (recent.length > 0 && event.interactionType === 'visit') {
      // Don't record duplicate visits within 1 minute
      return
    }

    this.interactionEvents.push(event)
    this.saveInteractionEvents()

    // Send to server if available
    try {
      await this.syncInteractionToServer(event)
    } catch (error) {
      console.warn('Failed to sync interaction event to server:', error)
    }
  }

  // Get user's collaboration history for a room
  getUserCollaborationHistory(roomId: string, userId: string): CollaborationEvent[] {
    return this.collaborationEvents.filter(e => e.roomId === roomId && e.userId === userId)
  }

  // Get user's interaction history for a room
  getUserInteractionHistory(roomId: string, userId: string): InteractionEvent[] {
    return this.interactionEvents.filter(e => e.roomId === roomId && e.userId === userId)
  }

  // Get all rooms user has collaborated on
  getUserCollaboratedRooms(userId: string): string[] {
    const roomIds = new Set<string>()
    this.collaborationEvents
      .filter(e => e.userId === userId)
      .forEach(e => roomIds.add(e.roomId))
    return Array.from(roomIds)
  }

  // Get all rooms user has interacted with
  getUserInteractedRooms(userId: string): string[] {
    const roomIds = new Set<string>()
    this.interactionEvents
      .filter(e => e.userId === userId)
      .forEach(e => roomIds.add(e.roomId))
    return Array.from(roomIds)
  }

  // Check if user has specific interaction with room
  hasInteraction(roomId: string, userId: string, interactionType: string): boolean {
    return this.interactionEvents.some(e => 
      e.roomId === roomId && 
      e.userId === userId && 
      e.interactionType === interactionType
    )
  }

  // Get user's role in a room
  getUserRole(roomId: string): 'creator' | 'editor' | 'assistant' | 'viewer' {
    const status = this.userStatus.get(roomId)
    return status?.role || 'viewer'
  }

  // Set assistance lock for a room (only creators can do this)
  async setAssistanceLock(roomId: string, locked: boolean, userId: string): Promise<boolean> {
    const status = this.userStatus.get(roomId)
    if (!status || status.role !== 'creator') {
      return false // Only creators can set assistance lock
    }

    status.assistanceLocked = locked
    this.saveCollaborationStatus()

    // Record the event
    await this.recordCollaborationEvent({
      roomId,
      userId,
      userName: 'Room Owner',
      eventType: 'assist',
      timestamp: Date.now(),
      details: {
        action: locked ? 'lock_assistance' : 'unlock_assistance'
      }
    })

    return true
  }

  // Check if assistance is locked for a room
  isAssistanceLocked(roomId: string): boolean {
    const status = this.userStatus.get(roomId)
    return status?.assistanceLocked || false
  }

  // Get collaboration statistics for a user
  getCollaborationStats(userId: string): {
    totalRoomsCreated: number
    totalRoomsEdited: number
    totalRoomsAssisted: number
    totalInteractions: number
    roomsStarred: number
    roomsShared: number
  } {
    const collaboratedRooms = this.getUserCollaboratedRooms(userId)
    const createdRooms = this.collaborationEvents.filter(e => 
      e.userId === userId && e.eventType === 'create'
    ).length

    const editedRooms = new Set(
      this.collaborationEvents
        .filter(e => e.userId === userId && e.eventType === 'edit')
        .map(e => e.roomId)
    ).size

    const assistedRooms = new Set(
      this.collaborationEvents
        .filter(e => e.userId === userId && e.eventType === 'assist')
        .map(e => e.roomId)
    ).size

    const totalInteractions = this.interactionEvents.filter(e => e.userId === userId).length
    const roomsStarred = new Set(
      this.interactionEvents
        .filter(e => e.userId === userId && e.interactionType === 'star')
        .map(e => e.roomId)
    ).size

    const roomsShared = new Set(
      this.interactionEvents
        .filter(e => e.userId === userId && e.interactionType === 'share')
        .map(e => e.roomId)
    ).size

    return {
      totalRoomsCreated: createdRooms,
      totalRoomsEdited: editedRooms,
      totalRoomsAssisted: assistedRooms,
      totalInteractions,
      roomsStarred,
      roomsShared
    }
  }

  // Save/Load methods for localStorage
  private saveCollaborationEvents(): void {
    try {
      localStorage.setItem('collaboration-events', JSON.stringify(this.collaborationEvents))
    } catch (error) {
      console.error('Failed to save collaboration events:', error)
    }
  }

  private saveInteractionEvents(): void {
    try {
      localStorage.setItem('interaction-events', JSON.stringify(this.interactionEvents))
    } catch (error) {
      console.error('Failed to save interaction events:', error)
    }
  }

  private saveCollaborationStatus(): void {
    try {
      const statusArray = Array.from(this.userStatus.entries()).map(([roomId, status]) => ({
        roomId,
        ...status
      }))
      localStorage.setItem('collaboration-status', JSON.stringify(statusArray))
    } catch (error) {
      console.error('Failed to save collaboration status:', error)
    }
  }

  private loadCollaborationEvents(): void {
    try {
      const saved = localStorage.getItem('collaboration-events')
      if (saved) {
        this.collaborationEvents = JSON.parse(saved)
      }
    } catch (error) {
      console.error('Failed to load collaboration events:', error)
      this.collaborationEvents = []
    }
  }

  private loadInteractionEvents(): void {
    try {
      const saved = localStorage.getItem('interaction-events')
      if (saved) {
        this.interactionEvents = JSON.parse(saved)
      }
    } catch (error) {
      console.error('Failed to load interaction events:', error)
      this.interactionEvents = []
    }
  }

  private loadCollaborationStatus(): void {
    try {
      const saved = localStorage.getItem('collaboration-status')
      if (saved) {
        const statusArray = JSON.parse(saved)
        this.userStatus = new Map(statusArray.map((s: any) => [s.roomId, s]))
      }
    } catch (error) {
      console.error('Failed to load collaboration status:', error)
      this.userStatus = new Map()
    }
  }

  private loadCollaborationData(): any[] {
    try {
      const saved = localStorage.getItem('collaboration-data')
      return saved ? JSON.parse(saved) : []
    } catch (error) {
      return []
    }
  }

  // Initialize the service
  async initialize(): Promise<void> {
    this.loadCollaborationEvents()
    this.loadInteractionEvents()
    this.loadCollaborationStatus()
  }

  // Helper methods
  private async getRoomData(roomId: string): Promise<any> {
    try {
      const { roomUtils } = await import('./roomUtils')
      return await roomUtils.getRoom(roomId)
    } catch (error) {
      console.error('Failed to get room data:', error)
      return null
    }
  }

  private async syncToServer(event: CollaborationEvent): Promise<void> {
    // Implementation for syncing to server
    // This would make an API call to store the collaboration event
    const response = await fetch('/api/collaboration/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    })

    if (!response.ok) {
      throw new Error(`Failed to sync collaboration event: ${response.statusText}`)
    }
  }

  private async syncInteractionToServer(event: InteractionEvent): Promise<void> {
    // Implementation for syncing to server
    const response = await fetch('/api/interaction/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    })

    if (!response.ok) {
      throw new Error(`Failed to sync interaction event: ${response.statusText}`)
    }
  }
}

// Export singleton instance
export const collaborationService = CollaborationService.getInstance()

// Initialize on module load
collaborationService.initialize()