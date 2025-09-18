-- Migration 14: Create tb_user_model table for storing user's model preferences
-- This table stores user's selected models (text, image, video) preferences

CREATE TABLE IF NOT EXISTS tb_user_model (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_uuid TEXT NOT NULL,
    model TEXT NOT NULL,  -- JSON string containing provider, model_name, type
    ctime DATETIME DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    mtime DATETIME DEFAULT (STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE(user_uuid)  -- One record per user
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_model_uuid ON tb_user_model(user_uuid);

-- Update database version
UPDATE db_version SET version = 14;