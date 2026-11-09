import { supabase, isSupabaseConfigured } from './supabase.js';

// ─── Ticket Holder Verification & Cache ───────────────────────────────────────
const ticketStatusCache = new Map();

export async function checkUserTicketStatus(user) {
  if (!user?.id) {
    return {
      isSignedIn: false,
      hasTicket: false,
      isApproved: false,
      isAdmin: false,
      attendeeName: null,
    };
  }

  if (ticketStatusCache.has(user.id)) {
    return ticketStatusCache.get(user.id);
  }

  if (!isSupabaseConfigured || !supabase) {
    const fallback = {
      isSignedIn: true,
      hasTicket: true,
      isApproved: true,
      isAdmin: false,
      attendeeName: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Attendee',
    };
    return fallback;
  }

  try {
    // 1. Check if user is admin
    let isAdmin = Boolean(user.app_metadata?.role === 'admin' || user.app_metadata?.is_admin);
    if (!isAdmin) {
      try {
        const { data: adminCheck } = await supabase.rpc('is_admin');
        isAdmin = Boolean(adminCheck);
      } catch {
        // ignore
      }
    }

    // 2. Check reservation status
    const { data: reservation } = await supabase
      .from('reservations')
      .select('id, status, full_name')
      .eq('user_id', user.id)
      .maybeSingle();

    const isApproved = reservation?.status === 'approved';
    const hasTicket = isApproved || isAdmin;
    const attendeeName =
      reservation?.full_name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'Attendee';

    const result = {
      isSignedIn: true,
      hasTicket,
      isApproved,
      isAdmin,
      attendeeName,
    };

    ticketStatusCache.set(user.id, result);
    return result;
  } catch (err) {
    console.warn('Error checking ticket status:', err);
    return {
      isSignedIn: true,
      hasTicket: false,
      isApproved: false,
      isAdmin: false,
      attendeeName: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Attendee',
    };
  }
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────────
const likeTimestamps = [];
const commentTimestamps = [];

export function checkLikeRateLimit() {
  const now = Date.now();
  while (likeTimestamps.length > 0 && now - likeTimestamps[0] > 10000) {
    likeTimestamps.shift();
  }
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
  if (commentTimestamps.length >= 4) {
    const waitSec = Math.ceil((60000 - (now - commentTimestamps[0])) / 1000);
    return { allowed: false, message: `Commenting fast! Please wait ${waitSec}s` };
  }
  commentTimestamps.push(now);
  return { allowed: true };
}

// ─── Local Storage Cache Fallback ─────────────────────────────────────────────
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
    // Ignore quota errors
  }
}

// ─── Likes API (Ticket Holders Only) ──────────────────────────────────────────
export async function getPhotoLikes(photoId, userId) {
  const defaultRes = { count: 0, isLiked: false };
  if (!photoId) return defaultRes;

  const localLikes = getLocalCache(`likes_${photoId}`, { count: 0, users: [] });

  if (!isSupabaseConfigured || !supabase) {
    const isLiked = userId ? localLikes.users.includes(userId) : false;
    return { count: localLikes.count || 0, isLiked };
  }

  try {
    // 1. Fetch total count
    const { count, error: countErr } = await supabase
      .from('photo_likes')
      .select('*', { count: 'exact', head: true })
      .eq('photo_id', photoId);

    if (countErr) {
      const isLiked = userId ? localLikes.users.includes(userId) : false;
      return { count: localLikes.count || 0, isLiked };
    }

    // 2. Check if current user has liked
    let isLiked = false;
    if (userId) {
      const { data: userLike } = await supabase
        .from('photo_likes')
        .select('id')
        .eq('photo_id', photoId)
        .eq('user_id', userId)
        .maybeSingle();
      if (userLike) isLiked = true;
    }

    return { count: count || 0, isLiked };
  } catch (err) {
    console.warn('Error fetching photo likes from Supabase:', err);
    const isLiked = userId ? localLikes.users.includes(userId) : false;
    return { count: localLikes.count || 0, isLiked };
  }
}

