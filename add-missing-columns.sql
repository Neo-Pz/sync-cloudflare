-- Add only the missing history lock columns
ALTER TABLE rooms ADD COLUMN history_locked INTEGER DEFAULT 0;
ALTER TABLE rooms ADD COLUMN history_lock_timestamp INTEGER;