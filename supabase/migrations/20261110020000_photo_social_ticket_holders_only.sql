-- Migration: Restrict Photo Likes and Comments strictly to confirmed ticket holders & admins

-- 1. Table Grants
GRANT SELECT, INSERT, DELETE ON public.photo_likes TO authenticated;
GRANT SELECT ON public.photo_likes TO anon;

GRANT SELECT, INSERT ON public.photo_comments TO authenticated;
GRANT SELECT ON public.photo_comments TO anon;

-- 2. Remove anonymous write policies
DROP POLICY IF EXISTS "photo_likes_insert_anon" ON public.photo_likes;
DROP POLICY IF EXISTS "photo_likes_delete_anon" ON public.photo_likes;
DROP POLICY IF EXISTS "photo_comments_insert_anon" ON public.photo_comments;

-- 3. Ticket Holder Authorization Check Function
CREATE OR REPLACE FUNCTION public.can_socialize()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.user_id = auth.uid() AND r.status = 'approved'
    )
    OR private.is_admin()
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_socialize() TO authenticated, anon;

-- 4. Enforce ticket-holder constraint on likes insert
DROP POLICY IF EXISTS "photo_likes_insert_auth" ON public.photo_likes;
CREATE POLICY "photo_likes_insert_auth" ON public.photo_likes
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND public.can_socialize()
  );

-- 5. Enforce ticket-holder constraint on comments insert
DROP POLICY IF EXISTS "photo_comments_insert_auth" ON public.photo_comments;
CREATE POLICY "photo_comments_insert_auth" ON public.photo_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND char_length(trim(content)) > 0
    AND public.can_socialize()
  );
