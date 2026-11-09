'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, LogIn, MessageSquare, AlertCircle } from 'lucide-react';
import { getPhotoComments, addPhotoComment } from '../utils/photoSocial.js';
import './PhotoCommentsDrawer.css';

function formatTimeAgo(isoString) {
  if (!isoString) return '';
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PhotoCommentsDrawer({
  isOpen,
  onClose,
  photo,
  photoIndex,
  user,
}) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [guestName, setGuestName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const listEndRef = useRef(null);

  const photoId = photo?.id || (typeof photoIndex === 'number' ? `photo_${photoIndex + 1}` : null);

  // Load comments whenever photo changes or drawer opens
  useEffect(() => {
    if (!isOpen || !photoId) return;
    let active = true;

    async function load() {
      const data = await getPhotoComments(photoId);
      if (active) setComments(data || []);
    }

    load();
    return () => {
      active = false;
    };
  }, [isOpen, photoId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg('');

    const res = await addPhotoComment(photoId, newComment, user, guestName);
    setIsSubmitting(false);

    if (res?.error) {
      setErrorMsg(res.error);
      return;
    }

    if (res?.comment) {
      setComments((prev) => [res.comment, ...prev]);
      setNewComment('');
    }
  };

  if (!isOpen) return null;

  const currentUserName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    null;

  return (
    <div className="photo-comments-overlay" onClick={onClose}>
      <div className="photo-comments-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="photo-comments-header">
          <div className="photo-comments-title-wrap">
            <span className="photo-comments-badge">#{photoIndex + 1}</span>
            <div className="photo-comments-meta">
              <h3>{photo?.title || `Photo #${photoIndex + 1}`}</h3>
              <p className="photo-comments-sub">
                {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
              </p>
            </div>
          </div>

          <button className="photo-comments-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* User Status Bar */}
        <div className="photo-comments-user-bar">
          {user ? (
            <div className="user-signed-in-pill">
              <span className="user-status-dot online" />
              <span>Signed in as <strong>{currentUserName}</strong></span>
            </div>
          ) : (
            <div className="user-guest-prompt">
              <span>Commenting as guest</span>
              <a href="/login?next=/gallery" className="sign-in-link">
                <LogIn size={13} />
                <span>Sign in</span>
              </a>
            </div>
          )}
        </div>

        {/* Comments List */}
        <div className="photo-comments-list">
          {comments.length === 0 ? (
            <div className="photo-comments-empty">
              <MessageSquare size={28} className="empty-icon" />
              <p className="empty-title">No comments yet</p>
              <p className="empty-desc">Be the first to share your thoughts on this photo!</p>
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="comment-item">
                <div className="comment-avatar">
                  {c.user_avatar ? (
                    <img src={c.user_avatar} alt={c.user_name} />
                  ) : (
                    <span>{(c.user_name || 'U').charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="comment-body">
                  <div className="comment-meta">
                    <span className="comment-author">{c.user_name}</span>
                    <span className="comment-time">{formatTimeAgo(c.created_at)}</span>
                  </div>
                  <p className="comment-content">{c.content}</p>
                </div>
              </div>
            ))
          )}
          <div ref={listEndRef} />
        </div>

        {/* Error / Rate limit notification */}
        {errorMsg && (
          <div className="photo-comments-error">
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Comment Form */}
        <form className="photo-comments-form" onSubmit={handleSubmit}>
          {!user && (
            <input
              type="text"
              className="guest-name-input"
              placeholder="Your name (optional)"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              maxLength={40}
            />
          )}

          <div className="input-row">
            <input
              type="text"
              className="comment-text-input"
              placeholder={user ? `Add a comment as ${currentUserName}...` : 'Write a comment...'}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              maxLength={600}
            />
            <button
              type="submit"
              className="comment-submit-btn"
              disabled={!newComment.trim() || isSubmitting}
              title="Post Comment"
            >
              <Send size={15} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
