// Room Property Service - Database schema and operations for property-based room management

export interface RoomProperty {
  roomId: string
  ownerId: string
  ownerName: string
  createdAt: number
  lastModified: number
  published: boolean
  permission: 'viewer' | 'editor' | 'assist'
  description?: string
  tags?: string[]
  coverPageId?: string
  thumbnail?: string
}

export interface RoomCollaboration {
  id: string
  roomId: string
  userId: string
  userName: string
  role: 'editor' | 'assistant'
  joinedAt: number
  lastActive: number
  invitedBy: string
  status: 'active' | 'inactive' | 'removed'
}

export interface RoomInteraction {
  id: string
  roomId: string
  userId: string
  userName: string
  interactionType: 'visited' | 'starred' | 'commented' | 'reported' | 'shared'
  timestamp: number
  metadata?: Record<string, any> // For storing additional data like comment content, share link, etc.
}

export interface RoomAccess {
  id: string
  roomId: string
  userId: string
  accessType: 'owner' | 'collaborator' | 'viewer'
  permission: 'viewer' | 'editor' | 'assist'
  grantedAt: number
  grantedBy: string
  expiresAt?: number
  active: boolean
}

// Database schema creation SQL
export const CREATE_ROOM_PROPERTIES_TABLE = `
CREATE TABLE IF NOT EXISTS room_properties (
  room_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_modified INTEGER NOT NULL,
  published BOOLEAN DEFAULT FALSE,
  permission TEXT DEFAULT 'viewer' CHECK (permission IN ('viewer', 'editor', 'assist')),
  description TEXT,
  tags TEXT, -- JSON string
  cover_page_id TEXT,
  thumbnail TEXT
);
`;

export const CREATE_ROOM_COLLABORATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS room_collaborations (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('editor', 'assistant')),
  joined_at INTEGER NOT NULL,
  last_active INTEGER NOT NULL,
  invited_by TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'removed')),
  FOREIGN KEY (room_id) REFERENCES room_properties (room_id) ON DELETE CASCADE,
  UNIQUE(room_id, user_id)
);
`;

export const CREATE_ROOM_INTERACTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS room_interactions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  interaction_type TEXT NOT NULL CHECK (interaction_type IN ('visited', 'starred', 'commented', 'reported', 'shared')),
  timestamp INTEGER NOT NULL,
  metadata TEXT, -- JSON string
  FOREIGN KEY (room_id) REFERENCES room_properties (room_id) ON DELETE CASCADE
);
`;

export const CREATE_ROOM_ACCESS_TABLE = `
CREATE TABLE IF NOT EXISTS room_access (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('owner', 'collaborator', 'viewer')),
  permission TEXT NOT NULL CHECK (permission IN ('viewer', 'editor', 'assist')),
  granted_at INTEGER NOT NULL,
  granted_by TEXT NOT NULL,
  expires_at INTEGER,
  active BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (room_id) REFERENCES room_properties (room_id) ON DELETE CASCADE,
  UNIQUE(room_id, user_id)
);
`;

