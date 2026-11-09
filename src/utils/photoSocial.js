import { supabase, isSupabaseConfigured } from './supabase.js';

// ─── Anonymous Client Identifier ─────────────────────────────────────────────
// Allows guest users to like and track their likes across sessions
export function getOrCreateClientId() {
  if (typeof window === 'undefined') return 'server';
  let cid = localStorage.getItem('gh_photo_client_id');
  if (!cid) {
    cid = 'guest_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now().toString(36);
    try {
      localStorage.setItem('gh_photo_client_id', cid);
    } catch {
      // Ignore localStorage restrictions in private/incognito mode
    }
  }
  return cid;
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────────
// Protects against spamming likes or comments
const likeTimestamps = [];
const commentTimestamps = [];

export function checkLikeRateLimit() {
  const now = Date.now();
  // Clear timestamps older than 10 seconds
  while (likeTimestamps.length > 0 && now - likeTimestamps[0] > 10000) {
    likeTimestamps.shift();
  }
  // Max 6 likes per 10 seconds
  if (likeTimestamps.length >= 6) {
    const waitSec = Math.ceil((10000 - (now - likeTimestamps[0])) / 1000);
    return { allowed: false, message: `Please slow down! Wait ${waitSec}s` };
  }
  likeTimestamps.push(now);
  return { allowed: true };
}

export function checkCommentRateLimit() {
  const now = Date.now();
  while (commentTimestamps.length > 0 && now - commentTimestamps[0] > 60000) {
    commentTimestamps.shift();
  }
  // Max 4 comments per minute
  if (commentTimestamps.length >= 4) {
    const waitSec = Math.ceil((60000 - (now - commentTimestamps[0])) / 1000);
    return { allowed: false, message: `Commenting fast! Please wait ${waitSec}s` };
  }
  commentTimestamps.push(now);
  return { allowed: true };
}

// ─── Local Storage Cache Fallback ─────────────────────────────────────────────
// Guarantees zero UI downtime even if database migration is pending
function getLocalCache(key, defaultVal) {
  try {
    const val = localStorage.getItem(`gh_photo_${key}`);
    return val ? JSON.parse(val) : defaultVal;
  } catch {
    return defaultVal;
  }
}

function setLocalCache(key, val) {
  try {
    localStorage.setItem(`gh_photo_${key}`, JSON.stringify(val));
  } catch {
    // Ignore localStorage quota errors
  }
}

// ─── Likes API ────────────────────────────────────────────────────────────────
export async function getPhotoLikes(photoId, userId, clientId) {
  const defaultRes = { count: 0, isLiked: false };
  if (!photoId) return defaultRes;

  const localLikes = getLocalCache(`likes_${photoId}`, { count: 0, users: [] });
  const cid = clientId || getOrCreateClientId();

  if (!isSupabaseConfigured || !supabase) {
    const isLiked = userId ? localLikes.users.includes(userId) : localLikes.users.includes(cid);
    return { count: localLikes.count || 0, isLiked };
  }

  try {
    // 1. Fetch total count
    const { count, error: countErr } = await supabase
      .from('photo_likes')
      .select('*', { count: 'exact', head: true })
      .eq('photo_id', photoId);

    if (countErr) {
      // Table not yet migrated or inaccessible -> use local cache
      const isLiked = userId ? localLikes.users.includes(userId) : localLikes.users.includes(cid);
      return { count: localLikes.count || 0, isLiked };
    }

    // 2. Check if current user or client has liked
    let isLiked = false;
    if (userId) {
      const { data: userLike } = await supabase
        .from('photo_likes')
        .select('id')
        .eq('photo_id', photoId)
        .eq('user_id', userId)
        .maybeSingle();
      if (userLike) isLiked = true;
    } else if (cid) {
      const { data: clientLike } = await supabase
        .from('photo_likes')
        .select('id')
        .eq('photo_id', photoId)
        .eq('client_id', cid)
        .maybeSingle();
      if (clientLike) isLiked = true;
    }

    return { count: count || 0, isLiked };
  } catch (err) {
    console.warn('Error fetching photo likes from Supabase:', err);
    const isLiked = userId ? localLikes.users.includes(userId) : localLikes.users.includes(cid);
    return { count: localLikes.count || 0, isLiked };
  }
}

export async function togglePhotoLike(photoId, currentIsLiked, userId, clientId) {
  // Check rate limit
  const rateLimit = checkLikeRateLimit();
  if (!rateLimit.allowed) {
    return { error: rateLimit.message, isLiked: currentIsLiked };
  }

  const cid = clientId || getOrCreateClientId();
  const nextIsLiked = !currentIsLiked;

  // Optimistic local update
  const localLikes = getLocalCache(`likes_${photoId}`, { count: 0, users: [] });
  const actor = userId || cid;
  if (nextIsLiked) {
    if (!localLikes.users.includes(actor)) localLikes.users.push(actor);
    localLikes.count = Math.max(0, localLikes.count + 1);
  } else {
    localLikes.users = localLikes.users.filter((u) => u !== actor);
    localLikes.count = Math.max(0, localLikes.count - 1);
  }
  setLocalCache(`likes_${photoId}`, localLikes);

  if (!isSupabaseConfigured || !supabase) {
    return { count: localLikes.count, isLiked: nextIsLiked };
  }

  try {
    if (nextIsLiked) {
      // Add like
      const row = { photo_id: photoId };
      if (userId) row.user_id = userId;
      else row.client_id = cid;

      const { error: insErr } = await supabase.from('photo_likes').insert(row);
      if (insErr && insErr.code !== '23505') {
        console.warn('Supabase like insert error:', insErr);
      }
    } else {
      // Remove like
      let query = supabase.from('photo_likes').delete().eq('photo_id', photoId);
      if (userId) query = query.eq('user_id', userId);
      else query = query.eq('client_id', cid);

      const { error: delErr } = await query;
      if (delErr) console.warn('Supabase unlike error:', delErr);
    }

    // Refresh live count from DB
    const { count } = await supabase
      .from('photo_likes')
      .select('*', { count: 'exact', head: true })
      .eq('photo_id', photoId);

    return { count: typeof count === 'number' ? count : localLikes.count, isLiked: nextIsLiked };
  } catch (err) {
    console.warn('Error toggling like on Supabase:', err);
    return { count: localLikes.count, isLiked: nextIsLiked };
  }
}

// ─── Comments API ─────────────────────────────────────────────────────────────
export async function getPhotoComments(photoId) {
  if (!photoId) return [];

  const localComments = getLocalCache(`comments_${photoId}`, []);

  if (!isSupabaseConfigured || !supabase) {
    return localComments;
  }

  try {
    const { data, error } = await supabase
      .from('photo_comments')
      .select('id, photo_id, user_id, user_name, user_avatar, content, created_at')
      .eq('photo_id', photoId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase fetch comments error:', error);
      return localComments;
    }

    return data && data.length > 0 ? data : localComments;
  } catch (err) {
    console.warn('Error fetching comments from Supabase:', err);
    return localComments;
  }
}

export async function addPhotoComment(photoId, content, user, guestName = 'Greens Heaven Guest') {
  const trimmed = (content || '').trim();
  if (!trimmed) {
    return { error: 'Comment cannot be empty' };
  }
  if (trimmed.length > 600) {
    return { error: 'Comment must be under 600 characters' };
  }

  // Check rate limit
  const rateLimit = checkCommentRateLimit();
  if (!rateLimit.allowed) {
    return { error: rateLimit.message };
  }

  const userName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    guestName ||
    'Guest';

  const userAvatar =
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    null;

  const newComment = {
    id: 'c_' + Math.random().toString(36).slice(2, 10),
    photo_id: photoId,
    user_id: user?.id || null,
    user_name: userName,
    user_avatar: userAvatar,
    content: trimmed,
    created_at: new Date().toISOString(),
  };

  // Local storage cache update
  const localComments = getLocalCache(`comments_${photoId}`, []);
  localComments.unshift(newComment);
  setLocalCache(`comments_${photoId}`, localComments);

  if (!isSupabaseConfigured || !supabase) {
    return { comment: newComment };
  }

  try {
    const payload = {
      photo_id: photoId,
      content: trimmed,
      user_name: userName,
      user_avatar: userAvatar,
    };
    if (user?.id) payload.user_id = user.id;

    const { data, error } = await supabase
      .from('photo_comments')
      .insert(payload)
      .select('id, photo_id, user_id, user_name, user_avatar, content, created_at')
      .single();

    if (error) {
      console.warn('Supabase comment insert error:', error);
      return { comment: newComment };
    }

    return { comment: data || newComment };
  } catch (err) {
    console.warn('Error inserting comment to Supabase:', err);
    return { comment: newComment };
  }
}
