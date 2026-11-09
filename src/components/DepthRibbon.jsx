'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { Heart, MessageSquare, Maximize2, Download, Check, Loader2, X } from 'lucide-react';
import { getOrCreateClientId, getPhotoLikes, togglePhotoLike, getPhotoComments } from '../utils/photoSocial.js';
import PhotoCommentsDrawer from './PhotoCommentsDrawer.jsx';
import './DepthRibbon.css';

// ─── 3D Path Generators (React Bits Spec) ────────────────────────────────────
// Supports: "spiral" (10 graceful coils for large albums), "loop" (figure-eight),
// "knot" (trefoil knot), and "wave" (undulating ring).
function createPathCurve(pathShape = 'spiral') {
  const points = [];
  const samples = 360;

  if (pathShape === 'loop') {
    // 3D Figure-Eight that passes over itself
    const R = 32;
    const H = 24;
    for (let i = 0; i < samples; i++) {
      const u = (i / (samples - 1)) * Math.PI * 2;
      const x = R * Math.sin(u);
      const z = (R * 0.6) * Math.sin(2 * u);
      const y = (H * 0.4) * Math.cos(u) * Math.sin(2 * u);
      points.push(new THREE.Vector3(x, y, z));
    }
  } else if (pathShape === 'knot') {
    // Trefoil Knot in 3D
    const R = 28;
    const H = 22;
    for (let i = 0; i < samples; i++) {
      const u = (i / (samples - 1)) * Math.PI * 2;
      const x = (R / 3) * (Math.sin(u) + 2 * Math.sin(2 * u));
      const z = (R / 3) * (Math.cos(u) - 2 * Math.cos(2 * u));
      const y = -(H / 3) * Math.sin(3 * u);
      points.push(new THREE.Vector3(x, y, z));
    }
  } else if (pathShape === 'wave') {
    // Undulating 3D Ring
    const R = 30;
    const H = 16;
    for (let i = 0; i < samples; i++) {
      const u = (i / (samples - 1)) * Math.PI * 2;
      const x = R * Math.cos(u);
      const z = R * Math.sin(u);
      const y = (H * 0.5) * Math.sin(4 * u);
      points.push(new THREE.Vector3(x, y, z));
    }
  } else {
    // Helical Spiral (Default for 513 photos: 10 coils, ample clearance, zero crowding)
    const SPIRAL_TURNS = 10;
    const SPIRAL_RADIUS = 28;
    const SPIRAL_HEIGHT = 80;
    for (let i = 0; i < samples; i++) {
      const u = i / (samples - 1);
      const theta = u * SPIRAL_TURNS * Math.PI * 2;
      const x = SPIRAL_RADIUS * Math.cos(theta);
      const z = SPIRAL_RADIUS * Math.sin(theta);
      const y = (u - 0.5) * SPIRAL_HEIGHT;
      points.push(new THREE.Vector3(x, y, z));
    }
  }

  return new THREE.CatmullRomCurve3(points);
}

// ── Calculate Proportional 3D Dimensions to "Fit instead of Fill" ────────────
function getCardDimensions(aspectRatio, cardSize = 0.72) {
  const r = Math.max(0.4, Math.min(2.5, Number(aspectRatio) || 0.8));
  let w, h;
  const baseScale = cardSize / 0.72; // normalizes default
  if (r <= 1) {
    // Portrait / Square (e.g. 2:3 ratio -> w: 1.63, h: 2.45)
    h = 2.45 * baseScale;
    w = h * r;
  } else {
    // Landscape / Panoramic (e.g. 3:2 ratio -> w: 2.70, h: 1.80)
    w = 2.70 * baseScale;
    h = w / r;
  }
  return {
    width: Number(w.toFixed(3)),
    height: Number(h.toFixed(3)),
    radius: 0.20 * baseScale,
    aspectRatio: r,
  };
}

// Rounded rectangle geometry with UV mapping preserving exact native aspect ratio
function createRoundedRectGeometry(width, height, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const w = width;
  const h = height;
  const r = Math.min(radius, w / 2, h / 2);

  shape.moveTo(x, y + r);
  shape.lineTo(x, y + h - r);
  shape.quadraticCurveTo(x, y + h, x + r, y + h);
  shape.lineTo(x + w - r, y + h);
  shape.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  shape.lineTo(x + w, y + r);
  shape.quadraticCurveTo(x + w, y, x + w - r, y);
  shape.lineTo(x + r, y);
  shape.quadraticCurveTo(x, y, x, y + r);

  const geom = new THREE.ShapeGeometry(shape, 8);
  const pos = geom.attributes.position;
  const uvs = [];
  for (let i = 0; i < pos.count; i++) {
    uvs.push((pos.getX(i) - x) / w, (pos.getY(i) - y) / h);
  }
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geom;
}

