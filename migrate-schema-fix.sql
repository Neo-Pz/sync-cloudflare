-- Add missing columns to rooms table
ALTER TABLE rooms ADD COLUMN shared INTEGER DEFAULT 0;
ALTER TABLE rooms ADD COLUMN plaza INTEGER DEFAULT 0;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_rooms_shared ON rooms(shared);
CREATE INDEX IF NOT EXISTS idx_rooms_plaza ON rooms(plaza);

-- Update existing data if needed
UPDATE rooms SET shared = is_shared WHERE shared IS NULL;