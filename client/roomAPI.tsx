import { Room } from './RoomManager'

// API endpoints for room operations
const getApiBase = () => {
  // 统一使用相对路径，让Vite代理处理
  console.log('🌐 Using relative API endpoints (handled by Vite proxy)')
  return '/api/rooms'
}

const API_BASE = getApiBase()

export class RoomAPI {
  // Get all rooms
  static async getAllRooms(): Promise<Room[]> {
    try {
      const response = await fetch(`${API_BASE}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching rooms:', error)
      throw error
    }
  }

  // Get a specific room
  static async getRoom(roomId: string): Promise<Room | null> {
    try {
      console.log(`🔍 Fetching room: ${roomId}`)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      const response = await fetch(`${API_BASE}/${roomId}`, {
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      
      console.log(`📡 Room API response: ${response.status}`)
      if (response.status === 404) {
        console.log(`❌ Room not found: ${roomId}`)
        return null
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const result = await response.json()
      console.log(`✅ Room fetched successfully: ${roomId}`)
      return result
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error(`⏰ Room fetch timeout: ${roomId}`)
      } else {
        console.error('Error fetching room:', error)
      }
      throw error
    }
  }

  // Create a new room
  static async createRoom(room: Room): Promise<Room> {
    try {
      console.log(`Creating room with data:`, room)
      console.log(`Using API base: ${API_BASE}`)
      const response = await fetch(`${API_BASE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(room)
      })
      console.log(`Create response status: ${response.status}`)
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`Create error response:`, errorText)
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Error creating room:', error)
      throw error
    }
  }

  // Update a room
  static async updateRoom(roomId: string, updates: Partial<Room>): Promise<Room> {
    try {
      console.log(`Updating room ${roomId} with data:`, updates)
      console.log(`Using API base: ${API_BASE}`)
      const response = await fetch(`${API_BASE}/${roomId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates)
      })
      console.log(`Update response status: ${response.status}`)
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`Update error response:`, errorText)
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Error updating room:', error)
      throw error
    }
  }

  // Delete a room
  static async deleteRoom(roomId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/${roomId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
    } catch (error) {
      console.error('Error deleting room:', error)
      throw error
    }
  }

  // (Deprecated) get published rooms — replaced by getPlazaRooms using publish=true
  static async getPublishedRooms(): Promise<Room[]> {
    return this.getPlazaRooms()
  }

  // Get rooms by owner
  static async getRoomsByOwner(ownerId: string): Promise<Room[]> {
    try {
      const response = await fetch(`${API_BASE}?owner=${ownerId}`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching rooms by owner:', error)
      throw error
    }
  }

  // Get publish rooms (rooms marked for display in publish)
  static async getPlazaRooms(): Promise<Room[]> {
    try {
      const response = await fetch(`${API_BASE}?publish=true`)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Error fetching publish rooms:', error)
      throw error
    }
  }

  // Update a room's publish status
  static async updateRoomPlazaStatus(roomId: string, isPlaza: boolean): Promise<Room> {
    try {
      const response = await fetch(`${API_BASE}/${roomId}/publish`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ publish: isPlaza })
      })
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Error updating room publish status:', error)
      throw error
    }
  }
}