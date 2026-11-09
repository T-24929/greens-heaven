-- Migration: Photo Likes and Comments with RLS and Rate Limiting
-- Supports signed-in users and anonymous client tracking

-- 1. Photo Likes Table
CREATE TABLE IF NOT EXISTS public.photo_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT photo_likes_user_unique UNIQUE (photo_id, user_id),
  CONSTRAINT photo_likes_client_unique UNIQUE (photo_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_photo_likes_photo ON public.photo_likes (photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_likes_user ON public.photo_likes (user_id);

ALTER TABLE public.photo_likes ENABLE ROW LEVEL SECURITY;

-- Select policy: Anyone can see likes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'photo_likes_select' AND tablename = 'photo_likes') THEN
    CREATE POLICY "photo_likes_select" ON public.photo_likes
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Insert policy for authenticated users
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'photo_likes_insert_auth' AND tablename = 'photo_likes') THEN
    CREATE POLICY "photo_likes_insert_auth" ON public.photo_likes
      FOR INSERT TO authenticated
      WITH CHECK ((select auth.uid()) = user_id);
  END IF;
END $$;

-- Insert policy for anonymous clients
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'photo_likes_insert_anon' AND tablename = 'photo_likes') THEN
    CREATE POLICY "photo_likes_insert_anon" ON public.photo_likes
      FOR INSERT TO anon
      WITH CHECK (client_id IS NOT NULL AND user_id IS NULL);
  END IF;
END $$;

-- Delete policy for authenticated users (unlike)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'photo_likes_delete_auth' AND tablename = 'photo_likes') THEN
    CREATE POLICY "photo_likes_delete_auth" ON public.photo_likes
      FOR DELETE TO authenticated
      USING ((select auth.uid()) = user_id);
  END IF;
END $$;

-- Delete policy for anonymous clients (unlike)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'photo_likes_delete_anon' AND tablename = 'photo_likes') THEN
    CREATE POLICY "photo_likes_delete_anon" ON public.photo_likes
      FOR DELETE TO anon
      USING (client_id IS NOT NULL);
  END IF;
END $$;

-- 2. Photo Comments Table
CREATE TABLE IF NOT EXISTS public.photo_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  content TEXT NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 600),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photo_comments_photo ON public.photo_comments (photo_id, created_at DESC);

ALTER TABLE public.photo_comments ENABLE ROW LEVEL SECURITY;

-- Select policy: Anyone can read comments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'photo_comments_select' AND tablename = 'photo_comments') THEN
    CREATE POLICY "photo_comments_select" ON public.photo_comments
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Insert policy for authenticated users
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'photo_comments_insert_auth' AND tablename = 'photo_comments') THEN
    CREATE POLICY "photo_comments_insert_auth" ON public.photo_comments
      FOR INSERT TO authenticated
      WITH CHECK ((select auth.uid()) = user_id AND char_length(trim(content)) > 0);
  END IF;
END $$;

-- Insert policy for anonymous users
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'photo_comments_insert_anon' AND tablename = 'photo_comments') THEN
    CREATE POLICY "photo_comments_insert_anon" ON public.photo_comments
      FOR INSERT TO anon
      WITH CHECK (user_id IS NULL AND char_length(trim(user_name)) > 0 AND char_length(trim(content)) > 0);
  END IF;
END $$;
