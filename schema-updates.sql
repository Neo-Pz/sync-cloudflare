-- 扩展现有房间表，添加发布申请状态
ALTER TABLE rooms ADD COLUMN publish_request_status TEXT DEFAULT 'none'; -- 'none', 'pending', 'approved', 'rejected'
ALTER TABLE rooms ADD COLUMN publish_request_date INTEGER;
ALTER TABLE rooms ADD COLUMN admin_published INTEGER DEFAULT 0; -- 管理员是否允许发布
ALTER TABLE rooms ADD COLUMN publish_notes TEXT; -- 管理员审核备注

-- 创建发布申请表
CREATE TABLE IF NOT EXISTS publish_requests (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    room_name TEXT,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    requested_plaza INTEGER DEFAULT 0,
    request_date INTEGER NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    admin_id TEXT,
    admin_name TEXT,
    review_date INTEGER,
    notes TEXT,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);


-- 创建索引
CREATE INDEX IF NOT EXISTS idx_publish_requests_room_id ON publish_requests(room_id);
CREATE INDEX IF NOT EXISTS idx_publish_requests_user_id ON publish_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_publish_requests_status ON publish_requests(status);

CREATE INDEX IF NOT EXISTS idx_reports_room_id ON reports(room_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_report_date ON reports(report_date);

-- 创建管理员设置表
CREATE TABLE IF NOT EXISTS admin_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT,
    admin_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_admin_settings_key ON admin_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_admin_settings_admin_id ON admin_settings(admin_id);

-- 添加 plaza 字段，用于标记房间是否在广场显示
ALTER TABLE rooms ADD COLUMN plaza INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_rooms_plaza ON rooms(plaza);

-- 为测试目的，将一些已发布的房间设置为 plaza
-- 注意：此语句仅用于测试，实际部署时可以注释掉
UPDATE rooms SET plaza = 1 WHERE published = 1 LIMIT 2;