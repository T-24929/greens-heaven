import photoFilenames from './_gallery-manifest-list.js'

const origin = 'https://greensheavenxxvi.online'
const defaultLogo = `${origin}/images/greens-heaven-logo.png`

const pages = {
  '/': ['Greens Heaven XXVI · 31 October 2026', 'One evening. The whole batch. Solis Hotel, 5:30 pm onwards. Isipathana College · 2023 O/L & 2026 A/L.'],
  '/gallery': ['3D Space Gallery · Greens Heaven XXVI', 'Explore 513 event memories in the 3D space album. Isipathana College · Batch of 2023 / 2026.'],
  '/reserve': ['Reserve your ticket · Greens Heaven XXVI', 'Join your batch at Solis Hotel on 31 October 2026, 5:30 pm onwards. One ticket · Rs. 7,000.'],
  '/dashboard': ['Your ticket · Greens Heaven XXVI', 'Sign in to view your reservation, payment status and confirmed entry QR. See you at Solis on 31 October.'],
  '/payment': ['Payment · Greens Heaven XXVI', 'Sign in to view bank details and submit your payment receipt securely.'],
  '/login': ['Sign in · Greens Heaven XXVI', 'Your Greens Heaven ticket starts here. Sign in to reserve and track your ticket.'],
}

const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

export default async function sharePreview(request, context) {
  const reqUrl = new URL(request.url)
  const path = reqUrl.pathname.replace(/\/$/, '') || '/'

  if (!pages[path] || !['GET', 'HEAD'].includes(request.method)) return context.next()
  const response = await context.next()
  if (!response.headers.get('content-type')?.includes('text/html')) return response

  let [title, description] = pages[path]
  let previewImage = defaultLogo
  let canonicalUrl = origin + (path === '/' ? '/' : path)

  // Per-photo OpenGraph preview for /gallery?p=...
  if (path === '/gallery') {
    const pParam = reqUrl.searchParams.get('p') || reqUrl.searchParams.get('photo')
    if (pParam) {
      const pNum = parseInt(pParam, 10)
      if (!isNaN(pNum) && pNum >= 1 && pNum <= photoFilenames.length) {
        title = `Photo #${pNum} · Greens Heaven XXVI`
        description = 'Isipathana College · Batch of 2023 / 2026'
        const filename = photoFilenames[pNum - 1]
        if (filename) {
          previewImage = `${origin}/gallery/originals/${filename}`
        }
        canonicalUrl = `${origin}/gallery?p=${pNum}#${pNum}`
      }
    }
  }

  const escapedTitle = escape(title)
  const escapedDesc = escape(description)
  const escapedUrl = escape(canonicalUrl)
  const escapedImage = escape(previewImage)

  const html = (await response.text())
    .replace(/<title>[^<]*<\/title>/, `<title>${escapedTitle}</title>`)
    .replace(/<meta\s+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>/g, '')
    .replace(/<link rel="canonical"[^>]*>/g, '')
    .replace('</head>', `<meta name="robots" content="${path === '/' ? 'index,follow' : 'noindex,nofollow'}">
      <meta name="description" content="${escapedDesc}">
      <link rel="canonical" href="${escapedUrl}">
      <meta property="og:title" content="${escapedTitle}">
      <meta property="og:description" content="${escapedDesc}">
      <meta property="og:type" content="website">
      <meta property="og:site_name" content="Greens Heaven XXVI">
      <meta property="og:url" content="${escapedUrl}">
      <meta property="og:image" content="${escapedImage}">
      <meta property="og:image:alt" content="${escapedTitle}">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="${escapedTitle}">
      <meta name="twitter:description" content="${escapedDesc}">
      <meta name="twitter:image" content="${escapedImage}">
      </head>`)

  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.delete('content-encoding')
  headers.delete('etag')
  headers.set('cache-control', 'private, no-store')
  return new Response(request.method === 'HEAD' ? null : html, { status: response.status, headers })
}

export const config = { path: ['/', '/gallery', '/gallery/*', '/reserve', '/dashboard', '/payment', '/login'] }
