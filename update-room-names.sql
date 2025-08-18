-- Update existing rooms to have names if they don't
-- This will set default names for rooms that have empty or null name fields

-- First, let's see what we have
SELECT id, name, owner_name, created_at FROM rooms LIMIT 10;

-- Update rooms with null or empty names to have default names
UPDATE rooms 
SET name = CASE 
    WHEN name IS NULL OR name = '' THEN 
        'Room by ' || COALESCE(owner_name, owner_id, 'Unknown') || ' #' || substr(id, 1, 8)
    ELSE name 
END
WHERE name IS NULL OR name = '';

-- Verify the update
SELECT id, name, owner_name FROM rooms LIMIT 10;