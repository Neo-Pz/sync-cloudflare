-- 添加历史锁定人相关字段
ALTER TABLE rooms ADD COLUMN history_locked_by TEXT;
ALTER TABLE rooms ADD COLUMN history_locked_by_name TEXT;