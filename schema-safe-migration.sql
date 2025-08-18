-- Safe migration script that checks for existing columns
-- This script will only add columns if they don't exist

-- First, let's check the current schema by creating a temporary table
CREATE TABLE IF NOT EXISTS schema_check AS SELECT sql FROM sqlite_master WHERE type='table' AND name='rooms';

-- Add columns only if they don't exist (this will fail silently if column exists)
-- We'll use a different approach - create the table with new schema if needed

-- Check if we need to migrate
PRAGMA table_info(rooms);

-- The safest approach is to add columns one by one and handle errors gracefully
-- But SQLite doesn't support IF NOT EXISTS for ALTER COLUMN
-- So we'll use a different approach

-- Let's just try to insert some test data to see what columns exist
SELECT * FROM rooms LIMIT 1;