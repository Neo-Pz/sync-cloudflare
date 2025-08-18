-- 生产环境数据库Schema - 优化版本
-- 清理并重建所有表

-- 核心房间表
CREATE TABLE rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_modified INTEGER NOT NULL,
    owner_id TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    published INTEGER DEFAULT 0,
    permission TEXT DEFAULT 'viewer' CHECK (permission IN ('viewer', 'editor', 'assist')),
    history_locked INTEGER DEFAULT 0,
    plaza INTEGER DEFAULT 0,
    description TEXT,
    tags TEXT -- JSON array as string
);

-- 用户活动记录表（核心功能）
CREATE TABLE user_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    user_name TEXT,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('room_visit', 'room_create', 'room_edit', 'room_share')),
    room_id TEXT NOT NULL,
    room_name TEXT,
    activity_timestamp INTEGER NOT NULL,
    session_duration INTEGER,
    interaction_count INTEGER DEFAULT 0,
    metadata TEXT, -- JSON for extensibility
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- 管理员设置表
CREATE TABLE admin_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT,
    admin_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- 核心索引（性能优化）
CREATE INDEX idx_rooms_owner ON rooms(owner_id);
CREATE INDEX idx_rooms_published ON rooms(published, plaza);
CREATE INDEX idx_rooms_modified ON rooms(last_modified DESC);

CREATE INDEX idx_activities_user_time ON user_activities(user_id, activity_timestamp DESC);
CREATE INDEX idx_activities_room ON user_activities(room_id, activity_type);
CREATE INDEX idx_activities_type_time ON user_activities(activity_type, activity_timestamp DESC);

-- 用户房间统计视图
CREATE VIEW user_room_stats AS
SELECT 
    user_id,
    room_id,
    room_name,
    COUNT(*) as visit_count,
    MAX(activity_timestamp) as last_visit,
    SUM(COALESCE(session_duration, 0)) as total_duration,
    SUM(interaction_count) as total_interactions
FROM user_activities 
WHERE activity_type = 'room_visit'
GROUP BY user_id, room_id
ORDER BY last_visit DESC;

-- 房间热度统计视图
CREATE VIEW room_popularity AS
SELECT 
    r.id,
    r.name,
    r.owner_name,
    COUNT(DISTINCT a.user_id) as unique_visitors,
    COUNT(a.id) as total_visits,
    MAX(a.activity_timestamp) as last_activity,
    r.published,
    r.plaza
FROM rooms r
LEFT JOIN user_activities a ON r.id = a.room_id AND a.activity_type = 'room_visit'
WHERE r.published = 1
GROUP BY r.id
ORDER BY total_visits DESC;