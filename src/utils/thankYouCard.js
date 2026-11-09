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
  ctx.fillStyle = 'rgba(215, 230, 220, 0.85)';
  bars.forEach((w, idx) => {
    if (idx % 2 === 0) {
      ctx.fillRect(curX, y, w * unit, height);
    }
    curX += w * unit;
  });
}

/**
 * Generates and caches the authentic Green's Heaven VIP Ticket Pass
 * featuring the official logo, hero grass artwork, ticket stub perforations, and thank you tribute.
 */
export function getThankYouCardAsset() {
  if (cachedAsset) return cachedAsset;
  if (typeof document === 'undefined') {
    return { texture: null, dataUrl: '' };
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1800;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { texture: null, dataUrl: '' };

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
    const cardW = W - pad * 2;
    const cardH = H - pad * 2;
    const cornerR = 36;
    const stubY = 1320;

    // Reset background: Deep Void Space
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#020503';
    ctx.fillRect(0, 0, W, H);

    // Save and clip to rounded ticket outline
    ctx.save();
    drawRoundedRect(ctx, pad, pad, cardW, cardH, cornerR);
    ctx.clip();

    // ── Ticket Background & Art ──
    ctx.fillStyle = '#0a140d';
    ctx.fillRect(pad, pad, cardW, cardH);

    const artH = 680;
    if (heroImg && heroImg.complete && heroImg.naturalWidth > 0) {
      // Real hero grass photo from public/images/hero-grass.png
      ctx.drawImage(heroImg, pad, pad, cardW, artH);
    } else {
      // Fallback lush grass emerald gradient
      const grassGrad = ctx.createLinearGradient(pad, pad, pad, pad + artH);
      grassGrad.addColorStop(0, '#0c2214');
      grassGrad.addColorStop(0.5, '#13391f');
      grassGrad.addColorStop(1, '#09180e');
      ctx.fillStyle = grassGrad;
      ctx.fillRect(pad, pad, cardW, artH);
    }

    // Atmospheric shadow scrim over hero grass (matches Dashboard .dash-ticket-art::after)
    const scrim = ctx.createLinearGradient(0, pad, 0, pad + artH);
    scrim.addColorStop(0, 'rgba(4, 16, 8, 0.75)');
    scrim.addColorStop(0.35, 'rgba(4, 16, 8, 0.28)');
    scrim.addColorStop(0.8, 'rgba(11, 22, 13, 0.92)');
    scrim.addColorStop(1, '#0b160e');
    ctx.fillStyle = scrim;
    ctx.fillRect(pad, pad, cardW, artH);

    // ── Top Header Line ──
    ctx.fillStyle = '#d5e6cc';
    ctx.font = '600 20px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ISIPATHANA COLLEGE', pad + 40, pad + 38);

    ctx.textAlign = 'right';
    ctx.font = '700 22px "Cormorant Garamond", Georgia, serif';
    ctx.fillText('XXVI', pad + cardW - 40, pad + 36);

    // ── Digital Pass Pill Badge ──
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pillY = pad + 105;
    ctx.fillStyle = 'rgba(26, 48, 27, 0.85)';
    drawRoundedRect(ctx, 600 - 160, pillY - 18, 320, 36, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(94, 243, 142, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#5ef38e';
    ctx.font = '700 14px ui-monospace, monospace';
    ctx.fillText('COMMEMORATIVE ENTRY PASS', 600, pillY);

    // ── Official Green's Heaven Logo ──
    const logoY = pad + 155;
    if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
      // Official logo from public/images/greens-heaven-logo.png (aspect ratio ~2.37)
      const targetLogoW = 520;
      const targetLogoH = (targetLogoW / logoImg.naturalWidth) * logoImg.naturalHeight;
      const logoX = (W - targetLogoW) / 2;
      ctx.drawImage(logoImg, logoX, logoY, targetLogoW, targetLogoH);
    } else {
      // Vector typography fallback
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 68px system-ui, -apple-system, sans-serif';
      ctx.fillText("GREEN'S HEAVEN", 600, logoY + 80);
    }

    // ── Tagline (Cormorant Garamond italic) ──
    ctx.fillStyle = '#e3efdd';
    ctx.font = 'italic 500 28px "Cormorant Garamond", Georgia, serif';
    ctx.fillText('One evening. The whole batch.', 600, pad + 410);

    // ── Date & Venue Grid ──
    const dateRowY = pad + 475;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad + 40, dateRowY);
    ctx.lineTo(pad + cardW - 40, dateRowY);
    ctx.stroke();

    // Date Left
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 52px "Cormorant Garamond", Georgia, serif';
    ctx.fillText('31', pad + 40, dateRowY + 50);

    ctx.fillStyle = '#a0b795';
    ctx.font = '600 17px system-ui, -apple-system, sans-serif';
    ctx.fillText('OCT / 2026', pad + 115, dateRowY + 50);

    // Venue Right
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 22px system-ui, -apple-system, sans-serif';
    ctx.fillText('SOLIS HOTEL', pad + cardW - 40, dateRowY + 40);
    ctx.fillStyle = '#a0b795';
    ctx.font = '500 16px system-ui, -apple-system, sans-serif';
    ctx.fillText('5:30 PM ONWARDS', pad + cardW - 40, dateRowY + 68);

    // ── Central Body: Thank You For Attending Tribute ──
    const bodyY = pad + artH + 40;
    ctx.textAlign = 'center';

    // Eyebrow
    ctx.fillStyle = '#5ef38e';
    ctx.font = '700 18px ui-monospace, monospace';
    ctx.fillText('BATCH OF 2023 (O/L) & 2026 (A/L)', 600, bodyY);

    // Main Celebratory Headline
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 56px system-ui, -apple-system, sans-serif';
    ctx.fillText('THANK YOU', 600, bodyY + 70);
    ctx.fillStyle = '#5ef38e';
    ctx.font = '700 40px system-ui, -apple-system, sans-serif';
    ctx.fillText('FOR ATTENDING', 600, bodyY + 130);

    // Gold/Emerald Divider Accent
    ctx.strokeStyle = 'rgba(94, 243, 142, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(420, bodyY + 185);
    ctx.lineTo(780, bodyY + 185);
    ctx.stroke();

    // Warm Celebratory Narrative
    ctx.fillStyle = 'rgba(230, 240, 234, 0.88)';
    ctx.font = '400 26px system-ui, -apple-system, sans-serif';
    ctx.fillText('Thank you for being part of an unforgettable night.', 600, bodyY + 245);
    ctx.fillText('Every memory, friendship, and smile from this historic celebration', 600, bodyY + 295);
    ctx.fillText('is preserved forever in this 3D space galaxy.', 600, bodyY + 345);

    // Admit Badge
    ctx.fillStyle = 'rgba(31, 57, 38, 0.65)';
    drawRoundedRect(ctx, 600 - 170, bodyY + 400, 340, 44, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(94, 243, 142, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#c5e8ce';
    ctx.font = '600 17px system-ui, -apple-system, sans-serif';
    ctx.fillText('ONE EVENING · THE WHOLE BATCH', 600, bodyY + 422);

    // Restore clipping before drawing notches and stubs
    ctx.restore();

    // ── Perforated Dashed Stub Line & Classic Circular Notches ──
    ctx.save();
    ctx.setLineDash([14, 12]);
    ctx.strokeStyle = 'rgba(84, 124, 72, 0.75)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pad + 44, stubY);
    ctx.lineTo(pad + cardW - 44, stubY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Circular Cutouts on left & right edges (Ticket Stub Notches)
    const notchRadius = 30;
    ctx.fillStyle = '#020503';
    ctx.strokeStyle = '#43553a';
    ctx.lineWidth = 3;

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

    // ── Ticket Stub Content (Bottom Section) ──
    const stubContentY = stubY + 45;

    // Left Column: Reference Code & Barcode
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#a0b795';
    ctx.font = '700 15px ui-monospace, monospace';
    ctx.fillText('COMMEMORATIVE RECORD', pad + 40, stubContentY);

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 38px ui-monospace, monospace';
    ctx.fillText('GH-2026-VOID', pad + 40, stubContentY + 28);

    // Vector Barcode Graphic
    drawBarcode(ctx, pad + 40, stubContentY + 88, 440, 58);

    ctx.fillStyle = 'rgba(160, 183, 149, 0.7)';
    ctx.font = '500 13px ui-monospace, monospace';
    ctx.fillText('* GH-2026-513-MEMORIES *', pad + 40, stubContentY + 154);

    // Right Column: Aurora Photography Credit
    ctx.textAlign = 'right';
    ctx.fillStyle = '#a0b795';
    ctx.font = '700 15px ui-monospace, monospace';
    ctx.fillText('PHOTOGRAPHY CREDIT', pad + cardW - 40, stubContentY);

    ctx.fillStyle = '#5ef38e';
    ctx.font = '700 32px system-ui, -apple-system, sans-serif';
    ctx.fillText('AURORA.LK', pad + cardW - 40, stubContentY + 28);

    ctx.fillStyle = 'rgba(235, 245, 238, 0.7)';
    ctx.font = '400 18px system-ui, -apple-system, sans-serif';
    ctx.fillText('513 Master Photos Preserved', pad + cardW - 40, stubContentY + 76);

    ctx.fillStyle = '#a0b795';
    ctx.font = '500 15px system-ui, -apple-system, sans-serif';
    ctx.fillText('3D Interactive Space Galaxy', pad + cardW - 40, stubContentY + 104);

    // ── Ticket Perimeter Border ──
    ctx.strokeStyle = '#3a4934';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, pad, pad, cardW, cardH, cornerR);
    ctx.stroke();

    // Re-stamp notch outlines cleanly over perimeter border
    ctx.strokeStyle = '#43553a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(pad, stubY, notchRadius, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pad + cardW, stubY, notchRadius, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.stroke();

    // Update Three.js Texture & DataURL
    texture.needsUpdate = true;
    try {
      cachedAsset.dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    } catch {
      // ignore
    }
  }

  // 1. Initial draw with vector fallback (instant)
  renderTicket(null, null);

  // 2. Asynchronously load the official assets from public/images
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
    originalUrl: asset.dataUrl || '',
    thumbnailUrl: asset.dataUrl || '',
  };
}
