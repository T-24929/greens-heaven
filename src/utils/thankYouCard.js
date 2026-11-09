import * as THREE from 'three';

let cachedAsset = null;

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawBarcode(ctx, x, y, width, height) {
  const bars = [
    3, 1, 2, 4, 1, 3, 1, 2, 1, 4, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 2, 4, 1, 3, 2, 1,
    4, 1, 3, 2, 1, 2, 4, 1, 3, 1, 2, 4, 2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 1, 2, 3,
  ];
  let curX = x;
  const unit = width / 110;
  ctx.fillStyle = 'rgba(215, 235, 222, 0.9)';
  bars.forEach((w, idx) => {
    if (idx % 2 === 0) {
      ctx.fillRect(curX, y, w * unit, height);
    }
    curX += w * unit;
  });
}

/**
 * Generates and caches the authentic Green's Heaven Commemorative Pass
 * featuring bold, minimal, high-impact typography with zero wasted space.
 */
export function getThankYouCardAsset() {
  if (cachedAsset) return cachedAsset;
  if (typeof document === 'undefined') {
    return { texture: null, dataUrl: '', canvas: null };
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1800;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { texture: null, dataUrl: '', canvas: null };

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  cachedAsset = {
    texture,
    dataUrl: '',
    canvas,
  };

  function renderTicket(heroImg = null, logoImg = null) {
    const W = 1200;
    const H = 1800;
    const pad = 48;
    const cardW = W - pad * 2; // 1104
    const cardH = H - pad * 2; // 1704
    const cornerR = 40;
    const stubY = 1350;

    // Reset background: Deep Void Space
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#020503';
    ctx.fillRect(0, 0, W, H);

    // Save and clip to rounded ticket outline
    ctx.save();
    drawRoundedRect(ctx, pad, pad, cardW, cardH, cornerR);
    ctx.clip();

    // ── Ticket Background & Radial Ambiance ──
    const bgGrad = ctx.createLinearGradient(pad, pad, pad, pad + cardH);
    bgGrad.addColorStop(0, '#06130a');
    bgGrad.addColorStop(0.35, '#08170d');
    bgGrad.addColorStop(0.7, '#040b06');
    bgGrad.addColorStop(1, '#020603');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(pad, pad, cardW, cardH);

    // Subtle atmospheric top glow behind logo
    const topGlow = ctx.createRadialGradient(600, 340, 50, 600, 340, 480);
    topGlow.addColorStop(0, 'rgba(33, 179, 84, 0.18)');
    topGlow.addColorStop(0.6, 'rgba(16, 80, 40, 0.05)');
    topGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = topGlow;
    ctx.fillRect(pad, pad, cardW, cardH);

    // If hero grass image exists, draw subtle textured overlay in top portion
    if (heroImg && heroImg.complete && heroImg.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = 0.14;
      ctx.drawImage(heroImg, pad, pad, cardW, 640);
      ctx.restore();
    }

    // ── 1. Top Header Bar (Clean, Minimal Metadata) ──
    ctx.fillStyle = '#cbe0ce';
    ctx.font = '700 24px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('ISIPATHANA COLLEGE', pad + 44, pad + 48);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#5ef38e';
    ctx.font = '700 22px ui-monospace, monospace';
    ctx.fillText('BATCH OF 2023 / 2026', pad + cardW - 44, pad + 48);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad + 44, pad + 90);
    ctx.lineTo(pad + cardW - 44, pad + 90);
    ctx.stroke();

    // ── 2. Commemorative Pass Badge Pill ──
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pillY = pad + 135;
    ctx.fillStyle = 'rgba(20, 50, 28, 0.85)';
    drawRoundedRect(ctx, 600 - 180, pillY - 20, 360, 40, 20);
    ctx.fill();
    ctx.strokeStyle = 'rgba(94, 243, 142, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#5ef38e';
    ctx.font = '700 15px ui-monospace, monospace';
    ctx.fillText('COMMEMORATIVE ENTRY PASS', 600, pillY);

    // ── 3. Official Green's Heaven Logo ──
    const logoY = pad + 185;
    if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
      const targetLogoW = 580;
      const targetLogoH = (targetLogoW / logoImg.naturalWidth) * logoImg.naturalHeight;
      const logoX = (W - targetLogoW) / 2;
      ctx.drawImage(logoImg, logoX, logoY, targetLogoW, targetLogoH);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 82px system-ui, -apple-system, sans-serif';
      ctx.fillText("GREEN'S HEAVEN", 600, logoY + 110);
    }

    // Event Subtitle
    ctx.fillStyle = '#e4f5df';
    ctx.font = 'italic 500 30px "Cormorant Garamond", Georgia, serif';
    ctx.fillText('One evening. The whole batch.', 600, pad + 465);

    // ── 4. Venue & Preserved Counter Glass Bar ──
    const glassY = pad + 510;
    ctx.fillStyle = 'rgba(12, 28, 17, 0.72)';
    drawRoundedRect(ctx, pad + 44, glassY, cardW - 88, 86, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(94, 243, 142, 0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Left: Solis Hotel & Date
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7ea577';
    ctx.font = '700 13px ui-monospace, monospace';
    ctx.fillText('DATE & VENUE', pad + 74, glassY + 28);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 24px system-ui, -apple-system, sans-serif';
    ctx.fillText('31 OCT · SOLIS HOTEL', pad + 74, glassY + 58);

    // Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(600, glassY + 18);
    ctx.lineTo(600, glassY + 68);
    ctx.stroke();

    // Right: 513 Master Photos
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7ea577';
    ctx.font = '700 13px ui-monospace, monospace';
    ctx.fillText('HISTORIC CELEBRATION', pad + cardW - 74, glassY + 28);
    ctx.fillStyle = '#5ef38e';
    ctx.font = '700 24px system-ui, -apple-system, sans-serif';
    ctx.fillText('513 MASTER PHOTOS', pad + cardW - 74, glassY + 58);

    // ── 5. Central Grand Tribute: BOLD & PROMINENT (Not Tiny!) ──
    const tributeY = pad + 655;
    ctx.textAlign = 'center';

    // Eyebrow
    ctx.fillStyle = '#5ef38e';
    ctx.font = '700 20px ui-monospace, monospace';
    ctx.fillText('ONE LAST COLLISION BEFORE THE ABSOLUTE VOID', 600, tributeY);

    // Massive, Clean, Razor-Sharp Headlines
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 110px system-ui, -apple-system, sans-serif';
    ctx.fillText('THANK YOU', 600, tributeY + 98);

    ctx.fillStyle = '#5ef38e';
    ctx.font = '800 64px system-ui, -apple-system, sans-serif';
    ctx.fillText('FOR ATTENDING', 600, tributeY + 188);

    // Glowing Emerald Center Rule
    const ruleGrad = ctx.createLinearGradient(350, 0, 850, 0);
    ruleGrad.addColorStop(0, 'transparent');
    ruleGrad.addColorStop(0.5, '#5ef38e');
    ruleGrad.addColorStop(1, 'transparent');
    ctx.strokeStyle = ruleGrad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(350, tributeY + 242);
    ctx.lineTo(850, tributeY + 242);
    ctx.stroke();

    // Narrative Lines (Legible 32px font size with perfect leading)
    ctx.fillStyle = '#f0f7f2';
    ctx.font = '500 32px system-ui, -apple-system, sans-serif';
    ctx.fillText('Thank you for being part of an unforgettable night.', 600, tributeY + 300);
    ctx.fillText('Every memory, friendship, and smile from this celebration', 600, tributeY + 352);

    ctx.fillStyle = '#b4d7ba';
    ctx.fillText('is preserved forever in our 3D space galaxy.', 600, tributeY + 404);

    // Minimal Commemorative Batch Pill
    const batchPillY = tributeY + 472;
    ctx.fillStyle = 'rgba(22, 54, 30, 0.85)';
    drawRoundedRect(ctx, 600 - 240, batchPillY - 24, 480, 48, 24);
    ctx.fill();
    ctx.strokeStyle = 'rgba(94, 243, 142, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#5ef38e';
    ctx.font = '700 18px ui-monospace, monospace';
    ctx.fillText('★ 513 MASTER PHOTOS · PRESERVED IN 4K ★', 600, batchPillY);

    // Restore clipping before drawing notches and stubs
    ctx.restore();

    // ── 6. Perforated Dashed Stub Line & Classic Ticket Notches ──
    ctx.save();
    ctx.setLineDash([16, 12]);
    ctx.strokeStyle = 'rgba(94, 243, 142, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pad + 44, stubY);
    ctx.lineTo(pad + cardW - 44, stubY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Circular Edge Notches
    const notchRadius = 32;
    ctx.fillStyle = '#020503';
    ctx.strokeStyle = 'rgba(94, 243, 142, 0.5)';
    ctx.lineWidth = 2.5;

    // Left notch
    ctx.beginPath();
    ctx.arc(pad, stubY, notchRadius, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    ctx.stroke();

    // Right notch
    ctx.beginPath();
    ctx.arc(pad + cardW, stubY, notchRadius, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.fill();
    ctx.stroke();

    // ── 7. Ticket Stub Content (Bottom Section) ──
    const stubContentY = stubY + 40;

    // Left Column: Record Code & High-Contrast Barcode
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#84a480';
    ctx.font = '700 16px ui-monospace, monospace';
    ctx.fillText('OFFICIAL RECORD', pad + 44, stubContentY);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 46px ui-monospace, monospace';
    ctx.fillText('GH-2026-VOID', pad + 44, stubContentY + 28);

    // Vector Barcode Graphic
    drawBarcode(ctx, pad + 44, stubContentY + 92, 460, 68);

    ctx.fillStyle = 'rgba(142, 175, 137, 0.85)';
    ctx.font = '600 15px ui-monospace, monospace';
    ctx.fillText('* GH-2026-513-MEMORIES *', pad + 44, stubContentY + 172);

    // Right Column: Aurora Photography Credit
    ctx.textAlign = 'right';
    ctx.fillStyle = '#84a480';
    ctx.font = '700 16px ui-monospace, monospace';
    ctx.fillText('PHOTOGRAPHY CREDIT', pad + cardW - 44, stubContentY);

    ctx.fillStyle = '#5ef38e';
    ctx.font = '900 46px system-ui, -apple-system, sans-serif';
    ctx.fillText('AURORA.LK', pad + cardW - 44, stubContentY + 28);

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 22px system-ui, -apple-system, sans-serif';
    ctx.fillText('All 513 Master Photos in 4K', pad + cardW - 44, stubContentY + 88);

    ctx.fillStyle = '#9cb994';
    ctx.font = '500 18px system-ui, -apple-system, sans-serif';
    ctx.fillText('Captured by Dasindu Nimnal', pad + cardW - 44, stubContentY + 122);

    ctx.fillStyle = '#5ef38e';
    ctx.font = '600 17px ui-monospace, monospace';
    ctx.fillText('greensheavenxxvi.online', pad + cardW - 44, stubContentY + 158);

    // ── 8. Ticket Outer Perimeter Border ──
    ctx.strokeStyle = 'rgba(94, 243, 142, 0.38)';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, pad, pad, cardW, cardH, cornerR);
    ctx.stroke();

    // Inset subtle thin border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, pad + 8, pad + 8, cardW - 16, cardH - 16, cornerR - 8);
    ctx.stroke();

    // Re-stamp notch outlines cleanly
    ctx.strokeStyle = 'rgba(94, 243, 142, 0.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(pad, stubY, notchRadius, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pad + cardW, stubY, notchRadius, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.stroke();

    // Update Three.js Texture & DataURL
    texture.needsUpdate = true;
    try {
      cachedAsset.dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    } catch {
      // ignore
    }
  }

  // 1. Initial immediate draw with vector fallback (synchronous)
  renderTicket(null, null);

  // 2. Preload official assets and re-render with graphics
  let heroLoaded = null;
  let logoLoaded = null;

  const bg = new Image();
  bg.crossOrigin = 'anonymous';
  bg.onload = () => {
    heroLoaded = bg;
    renderTicket(heroLoaded, logoLoaded);
  };
  bg.src = '/images/hero-grass.png';

  const logo = new Image();
  logo.crossOrigin = 'anonymous';
  logo.onload = () => {
    logoLoaded = logo;
    renderTicket(heroLoaded, logoLoaded);
  };
  logo.src = '/images/greens-heaven-logo.png';

  return cachedAsset;
}

/**
 * Returns the finale photo item object to be appended to the photo manifest.
 */
export function getThankYouCardPhoto() {
  const asset = getThankYouCardAsset();
  return {
    id: 'photo_thank_you_finale',
    filename: 'thank-you-greens-heaven-ticket.jpg',
    title: 'Thank You For Attending',
    subtitle: "Green's Heaven 2026 Ticket",
    isThankYouCard: true,
    aspectRatio: 0.667,
    width: 1200,
    height: 1800,
    get originalUrl() {
      return cachedAsset?.dataUrl || asset?.dataUrl || cachedAsset?.canvas?.toDataURL('image/jpeg', 0.95) || '';
    },
    get thumbnailUrl() {
      return cachedAsset?.dataUrl || asset?.dataUrl || cachedAsset?.canvas?.toDataURL('image/jpeg', 0.95) || '';
    },
  };
}
