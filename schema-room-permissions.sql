-- 更新房间权限控制结构
-- 添加更细粒度的权限控制字段

-- 添加新的权限控制字段
ALTER TABLE rooms ADD COLUMN public_access_enabled INTEGER DEFAULT 0;  -- 是否允许公开访问
ALTER TABLE rooms ADD COLUMN public_permission TEXT DEFAULT 'viewer';   -- 公开访问的权限级别
ALTER TABLE rooms ADD COLUMN share_enabled INTEGER DEFAULT 1;           -- 是否允许分享
ALTER TABLE rooms ADD COLUMN visitor_permission TEXT DEFAULT 'viewer';  -- 访客默认权限
ALTER TABLE rooms ADD COLUMN require_approval INTEGER DEFAULT 0;        -- 是否需要房主批准访问

-- 更新现有字段含义
-- permission: 房间成员的默认权限
-- max_permission: 房间允许的最高权限级别
-- public_permission: 公开访问的权限级别 (viewer/assist/editor)
-- visitor_permission: 非成员访客的权限级别

-- 创建权限级别约束
-- viewer: 只读访问，查看最新快照
-- assist: 可新增内容，不能修改历史
-- editor: 完全编辑权限，实时协作