import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Download,
  Check,
  Loader2,
  X,
} from 'lucide-react';
import DepthRibbon from '../components/DepthRibbon.jsx';
import { supabase } from '../utils/supabase.js';
import './SpaceGalleryPage.css';

export default function SpaceGalleryPage({ user: propUser }) {
  const [manifest, setManifest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(propUser || null);

  useEffect(() => {
    if (propUser) {
      setUser(propUser);
      return;
    }
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUser(data.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => subscription?.unsubscribe();
  }, [propUser]);

  // Lightbox Inspection State (100% Pristine Master Lossless Inspection)
  const [focusedPhoto, setFocusedPhoto] = useState(null);
  const [fullResLoaded, setFullResLoaded] = useState(false);
  const [isZoomedIn, setIsZoomedIn] = useState(false);

  // Load 513 album manifest
  useEffect(() => {
    async function loadAlbum() {
      try {
        setLoading(true);
        const res = await fetch('/gallery/space-manifest.json');
        if (res.ok) {
          const data = await res.json();
          setManifest(data);
        }
      } catch (err) {
        console.warn('Could not load space manifest:', err.message);
      } finally {
        setLoading(false);
      }
    }
    loadAlbum();
  }, []);

  const openInspection = useCallback((photo) => {
    setFocusedPhoto(photo);
    setFullResLoaded(false);
    setIsZoomedIn(false);
  }, []);

  // Keyboard navigation for Fullscreen Inspection Lightbox (Arrow keys & Escape)
  useEffect(() => {
    if (!focusedPhoto || !manifest?.photos?.length) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setFocusedPhoto(null);
      } else if (e.key === 'ArrowLeft') {
        const idx = manifest.photos.findIndex((p) => p.id === focusedPhoto.id);
        const prev = manifest.photos[(idx - 1 + manifest.photos.length) % manifest.photos.length];
        setFocusedPhoto(prev);
        setFullResLoaded(false);
      } else if (e.key === 'ArrowRight') {
        const idx = manifest.photos.findIndex((p) => p.id === focusedPhoto.id);
        const next = manifest.photos[(idx + 1) % manifest.photos.length];
        setFocusedPhoto(next);
        setFullResLoaded(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedPhoto, manifest?.photos]);

  // Full-Res Master Download Handler
  const [downloadingPhoto, setDownloadingPhoto] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handleDownloadPhoto = useCallback(async (photo) => {
    if (!photo || downloadingPhoto) return;
    setDownloadingPhoto(true);
    setDownloadSuccess(false);

    const preferredUrl = photo.originalUrl || photo.thumbnailUrl;
    const fallbackUrl = photo.thumbnailUrl || photo.originalUrl;
    const filename = photo.filename || `${photo.title || 'photo'}.jpg`;

    try {
      let res = await fetch(preferredUrl);
      if (!res.ok && fallbackUrl && fallbackUrl !== preferredUrl) {
        res = await fetch(fallbackUrl);
      }
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      setDownloadSuccess(true);
    } catch {
      const link = document.createElement('a');
      link.href = fallbackUrl || preferredUrl;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloadSuccess(true);
    } finally {
      setDownloadingPhoto(false);
      setTimeout(() => setDownloadSuccess(false), 2000);
    }
  }, [downloadingPhoto]);

  return (
    <div className="camera-space-root" style={{ background: '#040805' }}>
      {/* Top Header: "The Event" Back Link on left, Web Logo on right */}
      <header className="camera-top-bar">
        <a href="/" className="back-link">
          <ArrowLeft size={16} className="text-emerald-400" />
          <span>The Event</span>
        </a>

        <a href="/" className="brand-logo-link" aria-label="Greens Heaven home">
          <img
            src="/images/greens-heaven-logo.png"
            alt="Greens Heaven"
            className="brand-logo-img"
          />
        </a>
      </header>

      {/* =========================================================
          3D DEPTH RIBBON VIEWPORT (React Bits Pro Spec)
         ========================================================= */}
      {manifest?.photos && (
        <DepthRibbon
          items={manifest.photos}
          photos={manifest.photos}
          user={user}
          onPhotoClick={openInspection}
          path="spiral"
          tour="ride"
          speed={0}
          fog={1}
          offset={1.0}
          fov={48}
          thread={0}
          holdToReveal={false}
          focusOnClick={true}
          captions={true}
        />
      )}

      {/* =========================================================
          FULLSCREEN LOSSLESS INSPECTION LIGHTBOX (Original Ratio)
         ========================================================= */}
      {focusedPhoto && (
        <div className="inspection-modal-overlay" onClick={() => setFocusedPhoto(null)}>
          <div className="inspection-header" onClick={(e) => e.stopPropagation()}>
            <div className="inspection-title-wrap">
              <h2>{focusedPhoto.title}</h2>
              <span className="aspect-pill">
                Original Ratio ({focusedPhoto.width} × {focusedPhoto.height} px)
              </span>
              <span className="aspect-pill text-emerald-400">
                {fullResLoaded ? '100% Lossless Master' : 'Loading Master...'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                className={`action-pill-btn ${downloadSuccess ? 'text-emerald-400 border-emerald-500/40' : ''}`}
                onClick={() => handleDownloadPhoto(focusedPhoto)}
                title="Download full-resolution master photo"
                disabled={downloadingPhoto}
              >
                {downloadingPhoto ? (
                  <Loader2 size={16} className="animate-spin text-emerald-400" />
                ) : downloadSuccess ? (
                  <Check size={16} className="text-emerald-400" />
                ) : (
                  <Download size={16} />
                )}
                <span>{downloadSuccess ? 'Saved' : 'Download'}</span>
              </button>

              <button
                className="action-pill-btn"
                onClick={() => setIsZoomedIn((z) => !z)}
                title={isZoomedIn ? 'Fit view' : '1:1 Master Resolution'}
              >
                {isZoomedIn ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
                <span>{isZoomedIn ? 'Fit View' : '1:1 Master'}</span>
              </button>

              <button
                className="action-pill-btn text-gray-300 hover:text-white"
                onClick={() => setFocusedPhoto(null)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="inspection-viewport" onClick={(e) => e.stopPropagation()}>
            {/* Prev / Next Dolly Buttons */}
            <button
              className="nav-dolly-btn nav-dolly-prev"
              onClick={() => {
                const idx = manifest.photos.findIndex((p) => p.id === focusedPhoto.id);
                const prev = manifest.photos[(idx - 1 + manifest.photos.length) % manifest.photos.length];
                setFocusedPhoto(prev);
                setFullResLoaded(false);
              }}
              title="Previous Photo"
            >
              <ChevronLeft size={24} />
            </button>

            <button
              className="nav-dolly-btn nav-dolly-next"
              onClick={() => {
                const idx = manifest.photos.findIndex((p) => p.id === focusedPhoto.id);
                const next = manifest.photos[(idx + 1) % manifest.photos.length];
                setFocusedPhoto(next);
                setFullResLoaded(false);
              }}
              title="Next Photo"
            >
              <ChevronRight size={24} />
            </button>

            {/* High-Res Master Image */}
            <div
              className={`inspection-img-container ${isZoomedIn ? 'is-zoomed' : ''}`}
              onClick={() => setIsZoomedIn((z) => !z)}
            >
              <img
                src={focusedPhoto.originalUrl}
                alt={focusedPhoto.title}
                className="inspection-master-img"
                onLoad={() => setFullResLoaded(true)}
                onError={(e) => {
                  if (focusedPhoto.thumbnailUrl && e.target.src !== focusedPhoto.thumbnailUrl) {
                    e.target.src = focusedPhoto.thumbnailUrl;
                    setFullResLoaded(true);
                  }
                }}
              />
            </div>
          </div>

          <div className="inspection-footer" onClick={(e) => e.stopPropagation()}>
            <span>Click photo to toggle 1:1 zoom · Use Arrow keys to navigate</span>
            <span className="text-gray-500 font-mono">
              Master: {focusedPhoto.filename}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