// Index creation for performance
export const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_room_properties_owner ON room_properties (owner_id);`,
  `CREATE INDEX IF NOT EXISTS idx_room_properties_published ON room_properties (published);`,
  `CREATE INDEX IF NOT EXISTS idx_room_collaborations_user ON room_collaborations (user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_room_collaborations_room ON room_collaborations (room_id);`,
  `CREATE INDEX IF NOT EXISTS idx_room_interactions_user ON room_interactions (user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_room_interactions_room ON room_interactions (room_id);`,
  `CREATE INDEX IF NOT EXISTS idx_room_interactions_type ON room_interactions (interaction_type);`,
  `CREATE INDEX IF NOT EXISTS idx_room_access_user ON room_access (user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_room_access_room ON room_access (room_id);`
];

export class RoomPropertyService {
  constructor(private db: D1Database) {}

  // Initialize database tables
  async initializeTables(): Promise<void> {
    await this.db.exec(CREATE_ROOM_PROPERTIES_TABLE);
    await this.db.exec(CREATE_ROOM_COLLABORATIONS_TABLE);
    await this.db.exec(CREATE_ROOM_INTERACTIONS_TABLE);
    await this.db.exec(CREATE_ROOM_ACCESS_TABLE);
    
    for (const indexSQL of CREATE_INDEXES) {
      await this.db.exec(indexSQL);
    }
  }

  // Room Properties operations
  async createRoomProperty(property: RoomProperty): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO room_properties 
      (room_id, owner_id, owner_name, created_at, last_modified, published, permission, description, tags, cover_page_id, thumbnail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      property.roomId,
      property.ownerId,
      property.ownerName,
      property.createdAt,
      property.lastModified,
      property.published,
      property.permission,
      property.description || null,
      property.tags ? JSON.stringify(property.tags) : null,
      property.coverPageId || null,
      property.thumbnail || null
    ).run();

    // Create owner access record
    await this.grantRoomAccess({
      id: `${property.roomId}-${property.ownerId}`,
      roomId: property.roomId,
      userId: property.ownerId,
      accessType: 'owner',
      permission: 'editor',
      grantedAt: property.createdAt,
      grantedBy: property.ownerId,
      active: true
    });
  }

  async getRoomProperty(roomId: string): Promise<RoomProperty | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM room_properties WHERE room_id = ?
    `);
    
    const result = await stmt.bind(roomId).first<any>();
    if (!result) return null;

    return {
      roomId: result.room_id,
      ownerId: result.owner_id,
      ownerName: result.owner_name,
      createdAt: result.created_at,
      lastModified: result.last_modified,
      published: !!result.published,
      permission: result.permission,
      description: result.description,
      tags: result.tags ? JSON.parse(result.tags) : undefined,
      coverPageId: result.cover_page_id,
      thumbnail: result.thumbnail
    };
  }

  async updateRoomProperty(roomId: string, updates: Partial<RoomProperty>): Promise<void> {
    const fields = [];
    const values = [];

    if (updates.lastModified !== undefined) {
      fields.push('last_modified = ?');
      values.push(updates.lastModified);
    }
    if (updates.published !== undefined) {
      fields.push('published = ?');
      values.push(updates.published);
    }
    if (updates.permission !== undefined) {
      fields.push('permission = ?');
      values.push(updates.permission);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.tags !== undefined) {
      fields.push('tags = ?');
      values.push(JSON.stringify(updates.tags));
    }
    if (updates.coverPageId !== undefined) {
      fields.push('cover_page_id = ?');
      values.push(updates.coverPageId);
    }
    if (updates.thumbnail !== undefined) {
      fields.push('thumbnail = ?');
      values.push(updates.thumbnail);
    }

    if (fields.length === 0) return;

    const stmt = this.db.prepare(`
      UPDATE room_properties SET ${fields.join(', ')} WHERE room_id = ?
    `);
    
    await stmt.bind(...values, roomId).run();
  }

  async deleteRoomProperty(roomId: string): Promise<void> {
    const stmt = this.db.prepare(`DELETE FROM room_properties WHERE room_id = ?`);
    await stmt.bind(roomId).run();
  }

  async getUserOwnedRooms(userId: string): Promise<RoomProperty[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM room_properties WHERE owner_id = ? ORDER BY last_modified DESC
    `);
    
    const results = await stmt.bind(userId).all<any>();
    return results.results.map(this.mapDbToRoomProperty);
  }

  async getPublishedRooms(): Promise<RoomProperty[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM room_properties WHERE published = TRUE ORDER BY last_modified DESC
    `);
    
    const results = await stmt.all<any>();
    return results.results.map(this.mapDbToRoomProperty);
  }

  // Room Collaboration operations
  async addCollaborator(collaboration: RoomCollaboration): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO room_collaborations 
      (id, room_id, user_id, user_name, role, joined_at, last_active, invited_by, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      collaboration.id,
      collaboration.roomId,
      collaboration.userId,
      collaboration.userName,
      collaboration.role,
      collaboration.joinedAt,
      collaboration.lastActive,
      collaboration.invitedBy,
      collaboration.status
    ).run();

    // Grant room access
    await this.grantRoomAccess({
      id: `${collaboration.roomId}-${collaboration.userId}`,
      roomId: collaboration.roomId,
      userId: collaboration.userId,
      accessType: 'collaborator',
      permission: collaboration.role === 'assistant' ? 'assist' : 'editor',
      grantedAt: collaboration.joinedAt,
      grantedBy: collaboration.invitedBy,
      active: true
    });
  }

  async removeCollaborator(roomId: string, userId: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE room_collaborations SET status = 'removed' WHERE room_id = ? AND user_id = ?
    `);
    await stmt.bind(roomId, userId).run();

    // Revoke room access
    const accessStmt = this.db.prepare(`
      UPDATE room_access SET active = FALSE WHERE room_id = ? AND user_id = ?
    `);
    await accessStmt.bind(roomId, userId).run();
  }

  async getRoomCollaborators(roomId: string): Promise<RoomCollaboration[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM room_collaborations WHERE room_id = ? AND status = 'active'
    `);
    
    const results = await stmt.bind(roomId).all<any>();
    return results.results.map(this.mapDbToCollaboration);
  }

  async getUserCollaborations(userId: string): Promise<RoomCollaboration[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM room_collaborations WHERE user_id = ? AND status = 'active' ORDER BY last_active DESC
    `);
    
    const results = await stmt.bind(userId).all<any>();
    return results.results.map(this.mapDbToCollaboration);
  }

  // Room Interaction operations
  async recordInteraction(interaction: RoomInteraction): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO room_interactions 
      (id, room_id, user_id, user_name, interaction_type, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      interaction.id,
      interaction.roomId,
      interaction.userId,
      interaction.userName,
      interaction.interactionType,
      interaction.timestamp,
      interaction.metadata ? JSON.stringify(interaction.metadata) : null
    ).run();
  }

  async getUserInteractions(userId: string, interactionType?: string): Promise<RoomInteraction[]> {
    const sql = interactionType 
      ? `SELECT * FROM room_interactions WHERE user_id = ? AND interaction_type = ? ORDER BY timestamp DESC`
      : `SELECT * FROM room_interactions WHERE user_id = ? ORDER BY timestamp DESC`;
    
    const stmt = this.db.prepare(sql);
    const results = interactionType 
      ? await stmt.bind(userId, interactionType).all<any>()
      : await stmt.bind(userId).all<any>();
    
    return results.results.map(this.mapDbToInteraction);
  }

  async getRoomInteractions(roomId: string, interactionType?: string): Promise<RoomInteraction[]> {
    const sql = interactionType 
      ? `SELECT * FROM room_interactions WHERE room_id = ? AND interaction_type = ? ORDER BY timestamp DESC`
      : `SELECT * FROM room_interactions WHERE room_id = ? ORDER BY timestamp DESC`;
    
    const stmt = this.db.prepare(sql);
    const results = interactionType 
      ? await stmt.bind(roomId, interactionType).all<any>()
      : await stmt.bind(roomId).all<any>();
    
    return results.results.map(this.mapDbToInteraction);
  }

  // Room Access operations
  async grantRoomAccess(access: RoomAccess): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO room_access 
      (id, room_id, user_id, access_type, permission, granted_at, granted_by, expires_at, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      access.id,
      access.roomId,
      access.userId,
      access.accessType,
      access.permission,
      access.grantedAt,
      access.grantedBy,
      access.expiresAt || null,
      access.active
    ).run();
  }

  async getUserRoomAccess(userId: string, roomId: string): Promise<RoomAccess | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM room_access WHERE user_id = ? AND room_id = ? AND active = TRUE
    `);
    
    const result = await stmt.bind(userId, roomId).first<any>();
    if (!result) return null;

    return this.mapDbToAccess(result);
  }

  async getUserAccessibleRooms(userId: string): Promise<{room: RoomProperty, access: RoomAccess}[]> {
    const stmt = this.db.prepare(`
      SELECT 
        rp.*,
        ra.id as access_id,
        ra.access_type,
        ra.permission as access_permission,
        ra.granted_at,
        ra.granted_by,
        ra.expires_at,
        ra.active
      FROM room_properties rp
      JOIN room_access ra ON rp.room_id = ra.room_id
      WHERE ra.user_id = ? AND ra.active = TRUE
      ORDER BY rp.last_modified DESC
    `);
    
    const results = await stmt.bind(userId).all<any>();
    return results.results.map(row => ({
      room: this.mapDbToRoomProperty(row),
      access: {
        id: row.access_id,
        roomId: row.room_id,
        userId,
        accessType: row.access_type,
        permission: row.access_permission,
        grantedAt: row.granted_at,
        grantedBy: row.granted_by,
        expiresAt: row.expires_at,
        active: !!row.active
      }
    }));
  }

  // Helper mapping functions
  private mapDbToRoomProperty(row: any): RoomProperty {
    return {
      roomId: row.room_id,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      createdAt: row.created_at,
      lastModified: row.last_modified,
      published: !!row.published,
      permission: row.permission,
      description: row.description,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      coverPageId: row.cover_page_id,
      thumbnail: row.thumbnail
    };
  }

  private mapDbToCollaboration(row: any): RoomCollaboration {
    return {
      id: row.id,
      roomId: row.room_id,
      userId: row.user_id,
      userName: row.user_name,
      role: row.role,
      joinedAt: row.joined_at,
      lastActive: row.last_active,
      invitedBy: row.invited_by,
      status: row.status
    };
  }

  private mapDbToInteraction(row: any): RoomInteraction {
    return {
      id: row.id,
      roomId: row.room_id,
      userId: row.user_id,
      userName: row.user_name,
      interactionType: row.interaction_type,
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  private mapDbToAccess(row: any): RoomAccess {
    return {
      id: row.id,
      roomId: row.room_id,
      userId: row.user_id,
      accessType: row.access_type,
      permission: row.permission,
      grantedAt: row.granted_at,
      grantedBy: row.granted_by,
      expiresAt: row.expires_at,
      active: !!row.active
    };
  }
}