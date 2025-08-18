-- Add missing columns to production database
ALTER TABLE rooms ADD COLUMN shared INTEGER DEFAULT 0;

-- Create index for the new column
CREATE INDEX IF NOT EXISTS idx_rooms_shared ON rooms(shared);

-- Update existing data to sync with is_shared
UPDATE rooms SET shared = is_shared;