import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useGesture } from '@use-gesture/react';

const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

export default function DraggableGrid({
  photos = [],
  onPhotoClick,
  columns = 5,
  gap = 24,
  dragSensitivity = 1,
  momentumFriction = 0.94,
  maxVelocity = 2.5,
}) {
  const containerRef = useRef(null);
  const gridRef = useRef(null);
  
  // Transform State (x, y, scale)
  const posRef = useRef({ x: 0, y: 0, scale: 1 });
  const animFrameRef = useRef(null);
  const isDraggingRef = useRef(false);

  const [, setScale] = useState(1);

  // Apply CSS translate3d & scale with hardware acceleration
  const applyTransform = useCallback((x, y, s) => {
    if (gridRef.current) {
      gridRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
    }
  }, []);

  // Stop running inertia animation
  const stopMomentum = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  // Physics-based momentum glide on release
  const startMomentum = useCallback(
    (vx, vy) => {
      stopMomentum();

      let vX = clamp(vx, -maxVelocity, maxVelocity) * 35;
      let vY = clamp(vy, -maxVelocity, maxVelocity) * 35;

      const step = () => {
        vX *= momentumFriction;
        vY *= momentumFriction;

        if (Math.abs(vX) < 0.05 && Math.abs(vY) < 0.05) {
          animFrameRef.current = null;
          return;
        }

        posRef.current.x += vX;
        posRef.current.y += vY;

        applyTransform(posRef.current.x, posRef.current.y, posRef.current.scale);
        animFrameRef.current = requestAnimationFrame(step);
      };

      animFrameRef.current = requestAnimationFrame(step);
    },
    [maxVelocity, momentumFriction, applyTransform, stopMomentum]
  );

  // Gesture handling: Smooth drag & fling momentum with @use-gesture/react
  useGesture(
    {
      onDragStart: () => {
        stopMomentum();
        isDraggingRef.current = true;
      },
      onDrag: ({ offset: [ox, oy], velocity: [vx, vy], direction: [dx, dy], last }) => {
        posRef.current.x = ox * dragSensitivity;
        posRef.current.y = oy * dragSensitivity;
        applyTransform(posRef.current.x, posRef.current.y, posRef.current.scale);

        if (last) {
          isDraggingRef.current = false;
          // Apply velocity momentum
          if (vx > 0.05 || vy > 0.05) {
            startMomentum(vx * dx, vy * dy);
          }
        }
      },
      onPinch: ({ offset: [d] }) => {
        const nextScale = clamp(1 + d / 400, 0.4, 2.2);
        posRef.current.scale = nextScale;
        setScale(nextScale);
        applyTransform(posRef.current.x, posRef.current.y, nextScale);
      },
      onWheel: ({ delta: [, dy], event }) => {
        event.preventDefault();
        const factor = dy > 0 ? 0.92 : 1.08;
        const nextScale = clamp(posRef.current.scale * factor, 0.4, 2.2);
        posRef.current.scale = nextScale;
        setScale(nextScale);
        applyTransform(posRef.current.x, posRef.current.y, nextScale);
      },
    },
    {
      target: containerRef,
      drag: {
        from: () => [posRef.current.x / dragSensitivity, posRef.current.y / dragSensitivity],
      },
      wheel: {
        eventOptions: { passive: false },
      },
    }
  );

  // Smooth scroll / pan to a specific photo element
  const panToPhoto = useCallback(
    (photoId) => {
      const el = document.getElementById(`grid-photo-${photoId}`);
      if (!el || !containerRef.current) return;

      stopMomentum();

      const elRect = el.getBoundingClientRect();
      const contRect = containerRef.current.getBoundingClientRect();

      const targetX = posRef.current.x + (contRect.width / 2 - (elRect.left + elRect.width / 2));
      const targetY = posRef.current.y + (contRect.height / 2 - (elRect.top + elRect.height / 2));

      // Animate smoothly to target
      let startX = posRef.current.x;
      let startY = posRef.current.y;
      let progress = 0;

      const glide = () => {
        progress += 0.08;
        if (progress >= 1) {
          posRef.current.x = targetX;
          posRef.current.y = targetY;
          applyTransform(targetX, targetY, posRef.current.scale);
          return;
        }

        // Cubic ease out
        const ease = 1 - Math.pow(1 - progress, 3);
        const curX = startX + (targetX - startX) * ease;
        const curY = startY + (targetY - startY) * ease;

        posRef.current.x = curX;
        posRef.current.y = curY;
        applyTransform(curX, curY, posRef.current.scale);
        requestAnimationFrame(glide);
      };

      requestAnimationFrame(glide);
    },
    [applyTransform, stopMomentum]
  );

  // Expose panToPhoto via DOM custom event
  useEffect(() => {
    const handleJump = (e) => {
      if (e.detail?.photoId) {
        panToPhoto(e.detail.photoId);
      }
    };
    window.addEventListener('grid:jump-to-photo', handleJump);
    return () => window.removeEventListener('grid:jump-to-photo', handleJump);
  }, [panToPhoto]);

  // Split photos into columns for organic masonry with original aspect ratios
  const columnData = useMemo(() => {
    const cols = Array.from({ length: columns }, () => []);
    photos.forEach((photo, i) => {
      cols[i % columns].push({ photo, index: i });
    });
    return cols;
  }, [photos, columns]);

  return (
    <div
      ref={containerRef}
      className="draggable-grid-viewport"
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        cursor: 'grab',
        touchAction: 'none',
        background: '#040805',
        userSelect: 'none',
      }}
    >
      {/* Draggable Inner Canvas with Momentum */}
      <div
        ref={gridRef}
        className="draggable-grid-canvas"
        style={{
          display: 'flex',
          gap: `${gap}px`,
          padding: '120px 80px',
          width: 'max-content',
          willChange: 'transform',
          transformOrigin: '50% 50%',
        }}
      >
        {columnData.map((col, colIdx) => (
          <div
            key={colIdx}
            className="draggable-grid-column"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: `${gap}px`,
              width: '320px',
            }}
          >
            {col.map(({ photo, index }) => {
              const aspect =
                photo.aspectRatio || (photo.width && photo.height ? photo.width / photo.height : 1.33);

              return (
                <div
                  id={`grid-photo-${photo.id}`}
                  key={photo.id}
                  className="draggable-photo-card"
                  onClick={() => {
                    if (!isDraggingRef.current && onPhotoClick) {
                      onPhotoClick(photo);
                    }
                  }}
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: `${aspect}`,
                    borderRadius: '18px',
                    overflow: 'hidden',
                    background: '#0d1810',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                    border: '1px solid rgba(53, 207, 104, 0.2)',
                    transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.03) translateY(-4px)';
                    e.currentTarget.style.borderColor = '#5ef38e';
                    e.currentTarget.style.boxShadow = '0 20px 40px rgba(0,0,0,0.8), 0 0 24px rgba(53, 207, 104, 0.3)';
                    e.currentTarget.style.zIndex = '10';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1) translateY(0)';
                    e.currentTarget.style.borderColor = 'rgba(53, 207, 104, 0.2)';
                    e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.6)';
                    e.currentTarget.style.zIndex = '1';
                  }}
                >
                  {/* Photo Thumbnail with Original Ratio */}
                  <img
                    src={photo.thumbnailUrl}
                    alt={photo.title || 'Memory'}
                    loading="lazy"
                    draggable={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Photo Title & Index Overlay on Hover */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: '12px 14px',
                      background: 'linear-gradient(180deg, transparent 0%, rgba(3, 7, 4, 0.9) 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      pointerEvents: 'none',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: '#f0f4f1',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '75%',
                      }}
                    >
                      {photo.title}
                    </span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        color: '#5ef38e',
                        fontFamily: 'monospace',
                        fontWeight: 600,
                      }}
                    >
                      #{index + 1}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
