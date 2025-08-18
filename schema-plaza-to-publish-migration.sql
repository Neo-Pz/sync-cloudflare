-- Migration: Rename plaza column to publish
-- This script updates the database schema to use 'publish' instead of 'plaza'

-- Step 1: Add new publish column
ALTER TABLE rooms ADD COLUMN publish INTEGER DEFAULT 0;

-- Step 2: Copy data from plaza to publish (if plaza column exists)
UPDATE rooms SET publish = plaza WHERE plaza IS NOT NULL;

-- Step 3: Drop old plaza column (commented out for safety)
-- Note: SQLite doesn't support DROP COLUMN directly in older versions
-- You might need to recreate the table if you want to completely remove plaza column
-- ALTER TABLE rooms DROP COLUMN plaza;

-- For now, we keep both columns for backward compatibility
-- The application will use 'publish' column going forward

-- Create index on publish column for better performance
CREATE INDEX IF NOT EXISTS idx_rooms_publish ON rooms(publish);

-- Update any existing plaza=1 records to publish=1
UPDATE rooms SET publish = 1 WHERE plaza = 1;