-- VibeLoop schema. Safe to re-run: every statement is idempotent, and the
-- ALTER/DO blocks upgrade databases created from earlier versions of this file.

-- Core Users Table (guests are real rows so history, chat and wallets can reference them)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(32) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash TEXT,
    is_guest BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_url TEXT,
    gender VARCHAR(10) DEFAULT 'other',
    country_code VARCHAR(3) DEFAULT 'ALL',
    vibe_balance NUMERIC(10, 2) DEFAULT 10.00,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN country_code TYPE VARCHAR(3);
ALTER TABLE users ALTER COLUMN country_code SET DEFAULT 'ALL';

-- Wallet: earned_balance holds cash-out gift earnings; daily_* track the Meet-to-Earn cap
ALTER TABLE users ADD COLUMN IF NOT EXISTS earned_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_earned_tokens NUMERIC(5, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_earned_date DATE;

-- Real-Time Match History (20-second threshold records)
CREATE TABLE IF NOT EXISTS match_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    peer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    duration_seconds INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'match_history' AND column_name = 'matched_user_id'
    ) THEN
        ALTER TABLE match_history RENAME COLUMN matched_user_id TO peer_id;
    END IF;
END $$;

-- Token Transactions
CREATE TABLE IF NOT EXISTS token_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(10, 2) NOT NULL,
    transaction_type VARCHAR(32) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_token_transactions_user ON token_transactions(user_id, created_at DESC);

-- Ephemeral Direct Messages (application keeps only the last 30 per pair)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body VARCHAR(500) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'message_text'
    ) THEN
        ALTER TABLE messages RENAME COLUMN message_text TO body;
    END IF;
END $$;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_messages_chat_pair ON messages(sender_id, recipient_id, created_at DESC);
