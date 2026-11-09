import { useEffect, useRef, useState, useCallback } from 'react';
import { useGesture } from '@use-gesture/react';

const clamp = (val, min, max) => Math.min(Math.max(val, min), max);

export default function InfiniteGrid({ photos = [], onPhotoClick }) {
  const canvasRef = useRef(null);
  const textureCacheRef = useRef(new Map());

  // Camera & Physics State
  const camRef = useRef({
    x: 0,
    y: 0,
    scale: 1,
    targetScale: 1,
    vx: 0,
    vy: 0,
    isDragging: false,
    hoveredPhoto: null,
  });

  const [hoveredTitle, setHoveredTitle] = useState(null);

  // Grid layout geometry
  const cols = 9; // 9 columns of photos
  const colWidth = 320;
  const gap = 24;
  const unitW = colWidth + gap;

  // Calculate grid positions for all photos
  const gridItems = useRef([]);

  useEffect(() => {
    if (!photos || photos.length === 0) return;

    // Track column heights for a neat masonry-like packing
    const colHeights = new Array(cols).fill(0);
    const items = [];

    photos.forEach((photo, i) => {
      // Find shortest column
      let minCol = 0;
      for (let c = 1; c < cols; c++) {
        if (colHeights[c] < colHeights[minCol]) minCol = c;
      }

      const aspect =
        photo.aspectRatio || (photo.width && photo.height ? photo.width / photo.height : 1.33);
      const cardHeight = Math.round(colWidth / aspect);

      const x = minCol * unitW;
      const y = colHeights[minCol];

      items.push({
        photo,
        index: i,
        x,
        y,
        width: colWidth,
        height: cardHeight,
        aspect,
      });

      colHeights[minCol] += cardHeight + gap;
    });

    const maxH = Math.max(...colHeights);
    gridItems.current = {
      items,
      totalW: cols * unitW,
      totalH: maxH,
    };
  }, [photos, unitW, cols, colWidth, gap]);

  // Texture loader
  const getTexture = useCallback((photo) => {
    if (!photo) return null;
    if (textureCacheRef.current.has(photo.id)) {
      return textureCacheRef.current.get(photo.id);
    }
    const img = new Image();
    img.src = photo.thumbnailUrl;
    img.onload = () => {
      textureCacheRef.current.set(photo.id, img);
    };
    return null;
  }, []);

  // 1. Render Loop with Modulo Infinite Wrap in All 4 Directions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth * window.devicePixelRatio;
      canvas.height = window.innerHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();
    window.addEventListener('resize', resize);

    let mouse = { x: -9999, y: -9999 };
    const onPointerMove = (e) => {
      mouse = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', onPointerMove);

    function render() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      const cam = camRef.current;

      // Apply momentum friction when not dragging
      if (!cam.isDragging) {
        cam.x += cam.vx;
        cam.y += cam.vy;
        cam.vx *= 0.94;
        cam.vy *= 0.94;
      }

      // Smooth zoom interpolation
      cam.scale += (cam.targetScale - cam.scale) * 0.12;

      const { items, totalW, totalH } = gridItems.current;
      if (!items || items.length === 0 || !totalW || !totalH) {
        animId = requestAnimationFrame(render);
        return;
      }

      const s = cam.scale;
      let foundHover = null;

      // Draw virtualized infinite photos
      items.forEach((item) => {
        // Calculate coordinate relative to camera
        const relX = item.x * s + cam.x;
        const relY = item.y * s + cam.y;

        // Modulo Infinite Wrap so you can pan forever in all 4 directions!
        const spanW = totalW * s;
        const spanH = totalH * s;

        let screenX = ((relX % spanW) + spanW) % spanW;
        if (screenX > w) screenX -= spanW;

        let screenY = ((relY % spanH) + spanH) % spanH;
        if (screenY > h) screenY -= spanH;

        const drawW = item.width * s;
        const drawH = item.height * s;

        // Frustum culling: Only draw if within screen viewport bounds (+200px margin)
        if (screenX + drawW < -100 || screenX > w + 100 || screenY + drawH < -100 || screenY > h + 100) {
          return;
        }

        // Hover detection
        const isHovered =
          mouse.x >= screenX &&
          mouse.x <= screenX + drawW &&
          mouse.y >= screenY &&
          mouse.y <= screenY + drawH;

        if (isHovered && !foundHover) {
          foundHover = item.photo;
        }

        const renderW = isHovered ? drawW * 1.04 : drawW;
        const renderH = isHovered ? drawH * 1.04 : drawH;
        const posX = isHovered ? screenX - (renderW - drawW) / 2 : screenX;
        const posY = isHovered ? screenY - (renderH - drawH) / 2 : screenY;

        // Card shadow & glowing border
        ctx.save();
        if (isHovered) {
          ctx.shadowColor = 'rgba(53, 207, 104, 0.9)';
          ctx.shadowBlur = 24;
          ctx.fillStyle = '#21b354';
        } else {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
          ctx.shadowBlur = 12;
          ctx.fillStyle = 'rgba(23, 40, 28, 0.85)';
        }

        // Outer border
        ctx.beginPath();
        ctx.roundRect(posX - 2, posY - 2, renderW + 4, renderH + 4, 14);
        ctx.fill();
        ctx.restore();

        // Draw photo texture
        const img = getTexture(item.photo);
        if (img && img.complete) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(posX, posY, renderW, renderH, 12);
          ctx.clip();
          ctx.drawImage(img, posX, posY, renderW, renderH);
          ctx.restore();
        } else {
          ctx.fillStyle = '#0f2015';
          ctx.fillRect(posX, posY, renderW, renderH);
        }

        // Photo Index Tag (#42)
        if (s > 0.5) {
          ctx.fillStyle = 'rgba(4, 10, 6, 0.8)';
          ctx.beginPath();
          ctx.roundRect(posX + 10, posY + 10, 42, 20, 6);
          ctx.fill();
          ctx.fillStyle = '#5ef38e';
          ctx.font = '600 11px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`#${item.index + 1}`, posX + 31, posY + 20);
        }
      });

      cam.hoveredPhoto = foundHover;
      setHoveredTitle(foundHover ? foundHover.title : null);

      animId = requestAnimationFrame(render);
    }

    animId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [getTexture]);

  // 2. Gesture Handling: Smooth Drag Momentum & Wheel Zoom
  useGesture(
    {
      onDragStart: () => {
        camRef.current.isDragging = true;
        camRef.current.vx = 0;
        camRef.current.vy = 0;
      },
      onDrag: ({ delta: [dx, dy], velocity: [vx, vy], direction: [dirX, dirY], last }) => {
        camRef.current.x += dx * 1.1;
        camRef.current.y += dy * 1.1;

        if (last) {
          camRef.current.isDragging = false;
          // Apply velocity momentum flick
          if (vx > 0.05 || vy > 0.05) {
            camRef.current.vx = clamp(vx * dirX, -2.5, 2.5) * 28;
            camRef.current.vy = clamp(vy * dirY, -2.5, 2.5) * 28;
          }
        }
      },
      onWheel: ({ delta: [, dy], event }) => {
        event.preventDefault();
        const factor = dy > 0 ? 0.92 : 1.08;
        camRef.current.targetScale = clamp(camRef.current.targetScale * factor, 0.45, 2.0);
      },
    },
    {
      target: canvasRef,
      wheel: { eventOptions: { passive: false } },
    }
  );

  const handleClick = () => {
    if (camRef.current.hoveredPhoto && onPhotoClick) {
      onPhotoClick(camRef.current.hoveredPhoto);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: 'grab',
          touchAction: 'none',
        }}
      />
    </div>
  );
}
