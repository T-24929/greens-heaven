'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Send, LogIn, MessageSquare, AlertCircle, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { getPhotoComments, addPhotoComment, checkUserTicketStatus } from '../utils/photoSocial.js';
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
  const [ticketStatus, setTicketStatus] = useState(() => ({
    isSignedIn: Boolean(user?.id),
    hasTicket: false,
    attendeeName: user?.user_metadata?.full_name || null,
    loading: Boolean(user?.id),
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const listEndRef = useRef(null);

  const photoId = photo?.id || (typeof photoIndex === 'number' ? `photo_${photoIndex + 1}` : null);

  // Check ticket status whenever user changes or drawer opens
  useEffect(() => {
    let active = true;
    if (!user) return;

    checkUserTicketStatus(user).then((res) => {
      if (active) {
        setTicketStatus({
          ...res,
          loading: false,
        });
      }
    });

    return () => {
      active = false;
    };
  }, [user, isOpen]);

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

    if (!user) {
      setErrorMsg('Please sign in to comment.');
      return;
    }

    if (!ticketStatus.hasTicket) {
      setErrorMsg('Commenting is exclusive to confirmed Greens Heaven ticket holders.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    const res = await addPhotoComment(photoId, newComment, user);
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
            ticketStatus.hasTicket ? (
              <div className="user-signed-in-pill">
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span>
                  Verified Attendee: <strong>{ticketStatus.attendeeName}</strong>
                </span>
              </div>
            ) : (
              <div className="user-no-ticket-pill">
                <ShieldAlert size={14} className="text-amber-400" />
                <span>Ticket required to comment</span>
              </div>
            )
          ) : (
            <div className="user-guest-prompt">
              <span>Ticket holders only</span>
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
              <p className="empty-desc">
                {ticketStatus.hasTicket
                  ? 'Be the first to share your memory on this photo!'
                  : 'Confirmed ticket holders can comment on this photo.'}
              </p>
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

        {/* Comment Form or Verification Gate */}
        {!user ? (
          <div className="photo-comments-gate-box">
            <p className="gate-title">Sign in to join the conversation</p>
            <p className="gate-desc">
              Comments and likes are exclusive to confirmed Greens Heaven ticket holders.
            </p>
            <a href="/login?next=/gallery" className="gate-btn">
              <LogIn size={14} />
              <span>Sign In with Ticket Account</span>
            </a>
          </div>
        ) : !ticketStatus.hasTicket && !ticketStatus.loading ? (
          <div className="photo-comments-gate-box">
            <p className="gate-title">Confirmed Ticket Required</p>
            <p className="gate-desc">
              This account does not have a confirmed ticket. Only batchmates with an approved ticket can comment.
            </p>
          </div>
        ) : (
          <form className="photo-comments-form" onSubmit={handleSubmit}>
            <div className="input-row">
              <input
                type="text"
                className="comment-text-input"
                placeholder={`Add a comment as ${ticketStatus.attendeeName || 'Attendee'}...`}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                maxLength={600}
                disabled={isSubmitting}
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
        )}
      </div>
    </div>
  );
}
