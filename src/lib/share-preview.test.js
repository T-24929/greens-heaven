import test from 'node:test'
import assert from 'node:assert/strict'
import sharePreview from '../../netlify/edge-functions/share-preview.js'

test('share previews are route-specific and never reflect private query values', async () => {
  const source = '<html><head><title>Old</title><meta property="og:title" content="Old"><meta name="robots" content="noindex,nofollow"></head></html>'
  const context = { next: async () => new Response(source, { headers: { 'content-type': 'text/html', 'etag': 'old' } }) }
  const result = await sharePreview(new Request('https://preview.example/dashboard?name=PRIVATE&ticket=SECRET'), context)
  const html = await result.text()
  assert.match(html, /Your ticket · Greens Heaven XXVI/)
  assert.match(html, /https:\/\/greensheavenxxvi.online\/dashboard/)
  assert.doesNotMatch(html, /PRIVATE|SECRET|preview.example/)
  assert.equal((html.match(/property="og:title"/g) || []).length, 1)
  assert.equal(result.headers.get('etag'), null)
  assert.match(html, /noindex,nofollow/)
  const home = await sharePreview(new Request('https://preview.example/'), context)
  assert.match(await home.text(), /index,follow/)
})
