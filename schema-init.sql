-- D1 database schema for tldraw room metadata
-- This schema supports the Room interface from RoomManager.tsx

CREATE TABLE rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_modified INTEGER NOT NULL,
    owner TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    is_shared INTEGER DEFAULT 0,
    shared INTEGER DEFAULT 0,
    published INTEGER DEFAULT 0,
    permission TEXT DEFAULT 'editor',
    max_permission TEXT DEFAULT 'editor',
    thumbnail TEXT,
    cover_page_id TEXT,
    publish_status TEXT DEFAULT 'private',
    description TEXT,
    tags TEXT, -- JSON array stored as string
    publish_request_status TEXT DEFAULT 'none',
    publish_request_date INTEGER,
    admin_published INTEGER DEFAULT 1,
    publish_notes TEXT,
    history_locked INTEGER DEFAULT 0,
    history_lock_timestamp INTEGER,
    history_locked_by TEXT,
    history_locked_by_name TEXT,
    publish INTEGER DEFAULT 0,
    plaza INTEGER DEFAULT 0
);

-- Publish requests table
CREATE TABLE publish_requests (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    request_date INTEGER NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    admin_id TEXT,
    admin_name TEXT,
    review_date INTEGER,
    notes TEXT,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);

-- Admin action logs table
CREATE TABLE admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id TEXT NOT NULL,
    admin_name TEXT,
    action TEXT NOT NULL,
    target_type TEXT, -- room, user, request, report
    target_id TEXT,
    details TEXT,
    timestamp INTEGER NOT NULL
);

-- Reports table (missing from original)
CREATE TABLE reports (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    reporter_id TEXT NOT NULL,
    reporter_name TEXT,
    report_date INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    reason TEXT,
    details TEXT,
    admin_id TEXT,
    admin_name TEXT,
    review_date INTEGER,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);

-- .tldr 文件存储表
CREATE TABLE IF NOT EXISTS tldr_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  room_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_modified INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  is_public INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- .tldr 文件内容表（分离存储以优化查询性能）
CREATE TABLE IF NOT EXISTS tldr_file_contents (
  file_id TEXT PRIMARY KEY,
  content TEXT NOT NULL, -- JSON格式的.tldr文件内容
  compressed INTEGER DEFAULT 0, -- 是否压缩存储
  FOREIGN KEY (file_id) REFERENCES tldr_files(id) ON DELETE CASCADE
);

-- .tldr 文件索引
CREATE INDEX IF NOT EXISTS idx_tldr_files_owner_id ON tldr_files(owner_id);
CREATE INDEX IF NOT EXISTS idx_tldr_files_room_id ON tldr_files(room_id);
CREATE INDEX IF NOT EXISTS idx_tldr_files_public ON tldr_files(is_public);
CREATE INDEX IF NOT EXISTS idx_tldr_files_created_at ON tldr_files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tldr_files_download_count ON tldr_files(download_count DESC);

-- Create indexes for common queries
CREATE INDEX idx_rooms_owner_id ON rooms(owner_id);
CREATE INDEX idx_rooms_published ON rooms(published);
CREATE INDEX idx_rooms_last_modified ON rooms(last_modified);
CREATE INDEX idx_rooms_created_at ON rooms(created_at);
CREATE INDEX idx_rooms_admin_published ON rooms(admin_published);

CREATE INDEX idx_publish_requests_room_id ON publish_requests(room_id);
CREATE INDEX idx_publish_requests_user_id ON publish_requests(user_id);
CREATE INDEX idx_publish_requests_status ON publish_requests(status);
CREATE INDEX idx_publish_requests_request_date ON publish_requests(request_date);

CREATE INDEX idx_reports_room_id ON reports(room_id);
CREATE INDEX idx_reports_reporter_id ON reports(reporter_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_report_date ON reports(report_date);

CREATE INDEX idx_admin_logs_admin_id ON admin_logs(admin_id);
CREATE INDEX idx_admin_logs_timestamp ON admin_logs(timestamp);
CREATE INDEX idx_admin_logs_action ON admin_logs(action);

-- Admin settings table
CREATE TABLE admin_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT,
    admin_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_admin_settings_key ON admin_settings(setting_key);
CREATE INDEX idx_admin_settings_admin_id ON admin_settings(admin_id);

-- 用户行为记录表
CREATE TABLE IF NOT EXISTS user_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,              -- 用户ID (来自Clerk)
  user_name TEXT,                     -- 用户名（缓存用于快速查询）
  activity_type TEXT NOT NULL,        -- 活动类型: 'room_visit', 'room_create', 'room_edit', 'room_share'
  room_id TEXT NOT NULL,              -- 房间ID
  room_name TEXT,                     -- 房间名称（缓存用于快速查询）
  activity_timestamp INTEGER NOT NULL, -- 活动时间戳
  session_duration INTEGER,           -- 会话持续时间（秒）- 对于room_visit
  interaction_count INTEGER DEFAULT 0, -- 互动次数（编辑、添加形状等）
  last_page_id TEXT,                  -- 最后访问的页面ID
  last_page_name TEXT,                -- 最后访问的页面名称
  metadata TEXT,                      -- 额外的元数据（JSON格式）
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_user_activities_user_id ON user_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activities_room_id ON user_activities(room_id);
CREATE INDEX IF NOT EXISTS idx_user_activities_type ON user_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_user_activities_timestamp ON user_activities(activity_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_activities_user_room ON user_activities(user_id, room_id);
CREATE INDEX IF NOT EXISTS idx_user_activities_user_timestamp ON user_activities(user_id, activity_timestamp DESC);

-- 创建用户房间访问统计视图
CREATE VIEW IF NOT EXISTS user_room_stats AS
SELECT 
  user_id,
  room_id,
  room_name,
  COUNT(*) as visit_count,
  MAX(activity_timestamp) as last_visit,
  SUM(session_duration) as total_duration,
  SUM(interaction_count) as total_interactions,
  AVG(session_duration) as avg_session_duration
FROM user_activities 
WHERE activity_type = 'room_visit'
GROUP BY user_id, room_id;

-- 永久分享配置表
-- 支持资源永久定位与权限远程控制
CREATE TABLE share_configs (
  shareId TEXT PRIMARY KEY,              -- 唯一分享ID
  roomId TEXT NOT NULL,                  -- 房间ID
  pageId TEXT,                          -- 页面ID（可选）
  permission TEXT NOT NULL CHECK (permission IN ('viewer', 'assist', 'editor')), -- 权限级别
  isActive INTEGER NOT NULL DEFAULT 1,   -- 是否启用（房主控制）
  createdBy TEXT NOT NULL,              -- 创建者用户ID
  createdAt INTEGER NOT NULL,           -- 创建时间戳
  lastAccessed INTEGER,                 -- 最后访问时间
  accessCount INTEGER DEFAULT 0,        -- 访问次数
  maxAccess INTEGER,                    -- 最大访问次数限制（可选）
  description TEXT,                     -- 分享描述
  
  FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE CASCADE
);

-- 分享配置索引
CREATE INDEX IF NOT EXISTS idx_share_configs_room ON share_configs(roomId);
CREATE INDEX IF NOT EXISTS idx_share_configs_created_by ON share_configs(createdBy);
CREATE INDEX IF NOT EXISTS idx_share_configs_active ON share_configs(isActive);
CREATE INDEX IF NOT EXISTS idx_share_configs_created_at ON share_configs(createdAt DESC);