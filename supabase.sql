-- Run this once in Supabase: Project > SQL Editor > New query > paste all > Run

create table if not exists users (
  id text primary key,
  username text unique not null,
  password_hash text not null,
  role text not null default 'member',
  created_at timestamptz default now()
);

create table if not exists branches (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists orders (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists restampings (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists replacements (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz default now()
);

-- These tables are only ever reached through the Netlify Function using the
-- service role key (server-side), never directly from the browser, so we
-- leave Row Level Security off. Do not expose SUPABASE_SERVICE_ROLE_KEY to
-- the browser/frontend — it must only ever live in Netlify's environment
-- variables.
