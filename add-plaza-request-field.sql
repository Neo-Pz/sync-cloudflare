-- 为房间表添加 plaza_request 字段的迁移脚本
-- 用于现有部署的数据库升级

-- 添加 plaza_request 字段
ALTER TABLE rooms ADD COLUMN plaza_request INTEGER DEFAULT 0;

-- 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_rooms_plaza_request ON rooms(plaza_request);

-- 验证字段添加
PRAGMA table_info(rooms);