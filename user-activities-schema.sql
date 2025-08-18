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