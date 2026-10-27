const origin = 'https://greensheavenxxvi.online'
const pages = {
  '/': ['Greens Heaven XXVI · 31 October 2026', 'One evening. The whole batch. Solis Hotel, 5:30 pm onwards. Isipathana College · 2023 O/L & 2026 A/L.'],
  '/reserve': ['Reserve your ticket · Greens Heaven XXVI', 'Join your batch at Solis Hotel on 31 October 2026, 5:30 pm onwards. One ticket · Rs. 7,000.'],
  '/dashboard': ['Your ticket · Greens Heaven XXVI', 'Sign in to view your reservation, payment status and confirmed entry QR. See you at Solis on 31 October.'],
  '/payment': ['Payment · Greens Heaven XXVI', 'Sign in to view bank details and submit your payment receipt securely.'],
  '/login': ['Sign in · Greens Heaven XXVI', 'Your Greens Heaven ticket starts here. Sign in to reserve and track your ticket.'],
}
const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

export default async function sharePreview(request, context) {
  const path = new URL(request.url).pathname.replace(/\/$/, '') || '/'
  if (!pages[path] || !['GET', 'HEAD'].includes(request.method)) return context.next()
  const response = await context.next()
  if (!response.headers.get('content-type')?.includes('text/html')) return response
  const [title, description] = pages[path].map(escape)
  const url = origin + (path === '/' ? '/' : path)
  const html = (await response.text())
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta\s+(?:name|property)="(?:description|robots|og:[^"]+|twitter:[^"]+)"[^>]*>/g, '')
    .replace(/<link rel="canonical"[^>]*>/g, '')
    .replace('</head>', `<meta name="robots" content="${path === '/' ? 'index,follow' : 'noindex,nofollow'}">
      <meta name="description" content="${description}">
      <link rel="canonical" href="${url}">
      <meta property="og:title" content="${title}">
      <meta property="og:description" content="${description}">
      <meta property="og:type" content="website">
      <meta property="og:site_name" content="Greens Heaven XXVI">
      <meta property="og:url" content="${url}">
      <meta property="og:image" content="${origin}/event-poster.png">
      <meta property="og:image:alt" content="Greens Heaven XXVI event artwork">
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="${title}">
      <meta name="twitter:description" content="${description}">
      <meta name="twitter:image" content="${origin}/event-poster.png">
      </head>`)
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.delete('content-encoding')
  headers.delete('etag')
  headers.set('cache-control', 'private, no-store')
  return new Response(request.method === 'HEAD' ? null : html, { status: response.status, headers })
}

export const config = { path: ['/', '/reserve', '/dashboard', '/payment', '/login'] }