export async function togglePhotoLike(photoId, currentIsLiked, user) {
  if (!photoId) return { error: 'No photo selected' };

  if (!user?.id) {
    return {
      error: 'Please sign in with your confirmed ticket account to like photos.',
      requiresAuth: true,
      isLiked: currentIsLiked,
    };
  }

  const status = await checkUserTicketStatus(user);
  if (!status.hasTicket) {
    return {
      error: 'Likes are exclusive to confirmed Greens Heaven ticket holders.',
      requiresTicket: true,
      isLiked: currentIsLiked,
    };
  }

  const rateLimit = checkLikeRateLimit();
  if (!rateLimit.allowed) {
    return { error: rateLimit.message, isLiked: currentIsLiked };
  }

  const userId = user.id;
  const nextIsLiked = !currentIsLiked;

  // Optimistic local update
  const localLikes = getLocalCache(`likes_${photoId}`, { count: 0, users: [] });
  if (nextIsLiked) {
    if (!localLikes.users.includes(userId)) localLikes.users.push(userId);
    localLikes.count = Math.max(0, localLikes.count + 1);
  } else {
    localLikes.users = localLikes.users.filter((u) => u !== userId);
    localLikes.count = Math.max(0, localLikes.count - 1);
  }
  setLocalCache(`likes_${photoId}`, localLikes);

  if (!isSupabaseConfigured || !supabase) {
    return { count: localLikes.count, isLiked: nextIsLiked };
  }

  try {
    if (nextIsLiked) {
      const { error: insErr } = await supabase.from('photo_likes').insert({
        photo_id: photoId,
        user_id: userId,
      });
      if (insErr && insErr.code !== '23505') {
        console.warn('Supabase like insert error:', insErr);
        if (insErr.code === '42501') {
          return {
            error: 'Only confirmed ticket holders can like photos.',
            requiresTicket: true,
            isLiked: currentIsLiked,
          };
        }
      }
    } else {
      const { error: delErr } = await supabase
        .from('photo_likes')
        .delete()
        .eq('photo_id', photoId)
        .eq('user_id', userId);
      if (delErr) console.warn('Supabase unlike error:', delErr);
    }

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

// ─── Comments API (Ticket Holders Only) ───────────────────────────────────────
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

export async function addPhotoComment(photoId, content, user) {
  if (!photoId) return { error: 'No photo selected' };

  if (!user?.id) {
    return {
      error: 'Please sign in with your confirmed ticket account to comment.',
      requiresAuth: true,
    };
  }

  const status = await checkUserTicketStatus(user);
  if (!status.hasTicket) {
    return {
      error: 'Commenting is exclusive to confirmed Greens Heaven ticket holders.',
      requiresTicket: true,
    };
  }

  const trimmed = (content || '').trim();
  if (!trimmed) {
    return { error: 'Comment cannot be empty' };
  }
  if (trimmed.length > 600) {
    return { error: 'Comment must be under 600 characters' };
  }

  const rateLimit = checkCommentRateLimit();
  if (!rateLimit.allowed) {
    return { error: rateLimit.message };
  }

  const userName = status.attendeeName || 'Ticket Holder';
  const userAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;

  const newComment = {
    id: 'c_' + Math.random().toString(36).slice(2, 10),
    photo_id: photoId,
    user_id: user.id,
    user_name: userName,
    user_avatar: userAvatar,
    content: trimmed,
    created_at: new Date().toISOString(),
  };

  const localComments = getLocalCache(`comments_${photoId}`, []);
  localComments.unshift(newComment);
  setLocalCache(`comments_${photoId}`, localComments);

  if (!isSupabaseConfigured || !supabase) {
    return { comment: newComment };
  }

  try {
    const payload = {
      photo_id: photoId,
      user_id: user.id,
      user_name: userName,
      user_avatar: userAvatar,
      content: trimmed,
    };

    const { data, error } = await supabase
      .from('photo_comments')
      .insert(payload)
      .select('id, photo_id, user_id, user_name, user_avatar, content, created_at')
      .single();

    if (error) {
      console.warn('Supabase comment insert error:', error);
      if (error.code === '42501') {
        return { error: 'Commenting is exclusive to confirmed ticket holders.' };
      }
      return { comment: newComment };
    }

    return { comment: data || newComment };
  } catch (err) {
    console.warn('Error inserting comment to Supabase:', err);
    return { comment: newComment };
  }
}