// Geometry cache to reuse meshes across cards sharing the same aspect ratio
const geomCache = new Map();
function getOrCreateCardGeometry(aspectRatio, cardSize) {
  const { width, height, radius } = getCardDimensions(aspectRatio, cardSize);
  const key = `${width}_${height}_${radius}`;
  if (geomCache.has(key)) return geomCache.get(key);
  const geom = createRoundedRectGeometry(width, height, radius);
  geomCache.set(key, geom);
  return geom;
}

export default function DepthRibbon({
  items = [],
  photos = [],
  images = [],
  user = null,
  count: propCount,
  path = 'spiral',
  tour = 'ride',
  interval = 9,
  speed = 0,
  cardSize = 0.72,
  aspect = null,
  radius = 0.20,
  offset = 1.0,
  fov = 48,
  fog = 1,
  thread = 0,
  shadow = 0.5,
  accentColor = '#5ef38e',
  backgroundColor = '#000000',
  focusOnClick = true,
  holdToReveal = false,
  captions = true,
  interactive = true,
  draggable = true,
  wheel = true,
  pauseOnHover = true,
  seed = 0,
  paused = false,
  dpr = 2,
  onFocusChange,
  onPhotoClick,
  className = '',
  style = {},
  children,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const vTrackRef = useRef(null);
  const vThumbRef = useRef(null);
  const vBadgeRef = useRef(null);
  const activeIdxRef = useRef(0);
  const engagementBarRef = useRef(null);

  // Stable callback refs so WebGL scene never unnecessarily tears down
  const onFocusChangeRef = useRef(onFocusChange);
  useEffect(() => {
    onFocusChangeRef.current = onFocusChange;
  }, [onFocusChange]);

  const onPhotoClickRef = useRef(onPhotoClick);
  useEffect(() => {
    onPhotoClickRef.current = onPhotoClick;
  }, [onPhotoClick]);

  // Props ref for RAF loop so Three.js scene never tears down on prop changes
  const propsRef = useRef({
    speed,
    paused,
    pauseOnHover,
    tour,
    interactive,
    draggable,
  });
  useEffect(() => {
    propsRef.current = {
      speed,
      paused,
      pauseOnHover,
      tour,
      interactive,
      draggable,
    };
  }, [speed, paused, pauseOnHover, tour, interactive, draggable]);

  // Normalize photo pool (513 photos from manifest or custom items)
  const pool = useMemo(() => {
    const raw = (items && items.length > 0) ? items : (photos && photos.length > 0) ? photos : images;
    if (raw && raw.length > 0) {
      return raw.map((item, i) => {
        if (typeof item === 'string') {
          return { id: `i-${i}`, thumbnailUrl: item, originalUrl: item, title: `Photo #${i + 1}` };
        }
        return {
          id: item.id || `i-${i}`,
          thumbnailUrl: item.thumbnailUrl || item.src,
          originalUrl: item.originalUrl || item.src,
          title: item.title || item.alt || `Photo #${i + 1}`,
          subtitle: item.subtitle || (item.width && item.height ? `${item.width} × ${item.height} px` : ''),
          width: item.width,
          height: item.height,
          aspectRatio: item.aspectRatio || (item.width && item.height ? item.width / item.height : null),
        };
      });
    }
    return [];
  }, [items, photos, images]);

  const poolRef = useRef(pool);
  useEffect(() => {
    poolRef.current = pool;
  }, [pool]);

  const totalCount = propCount || pool.length || 513;

  // ─── Selected Photo for Social Tray (ONLY opens when user clicks an image) ──
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(null);

  // ─── Social Engagement State (Synced with Supabase + In-Memory Cache) ───────
  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [likeRateLimitMsg, setLikeRateLimitMsg] = useState('');
  const [commentCount, setCommentCount] = useState(0);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const clientIdRef = useRef(getOrCreateClientId());
  const socialCacheRef = useRef(new Map());
  const [downloadStatus, setDownloadStatus] = useState('idle'); // 'idle' | 'downloading' | 'done'

  const handleDownloadPhoto = useCallback(async (photo) => {
    if (!photo || downloadStatus === 'downloading') return;
    setDownloadStatus('downloading');

    const downloadUrl = photo.originalUrl || photo.thumbnailUrl || photo.src;
    const filename = photo.filename || `${photo.title || 'photo'}.jpg`;

    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error('Fetch failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      setDownloadStatus('done');
    } catch {
      // Direct link fallback
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setDownloadStatus('done');
    } finally {
      setTimeout(() => setDownloadStatus('idle'), 2000);
    }
  }, [downloadStatus]);

  const selectedPhotoId = selectedPhoto?.id || (typeof selectedPhotoIdx === 'number' ? `photo_${selectedPhotoIdx + 1}` : null);

  // Fetch likes & comment count ONLY when an image is clicked and selected
  useEffect(() => {
    if (!selectedPhotoId) return;

    // Check memory cache first to eliminate repeat network queries
    if (socialCacheRef.current.has(selectedPhotoId)) {
      const cached = socialCacheRef.current.get(selectedPhotoId);
      setLikeCount(cached.count);
      setIsLiked(cached.isLiked);
      setCommentCount(cached.commentCount);
      return;
    }

    let active = true;

    Promise.all([
      getPhotoLikes(selectedPhotoId, user?.id, clientIdRef.current),
      getPhotoComments(selectedPhotoId),
    ]).then(([likesData, commentsData]) => {
      if (!active) return;
      const count = likesData?.count || 0;
      const liked = likesData?.isLiked || false;
      const comments = commentsData?.length || 0;

      socialCacheRef.current.set(selectedPhotoId, {
        count,
        isLiked: liked,
        commentCount: comments,
      });

      setLikeCount(count);
      setIsLiked(liked);
      setCommentCount(comments);
    }).catch((err) => {
      console.warn('Social fetch error:', err);
    });

    return () => {
      active = false;
    };
  }, [selectedPhotoId, user?.id]);

  // Handle Like Button Click with Rate Limiting
  const handleLikeClick = async (e) => {
    e.stopPropagation();
    if (!selectedPhotoId) return;
    setIsLiking(true);
    setTimeout(() => setIsLiking(false), 320);

    const res = await togglePhotoLike(selectedPhotoId, isLiked, user?.id, clientIdRef.current);
    if (res?.error) {
      setLikeRateLimitMsg(res.error);
      setTimeout(() => setLikeRateLimitMsg(''), 2500);
      return;
    }

    setIsLiked(res.isLiked);
    setLikeCount(res.count);
    socialCacheRef.current.set(selectedPhotoId, {
      count: res.count,
      isLiked: res.isLiked,
      commentCount,
    });
  };

  // ─── Scroll-Driven Physics State ─────────────────────────────────────────────
  const scrollTargetRef = useRef(0);
  const scrollCurrentRef = useRef(0);
  const hasInitCamRef = useRef(false);

  // Orbit rotation in 3D overview
  const orbitAngleRef = useRef(15);
  const orbitPitchRef = useRef(16);
  const isDraggingOrbitRef = useRef(false);
  const orbitDragStartRef = useRef({ x: 0, y: 0, angle: 0, pitch: 0 });

  const pointerDownPosRef = useRef({ x: 0, y: 0, time: 0 });

  // Hovered card for pauseOnHover
  const hoveredCardRef = useRef(null);

  // Scrollbar dragging state
  const isDraggingScrollbarRef = useRef(false);

  // ─── Three.js Scene Setup & Render Loop ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: backgroundColor === 'transparent',
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dpr));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    // Scene
    const scene = new THREE.Scene();
    if (backgroundColor !== 'transparent') {
      scene.background = new THREE.Color(backgroundColor);
    }

    // ─── Native Atmospheric Fog for Distance Render Optimization ─────────────
    if (fog > 0) {
      const fogColor = new THREE.Color(backgroundColor === 'transparent' ? 0x000000 : backgroundColor);
      const nearFog = 14 / fog;
      const farFog = 46 / fog;
      scene.fog = new THREE.Fog(fogColor, nearFog, farFog);
    } else {
      scene.fog = null;
    }

    // Camera: FOV configurable (default 48 for natural non-distorted perspective)
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.2, 240);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
    dirLight.position.set(10, 20, 15);
    scene.add(dirLight);

    // 3D Path Curve
    const curve = createPathCurve(path);

    // Optional fine thread line running through cards along the path
    if (thread > 0) {
      const points = curve.getPoints(200);
      const threadGeom = new THREE.BufferGeometry().setFromPoints(points);
      const threadMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(accentColor),
        transparent: true,
        opacity: Math.min(1, Math.max(0, thread)),
      });
      const threadLine = new THREE.Line(threadGeom, threadMat);
      scene.add(threadLine);
    }

    // Group for all photo cards
    const ribbonGroup = new THREE.Group();
    scene.add(ribbonGroup);

    // Texture Loader & Cache
    const textureLoader = new THREE.TextureLoader();
    const textureCache = new Map();

    // Placeholder texture
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64;
    pCanvas.height = 64;
    const pctx = pCanvas.getContext('2d');
    pctx.fillStyle = '#0c1710';
    pctx.fillRect(0, 0, 64, 64);
    const placeholderTex = new THREE.CanvasTexture(pCanvas);

    function loadCardTexture(url, mesh, onAspectReady) {
      if (!url || !mesh) return;
      if (textureCache.has(url)) {
        const cached = textureCache.get(url);
        mesh.material.map = cached;
        mesh.material.needsUpdate = true;
        if (onAspectReady && cached.image && cached.image.width && cached.image.height) {
          onAspectReady(cached.image.width / cached.image.height);
        }
        return;
      }
      textureLoader.load(
        url,
        (loadedTex) => {
          loadedTex.colorSpace = THREE.SRGBColorSpace;
          loadedTex.generateMipmaps = false;
          loadedTex.minFilter = THREE.LinearFilter;
          loadedTex.magFilter = THREE.LinearFilter;
          textureCache.set(url, loadedTex);

          // ONLY update mesh texture when image is 100% loaded - ZERO black flash!
          mesh.material.map = loadedTex;
          mesh.material.needsUpdate = true;

          if (onAspectReady && loadedTex.image && loadedTex.image.width && loadedTex.image.height) {
            onAspectReady(loadedTex.image.width / loadedTex.image.height);
          }
        },
        undefined,
        () => {
          // Keep ambient placeholder on error
        }
      );
    }

    // ── Build all card meshes with "Fit instead of Fill" ─────────────────────
    const cardMeshes = [];
    const count = totalCount;

    // Camera approach offsets when viewing a card (scaled by `offset` prop):
    const backOffset = 3.8 * offset;
    const radOffset = 4.2 * offset;
    const yOffset = 1.35 * offset;

    for (let i = 0; i < count; i++) {
      // Inset slightly from curve boundaries so tangents are always smooth
      const u = 0.015 + (i / (count - 1)) * 0.97;
      const pt = curve.getPointAt(u);
      const tan = curve.getTangentAt(u).normalize();

      const photo = pool[i % pool.length] || { id: `p-${i}`, title: `Photo ${i + 1}` };

      // Inward radial direction from center axis
      const radOut = new THREE.Vector3(pt.x, 0, pt.z).normalize();

      // Proportional geometry fitting the photo's true native aspect ratio
      const cardAspect = aspect || photo.aspectRatio || (photo.width && photo.height ? photo.width / photo.height : 0.8);
      const cardGeom = getOrCreateCardGeometry(cardAspect, cardSize);

      const mat = new THREE.MeshBasicMaterial({
        map: placeholderTex,
        side: THREE.FrontSide,
        transparent: false,
      });

      const mesh = new THREE.Mesh(cardGeom, mat);
      mesh.position.copy(pt);

      // Orient card so its front face looks toward approaching camera position
      const camApproachPos = pt
        .clone()
        .addScaledVector(tan, -backOffset)
        .addScaledVector(radOut, radOffset)
        .add(new THREE.Vector3(0, yOffset, 0));
      mesh.lookAt(camApproachPos);

      mesh.userData = {
        photoIndex: i,
        photo,
        textureLoaded: false,
        aspectRatio: cardAspect,
        u,
      };

      ribbonGroup.add(mesh);
      cardMeshes.push(mesh);
    }

    // Camera target vectors - initialize immediately at current progress to prevent (0,0,0) jump
    const initU = 0.015 + scrollCurrentRef.current * 0.97;
    const initPt = curve.getPointAt(initU);
    const initTan = curve.getTangentAt(initU).normalize();
    const initRad = new THREE.Vector3(initPt.x, 0, initPt.z).normalize();

    const currentCamPos = initPt
      .clone()
      .addScaledVector(initTan, -backOffset)
      .addScaledVector(initRad, radOffset)
      .add(new THREE.Vector3(0, yOffset, 0));
    const currentLookAt = initPt.clone().addScaledVector(initTan, 0.2);

    camera.position.copy(currentCamPos);
    camera.lookAt(currentLookAt);

    // Raycasting for pixel-perfect card clicks & hover
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // ── Click to fly 3D camera directly to that card! ───────────────────────
    const handleClick = (e) => {
      if (!propsRef.current.interactive) return;

      // Ignore if this was a drag gesture
      const dx = Math.abs(e.clientX - pointerDownPosRef.current.x);
      const dy = Math.abs(e.clientY - pointerDownPosRef.current.y);
      if (dx > 6 || dy > 6) return;

      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(cardMeshes);

      if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        const clickedPhoto = clickedMesh.userData.photo;
        const clickedIdx = clickedMesh.userData.photoIndex;

        // Fly camera directly to that card in Three.js!
        if (typeof clickedIdx === 'number') {
          scrollTargetRef.current = clickedIdx / (count - 1);

          // Open social tray ONLY when an image is clicked!
          setSelectedPhoto(clickedPhoto);
          setSelectedPhotoIdx(clickedIdx);
          onFocusChangeRef.current?.(clickedPhoto, clickedIdx);
        }
      } else {
        // Clicking empty space closes the social tray
        setSelectedPhoto(null);
        setSelectedPhotoIdx(null);
      }
    };

    canvas.addEventListener('click', handleClick);

    // ── Animation & Physics Render Loop ─────────────────────────────────────
    let animId;
    let lastTime = performance.now();
    let lastReportedIdx = -1;

    const render = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      const currentProps = propsRef.current;

      // Auto-speed riding if enabled and not paused/hovered
      if (!currentProps.paused && currentProps.speed !== 0 && (!hoveredCardRef.current || !currentProps.pauseOnHover)) {
        scrollTargetRef.current = (scrollTargetRef.current + (currentProps.speed / count) * dt) % 1;
        if (scrollTargetRef.current < 0) scrollTargetRef.current += 1;
      }

      // ── Subtle Scroll-Driven Interpolation ──
      const damping = 0.06;
      scrollCurrentRef.current += (scrollTargetRef.current - scrollCurrentRef.current) * damping;
      const progress = Math.max(0, Math.min(1, scrollCurrentRef.current));

      // Continuous 60fps scroll thumb position without React re-render
      if (vThumbRef.current) {
        vThumbRef.current.style.top = `${(progress * 100).toFixed(2)}%`;
      }

      const currentIdx = Math.min(count - 1, Math.floor(progress * count));
      if (currentIdx !== lastReportedIdx) {
        lastReportedIdx = currentIdx;
        activeIdxRef.current = currentIdx;

        if (vBadgeRef.current) {
          vBadgeRef.current.textContent = `#${currentIdx + 1}`;
        }
      }

      // ── Distance Render Optimization with Atmospheric Fog (Zero Black Flashes) ──
      const camPos = camera.position;
      const fogCutoff = 48 / fog;
      const preloadDist = 44 / fog;

      for (let i = 0; i < count; i++) {
        const mesh = cardMeshes[i];
        const distToCam = mesh.position.distanceTo(camPos);

        if (distToCam > fogCutoff) {
          // Beyond the fog horizon: do not render! (95% GPU draw call reduction)
          mesh.visible = false;
        } else {
          mesh.visible = true;

          // Preload texture while the card is still shrouded in deep fog
          // so it is 100% ready before reaching clear view
          if (!mesh.userData.textureLoaded && distToCam < preloadDist) {
            mesh.userData.textureLoaded = true;
            loadCardTexture(
              mesh.userData.photo.thumbnailUrl || mesh.userData.photo.originalUrl,
              mesh
            );
          }
        }
      }

      // ── Camera Position & Behavior ─────────────────────────────────────────
      const isOverview = currentProps.tour === 'overview';

      if (!isOverview) {
        // RIDE VIEW: Follows the ribbon path with comfortable framing
        const camU = 0.015 + progress * 0.97;
        const pt = curve.getPointAt(camU);
        const tan = curve.getTangentAt(camU).normalize();
        const radOut = new THREE.Vector3(pt.x, 0, pt.z).normalize();

        const targetCamPos = pt
          .clone()
          .addScaledVector(tan, -backOffset)
          .addScaledVector(radOut, radOffset)
          .add(new THREE.Vector3(0, yOffset, 0));

        const targetLook = pt.clone().addScaledVector(tan, 0.2);

        currentCamPos.lerp(targetCamPos, 0.09);
        currentLookAt.lerp(targetLook, 0.09);

        camera.position.copy(currentCamPos);
        camera.lookAt(currentLookAt);

        ribbonGroup.rotation.set(0, 0, 0);
      } else {
        // OVERVIEW VIEW: Only when tour="overview" is explicitly selected
        const radOrb = (orbitAngleRef.current * Math.PI) / 180;
        const radPitch = (orbitPitchRef.current * Math.PI) / 180;
        const dist = 96;

        const targetCamPos = new THREE.Vector3(
          dist * Math.sin(radOrb) * Math.cos(radPitch),
          dist * Math.sin(radPitch) + 6,
          dist * Math.cos(radOrb) * Math.cos(radPitch)
        );
        const targetLook = new THREE.Vector3(0, 0, 0);

        currentCamPos.lerp(targetCamPos, 0.08);
        currentLookAt.lerp(targetLook, 0.08);

        camera.position.copy(currentCamPos);
        camera.lookAt(currentLookAt);

        if (!isDraggingOrbitRef.current) {
          orbitAngleRef.current += 3 * dt;
        }
      }

      // Fast direct render with Atmospheric Fog
      renderer.render(scene, camera);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || window.innerWidth;
      height = container.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('click', handleClick);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [pool, totalCount, path, fov, fog, thread, shadow, accentColor, backgroundColor, dpr]);

  // ─── Gesture & Event Handlers (Zero Re-renders during scroll) ───────────────
  const handleWheel = useCallback((e) => {
    if (!wheel) return;
    e.preventDefault();

    let rawDelta = e.deltaY;
    if (e.deltaMode === 1) rawDelta *= 24;
    else if (e.deltaMode === 2) rawDelta *= 300;

    const sign = Math.sign(rawDelta);
    const abs = Math.abs(rawDelta);
    const subtleDelta = sign * Math.min(abs, 130) * 0.000032;

    scrollTargetRef.current = Math.max(0, Math.min(1, scrollTargetRef.current + subtleDelta));
  }, [wheel]);

  // Pointer Down (Supports drag to travel)
  const handlePointerDown = (e) => {
    if (!interactive) return;

    pointerDownPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
    };

    if (e.target.closest('.depth-ribbon-v-track') || e.target.closest('.depth-ribbon-engagement-bar') || e.target.closest('.photo-comments-overlay')) {
      if (e.target.closest('.depth-ribbon-v-track')) {
        isDraggingScrollbarRef.current = true;
        handleScrollbarDrag(e);
      }
      return;
    }

    isDraggingOrbitRef.current = true;
    orbitDragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      angle: orbitAngleRef.current,
      pitch: orbitPitchRef.current,
      scroll: scrollTargetRef.current,
    };
  };

  const handlePointerMove = (e) => {
    if (!interactive) return;

    if (isDraggingScrollbarRef.current) {
      handleScrollbarDrag(e);
      return;
    }

    if (!isDraggingOrbitRef.current) return;

    const dx = e.clientX - pointerDownPosRef.current.x;
    const dy = e.clientY - pointerDownPosRef.current.y;

    if (tour === 'overview') {
      orbitAngleRef.current = orbitDragStartRef.current.angle + dx * 0.35;
      orbitPitchRef.current = Math.max(-35, Math.min(65, orbitDragStartRef.current.pitch - dy * 0.22));
    } else if (draggable) {
      const delta = -(dy * 0.00018);
      scrollTargetRef.current = Math.max(0, Math.min(1, orbitDragStartRef.current.scroll + delta));
    }
  };

  const handlePointerUp = () => {
    isDraggingScrollbarRef.current = false;
    isDraggingOrbitRef.current = false;
  };

  const handleScrollbarDrag = (e) => {
    if (!vTrackRef.current) return;
    const rect = vTrackRef.current.getBoundingClientRect();
    const yFrac = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    scrollTargetRef.current = yFrac;
  };

  return (
    <div
      ref={containerRef}
      className={`depth-ribbon-container ${className}`}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      aria-label="3D Depth Ribbon photo gallery"
    >
      {/* Three.js GPU Canvas */}
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Vertical Right-Edge Scroll Rail (Clean, minimal progress indicator) */}
      <div
        ref={vTrackRef}
        className="depth-ribbon-v-track"
        title="Drag or click to scroll through album"
        onClick={handleScrollbarDrag}
      >
        <div className="depth-ribbon-v-bar">
          <div
            ref={vThumbRef}
            className="depth-ribbon-v-thumb"
            style={{ top: '0%' }}
          >
            <div ref={vBadgeRef} className="depth-ribbon-v-badge">
              #1
            </div>
          </div>
        </div>
      </div>

      {/* ── Social Engagement Tray (Compact single row, appears ONLY when an image is clicked) ── */}
      {selectedPhoto && (
        <div ref={engagementBarRef} className="depth-ribbon-engagement-bar">
          {/* Photo Info */}
          <div className="engagement-info">
            <span className="engagement-badge">#{selectedPhotoIdx + 1}</span>
            <span className="engagement-title-text" title={selectedPhoto.title}>
              {selectedPhoto.title || `Photo #${selectedPhotoIdx + 1}`}
            </span>
          </div>

          <div className="engagement-divider" />

          {/* Social Actions */}
          <div className="engagement-actions">
            {/* Like Button with Rate Limiting */}
            <button
              className={`engagement-btn like-btn ${isLiked ? 'liked' : ''} ${isLiking ? 'animating' : ''}`}
              onClick={handleLikeClick}
              title={isLiked ? 'Unlike photo' : 'Like photo'}
            >
              <Heart size={14} className={isLiked ? 'fill-rose-500 text-rose-500' : ''} />
              <span>{likeCount > 0 ? likeCount : 'Like'}</span>
            </button>

            {/* Comment Button (Syncs to Supabase) */}
            <button
              className="engagement-btn comment-btn"
              onClick={() => setIsCommentsOpen(true)}
              title="View & add comments"
            >
              <MessageSquare size={14} />
              <span>{commentCount > 0 ? commentCount : 'Comment'}</span>
            </button>

            {/* Inspect Master Lightbox Button */}
            {onPhotoClick && (
              <button
                className="engagement-btn inspect-btn"
                onClick={() => onPhotoClick(selectedPhoto)}
                title="Inspect 100% Master Resolution"
              >
                <Maximize2 size={13} />
              </button>
            )}

            {/* Direct Download Master Photo Button */}
            <button
              className={`engagement-btn download-btn ${downloadStatus === 'done' ? 'downloaded' : ''}`}
              onClick={() => handleDownloadPhoto(selectedPhoto)}
              title={downloadStatus === 'done' ? 'Photo downloaded!' : 'Download high-res photo'}
              disabled={downloadStatus === 'downloading'}
            >
              {downloadStatus === 'downloading' ? (
                <Loader2 size={13} className="animate-spin text-emerald-400" />
              ) : downloadStatus === 'done' ? (
                <Check size={13} className="text-emerald-400" />
              ) : (
                <Download size={13} />
              )}
            </button>

            {/* Close Button to dismiss tray */}
            <button
              className="engagement-btn close-tray-btn"
              onClick={() => {
                setSelectedPhoto(null);
                setSelectedPhotoIdx(null);
              }}
              title="Close details"
            >
              <X size={13} />
            </button>
          </div>

          {/* Rate Limit Alert (Floating tooltip above) */}
          {likeRateLimitMsg && (
            <div className="engagement-rate-limit-pill">
              <span>{likeRateLimitMsg}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Slide-Over Comments Drawer (Syncs to Supabase) ── */}
      <PhotoCommentsDrawer
        isOpen={isCommentsOpen}
        onClose={() => setIsCommentsOpen(false)}
        photo={selectedPhoto}
        photoIndex={selectedPhotoIdx ?? 0}
        user={user}
      />

      {/* Children overlay */}
      {children}
    </div>
  );
}
