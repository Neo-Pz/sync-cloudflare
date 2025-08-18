-- 添加永久分享配置表
-- 支持资源永久定位与权限远程控制

CREATE TABLE IF NOT EXISTS share_configs (
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