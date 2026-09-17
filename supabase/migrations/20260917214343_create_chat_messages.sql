/*
# Create chat_messages table for AI assistant history

1. New Tables
- `chat_messages`
  - `id` (uuid, primary key)
  - `session_id` (text, identifies the terminal session this chat is attached to)
  - `role` (text, either 'user' or 'assistant')
  - `model` (text, which AI model produced the response, e.g. 'claude', 'gemini', 'codex', 'opencode')
  - `content` (text, the message content)
  - `terminal_context` (text, nullable, snapshot of terminal output at the time the message was sent)
  - `command_executed` (text, nullable, if the AI suggested a command that was run)
  - `created_at` (timestamp, defaults to now)

2. Security
- Enable RLS on `chat_messages`.
- Single-tenant app with no sign-in: allow anon + authenticated full CRUD.
- All data is intentionally shared within the local session context.

3. Notes
- This table stores AI chat history linked to terminal sessions.
- The `terminal_context` column captures terminal output at the time a user asks
  the AI a question, so the AI can "see" what's on the terminal.
- The `command_executed` column tracks when an AI-suggested command is run in the terminal.
*/

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  model text NOT NULL DEFAULT 'claude',
  content text NOT NULL,
  terminal_context text,
  command_executed text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_chat_messages" ON chat_messages;
CREATE POLICY "anon_select_chat_messages" ON chat_messages FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_chat_messages" ON chat_messages;
CREATE POLICY "anon_insert_chat_messages" ON chat_messages FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_chat_messages" ON chat_messages;
CREATE POLICY "anon_update_chat_messages" ON chat_messages FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_chat_messages" ON chat_messages;
CREATE POLICY "anon_delete_chat_messages" ON chat_messages FOR DELETE
  TO anon, authenticated USING (true);
