import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
  let legacyRole
  try { legacyRole = JSON.parse(Buffer.from(key.split('.')[1] || '', 'base64url').toString()).role } catch { /* Not a legacy JWT. */ }
  if (key.startsWith('sb_secret_') || legacyRole === 'service_role') {
    throw new Error('A privileged Supabase key was placed in a public VITE_ variable. Use a publishable key before starting or building the app.')
  }
  if (command === 'build') {
    const allowed = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'])
    if (Object.keys(env).some(name => name.startsWith('VITE_') && !allowed.has(name))) {
      throw new Error('Unexpected VITE_ environment variable. Only the public Supabase URL and publishable key are allowed; keep server secrets in Supabase.')
    }
    let validUrl = false
    try {
      const url = new URL(env.VITE_SUPABASE_URL)
      validUrl = url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && !/YOUR_PROJECT_REF/i.test(url.hostname)
    } catch { /* Missing or malformed public URL. */ }
    if (!validUrl || !(key.startsWith('sb_publishable_') && key.length > 20 || legacyRole === 'anon')) {
      throw new Error('Set VITE_SUPABASE_URL (HTTPS project origin) and VITE_SUPABASE_PUBLISHABLE_KEY (public publishable/anon key) in the build environment before deploying.')
    }
  }
  return {
    plugins: [
      tailwindcss(),
      react(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
