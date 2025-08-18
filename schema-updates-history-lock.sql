-- Migration script to add history lock fields to existing database
-- Add history_locked, history_lock_timestamp, and plaza fields

-- Add history_locked field (default 0 = false)
ALTER TABLE rooms ADD COLUMN history_locked INTEGER DEFAULT 0;

-- Add history_lock_timestamp field (timestamp when history was locked)
ALTER TABLE rooms ADD COLUMN history_lock_timestamp INTEGER;

-- Add plaza field (default 0 = false)
ALTER TABLE rooms ADD COLUMN plaza INTEGER DEFAULT 0;

-- Create indexes for the new fields
CREATE INDEX idx_rooms_history_locked ON rooms(history_locked);
CREATE INDEX idx_rooms_plaza ON rooms(plaza);

-- Optional: Update any existing rooms if needed
-- UPDATE rooms SET history_locked = 0 WHERE history_locked IS NULL;
-- UPDATE rooms SET plaza = 0 WHERE plaza IS NULL;