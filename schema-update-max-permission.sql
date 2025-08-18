-- 添加最大权限字段
ALTER TABLE rooms ADD COLUMN max_permission TEXT DEFAULT 'editor';