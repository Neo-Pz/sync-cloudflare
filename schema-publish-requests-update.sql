-- 更新发布申请表结构
-- 适配新的管理员审核系统

-- 首先删除旧表（如果存在）
DROP TABLE IF EXISTS publish_requests_old;

-- 重命名现有表作为备份
ALTER TABLE publish_requests RENAME TO publish_requests_old;

-- 创建新的发布申请表
CREATE TABLE IF NOT EXISTS publish_requests (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  room_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  requested_plaza INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  submitted_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

-- 迁移数据（如果旧表存在数据）
INSERT INTO publish_requests (
  id, room_id, room_name, user_id, user_name, 
  requested_plaza, status, submitted_at, reviewed_at, reviewed_by
)
SELECT 
  id, 
  room_id, 
  COALESCE(room_name, '未命名房间') as room_name,
  user_id, 
  user_name,
  COALESCE(requested_plaza, 0) as requested_plaza,
  status,
  COALESCE(submitted_at, request_date, created_at) as submitted_at,
  COALESCE(reviewed_at, review_date) as reviewed_at,
  COALESCE(reviewed_by, admin_name) as reviewed_by
FROM publish_requests_old 
WHERE EXISTS (SELECT 1 FROM publish_requests_old);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_publish_requests_room_id ON publish_requests(room_id);
CREATE INDEX IF NOT EXISTS idx_publish_requests_status ON publish_requests(status);
CREATE INDEX IF NOT EXISTS idx_publish_requests_submitted_at ON publish_requests(submitted_at);
CREATE INDEX IF NOT EXISTS idx_publish_requests_user_id ON publish_requests(user_id);

-- 删除备份表（可选，根据需要保留）
-- DROP TABLE IF EXISTS publish_requests_old;

-- 验证表结构
PRAGMA table_info(publish_requests);