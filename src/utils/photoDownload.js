/**
 * Robust photo downloader utility for Greens Heaven 3D Gallery.
 * Guarantees that downloaded files are always valid image/jpeg files,
 * never downloading SPA index.html rewrites as .jpghtml.
 */

export async function convertBlobToJpeg(blob) {
  if (typeof window === 'undefined') return blob;
  if (blob.type === 'image/jpeg') return blob;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (jpegBlob) => resolve(jpegBlob || blob),
        'image/jpeg',
        0.95
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}

export async function downloadPhotoFile(photo) {
  if (!photo || typeof window === 'undefined') return false;

  const preferredUrl = photo.originalUrl || photo.thumbnailUrl || photo.src;
  const fallbackUrl = photo.thumbnailUrl || photo.originalUrl || photo.src;
  const cleanTitle = (photo.title || 'photo').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'photo';
  let filename = photo.filename?.replace(/\.html?$/i, '') || `${cleanTitle}.jpg`;
  if (!filename.toLowerCase().endsWith('.jpg') && !filename.toLowerCase().endsWith('.jpeg')) {
    filename = `${filename.replace(/\.[a-zA-Z0-9]+$/, '')}.jpg`;
  }

  // 1. Data URLs (e.g. Generated canvas Thank You commemorative pass)
  if (preferredUrl && preferredUrl.startsWith('data:')) {
    const link = document.createElement('a');
    link.href = preferredUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }

  try {
    let res = null;

    if (preferredUrl) {
      try {
        const testRes = await fetch(preferredUrl);
        const ct = testRes.headers.get('content-type') || '';
        // If server returned 404/SPA index.html instead of a real image, do not use it!
        if (testRes.ok && !ct.includes('text/html')) {
          res = testRes;
        }
      } catch {
        // network or CORS error, fall back
      }
    }

    if (!res && fallbackUrl && fallbackUrl !== preferredUrl) {
      const fallbackRes = await fetch(fallbackUrl);
      const ct = fallbackRes.headers.get('content-type') || '';
      if (fallbackRes.ok && !ct.includes('text/html')) {
        res = fallbackRes;
      }
    }

    if (!res) throw new Error('No valid image response');

    let blob = await res.blob();

    // Ensure it's a true image/jpeg MIME type
    if (blob.type === 'image/webp' || (!blob.type.includes('jpeg') && blob.type.startsWith('image/'))) {
      blob = await convertBlobToJpeg(blob);
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    return true;
  } catch (err) {
    console.warn('Direct blob download failed, falling back:', err);
    const fallbackTarget = fallbackUrl || preferredUrl;
    if (fallbackTarget) {
      const link = document.createElement('a');
      link.href = fallbackTarget;
      link.download = filename;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    }
    return false;
  }
}
