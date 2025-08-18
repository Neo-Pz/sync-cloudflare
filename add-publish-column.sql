-- Add missing publish column to production database
ALTER TABLE rooms ADD COLUMN publish INTEGER DEFAULT 0;

-- Create index for the new column  
CREATE INDEX IF NOT EXISTS idx_rooms_publish ON rooms(publish);