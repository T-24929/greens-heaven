import { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft,
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
  const [authUser, setAuthUser] = useState(null);
  const user = propUser ?? authUser;

  useEffect(() => {
    if (propUser || !supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setAuthUser(data.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user || null);
    });
    return () => subscription?.unsubscribe();
  }, [propUser]);

  // Lightbox Inspection State
  const [focusedPhoto, setFocusedPhoto] = useState(null);
  const [isZoomedIn, setIsZoomedIn] = useState(false);

  // Load 513 album manifest
  useEffect(() => {
    async function loadAlbum() {
      try {
        const res = await fetch('/gallery/space-manifest.json');
        if (res.ok) {
          const data = await res.json();
          setManifest(data);
        }
      } catch (err) {
        console.warn('Could not load space manifest:', err.message);
      }
    }
    loadAlbum();
  }, []);

  const openInspection = useCallback((photo) => {
    setFocusedPhoto(photo);
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
      } else if (e.key === 'ArrowRight') {
        const idx = manifest.photos.findIndex((p) => p.id === focusedPhoto.id);
        const next = manifest.photos[(idx + 1) % manifest.photos.length];
        setFocusedPhoto(next);
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

      {/* Atmospheric Loading State */}
      {!manifest?.photos && (
        <div className="gallery-space-loader">
          <div className="gallery-loader-orb" />
          <p className="gallery-loader-label">Preparing 513 event memories…</p>
        </div>
      )}

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
          FULLSCREEN LOSSLESS INSPECTION LIGHTBOX (Clean, No Unwanted Text)
         ========================================================= */}
      {focusedPhoto && (
        <div className="inspection-modal-overlay" onClick={() => setFocusedPhoto(null)}>
          <div className="inspection-header" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <button
                className={`action-pill-btn download-pill-btn ${downloadSuccess ? 'text-emerald-400 border-emerald-500/40' : ''}`}
                onClick={() => handleDownloadPhoto(focusedPhoto)}
                title="Download photo"
                disabled={downloadingPhoto}
              >
                {downloadingPhoto ? (
                  <Loader2 size={16} className="animate-spin text-emerald-400" />
                ) : downloadSuccess ? (
                  <Check size={16} className="text-emerald-400" />
                ) : (
                  <Download size={16} />
                )}
                <span>Download</span>
              </button>

              <button
                className="action-pill-btn close-pill-btn text-gray-300 hover:text-white"
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
                onError={(e) => {
                  if (focusedPhoto.thumbnailUrl && e.target.src !== focusedPhoto.thumbnailUrl) {
                    e.target.src = focusedPhoto.thumbnailUrl;
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
