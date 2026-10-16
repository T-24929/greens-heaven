import { useRef, useState } from 'react'
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, LoaderCircle } from 'lucide-react'
import { Input } from '../components/motion/input.jsx'
import { Notice, SetupNotice } from '../components/Feedback.jsx'
import { supabase } from '../utils/supabase.js'
import { friendlyError } from '../lib/tickets.js'
import { validateAuthField } from '../lib/auth-validation.js'

const fieldStyles = { root: 'auth-field', label: 'auth-label', field: 'auth-input-frame', input: 'auth-input', errorMessage: 'auth-field-error' }
const copy = {
  login: ['Welcome back.', 'Sign in to reserve your place and keep your ticket close.', 'Sign in', 'Signing in…'],
  signup: ['Join the evening.', 'Create your account. Your reservation comes next.', 'Create account', 'Creating your account…'],
  forgot: ['Let’s get you back.', 'Enter your email and we’ll send a password reset link.', 'Send reset link', 'Sending your link…'],
  link: ['Your inbox is the way in.', 'We’ll email a sign-in link to your existing account.', 'Email me a sign-in link', 'Sending your link…'],
  update: ['A fresh start.', 'Choose a new password to get back to your ticket.', 'Save new password', 'Saving your password…'],
}

function GoogleIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.23c1.89-1.74 2.99-4.31 2.99-7.36Z" /><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.41l-3.23-2.51c-.9.6-2.04.96-3.38.96-2.61 0-4.82-1.76-5.61-4.12H3.05v2.59A10 10 0 0 0 12 22Z" /><path fill="#FBBC05" d="M6.39 13.92A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.49H3.05A10 10 0 0 0 2 12c0 1.61.38 3.14 1.05 4.51l3.34-2.59Z" /><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.49l3.34 2.59C7.18 7.72 9.39 5.96 12 5.96Z" /></svg>
}

export default function AuthPage({ user, recovery = false }) {
  const [mode, setMode] = useState(recovery ? 'update' : 'login')
  const [values, setValues] = useState({ email: '', password: '', confirm: '' })
  const [touched, setTouched] = useState({})
  const [visible, setVisible] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [pending, setPending] = useState('')
  const busy = useRef(false)
  const formRef = useRef(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const adminLogin = new URLSearchParams(window.location.search).get('next') === 'admin'
  const isAdminUser = Boolean(user?.app_metadata?.role === 'admin' || user?.app_metadata?.is_admin)
  const destination = (adminLogin || isAdminUser) ? '/admin/dashboard' : '/dashboard'
  const newPassword = mode === 'signup' || mode === 'update'
  const emailOnly = mode === 'forgot' || mode === 'link'
  const fields = emailOnly ? ['email'] : mode === 'update' ? ['password', 'confirm'] : mode === 'signup' ? ['email', 'password', 'confirm'] : ['email', 'password']
  const fieldError = field => validateAuthField(field, values[field], mode, values.password)

  function switchMode(next) {
    setMode(next); setError(''); setMessage(''); setValues(v => ({ ...v, password: '', confirm: '' })); setTouched({}); setVisible(false); setCapsLock(false)
  }
  function change(field, value) { setValues(v => ({ ...v, [field]: value })); setError('') }
  function blur(field) { setTouched(v => ({ ...v, [field]: true })); if (field === 'password') setCapsLock(false) }

  async function submit(e) {
    e.preventDefault()
    if (!supabase || busy.current) return
    setTouched(Object.fromEntries(fields.map(field => [field, true])))
    const invalid = fields.find(field => fieldError(field))
    if (invalid) { formRef.current.elements.namedItem(invalid)?.focus(); return }
    busy.current = true
    setPending('email'); setError(''); setMessage('')
    let navigating = false
    try {
      const email = values.email.trim()
      const password = values.password
      let result
      if (mode === 'login') result = await supabase.auth.signInWithPassword({ email, password })
      if (mode === 'signup') result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback${adminLogin ? '?next=admin' : ''}` } })
      if (mode === 'forgot') result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
      if (mode === 'link') result = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/callback${adminLogin ? '?next=admin' : ''}` } })
      if (mode === 'update') result = await supabase.auth.updateUser({ password })
      if (result.error) {
        if (mode === 'link' && result.error.code === 'otp_disabled') {
          throw new Error('Email sign-in links are currently unavailable. Please sign in with your password.')
        }
        throw result.error
      }
      if (mode === 'forgot') setMessage('If an account exists for this email, you’ll receive a reset link. Open it in this browser to choose a new password.')
      else if (mode === 'link') setMessage('If an account exists for this email, you’ll receive a sign-in link. Open it in this browser to continue.')
      else if (mode === 'signup' && !result.data.session) setMessage('Check your inbox for a confirmation link. Open it in this browser to finish setting up your account.')
      else if (mode === 'update') setMessage('Your password has been updated. Your dashboard is ready when you are.')
      else {
        navigating = true
        window.location.assign(destination)
      }
      if (mode !== 'login') { setValues(v => ({ ...v, password: '', confirm: '' })); setTouched({}); setVisible(false) }
    } catch (err) { setError(friendlyError(err)) }
    finally {
      if (!navigating) { busy.current = false; setPending('') }
    }
  }

  async function google() {
    if (!supabase || busy.current) return
    busy.current = true
    setPending('google'); setError('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback${adminLogin ? '?next=admin' : ''}` } })
      if (error) throw error
    } catch (err) { setError(friendlyError(err)); setPending(''); busy.current = false }
  }

  if (!supabase) return <section className="auth-content"><h1>See you soon.</h1><SetupNotice /></section>
  if (user && !recovery) return <section className="auth-content"><p className="auth-eyebrow">YOUR EVENING STARTS HERE</p><h1>You’re signed in.</h1><p className="auth-description auth-email">{user.email}</p><a className="auth-primary" href={destination}>{adminLogin ? 'Open admin dashboard' : 'Open my dashboard'}<ArrowRight size={18} /></a></section>
  if (recovery && !user) return <section className="auth-content"><h1>A new link, please.</h1><Notice kind="error">This reset link has expired or is invalid. Request a new link and open it in the same browser.</Notice><a className="auth-primary" href="/login">Back to sign in<ArrowRight size={18} /></a></section>

  const [title, description, action, loadingText] = copy[mode]
  return <section className="auth-content" aria-labelledby="auth-title">
    <div className="auth-heading"><p className="auth-eyebrow">{adminLogin ? 'ORGANIZER ACCESS' : 'YOUR EVENING STARTS HERE'}</p><h1 id="auth-title">{title}</h1><p className="auth-description">{description}</p></div>
    <Notice kind="error">{error}</Notice>
    {message ? <div className="auth-confirmation" role="status"><span className="auth-confirmation-icon"><Check size={24} aria-hidden="true" /></span><h2>{mode === 'update' ? 'All set.' : 'Check your inbox.'}</h2><p>{message}</p>{mode !== 'update' && <p className="auth-email">{values.email.trim()}</p>}{mode === 'update' ? <a className="auth-primary" href={destination}>Open my dashboard<ArrowRight size={18} /></a> : <button className="auth-secondary" onClick={() => switchMode('login')}>Back to sign in</button>}</div> : <>
      {(mode === 'login' || mode === 'signup') && <><button type="button" className="auth-google" disabled={Boolean(pending)} onClick={google}>{pending === 'google' ? <LoaderCircle size={20} className="auth-spinner" /> : <GoogleIcon />}{pending === 'google' ? 'Opening Google…' : 'Continue with Google'}</button><div className="auth-divider"><span>or with email</span></div></>}
      <form ref={formRef} onSubmit={submit} noValidate className="auth-form" aria-busy={Boolean(pending)}>
        {mode !== 'update' && <Input id="auth-email" name="email" label="Email address" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint={emailOnly ? 'send' : 'next'} required maxLength={254} placeholder="you@example.com" value={values.email} onChange={value => change('email', value)} onBlur={() => blur('email')} disabled={Boolean(pending)} error={touched.email ? fieldError('email') : ''} reserveErrorLine classNames={fieldStyles} leftIcon={<Mail aria-hidden="true" />} />}
        {!emailOnly && <div>
          <Input id="auth-password" name="password" label={newPassword ? 'New password' : 'Password'} type={visible ? 'text' : 'password'} autoComplete={newPassword ? 'new-password' : 'current-password'} enterKeyHint={newPassword ? 'next' : 'go'} required maxLength={128} placeholder={newPassword ? 'At least 6 characters' : 'Your password'} value={values.password} onChange={value => change('password', value)} onBlur={() => blur('password')} onKeyDown={event => setCapsLock(event.getModifierState('CapsLock'))} onKeyUp={event => setCapsLock(event.getModifierState('CapsLock'))} disabled={Boolean(pending)} error={touched.password ? fieldError('password') : ''} aria-describedby={[newPassword && 'auth-password-hint', touched.password && fieldError('password') && 'auth-password-error', capsLock && 'auth-caps-lock'].filter(Boolean).join(' ') || undefined} reserveErrorLine classNames={fieldStyles} leftIcon={<LockKeyhole aria-hidden="true" />} rightIcon={<button type="button" className="auth-password-toggle" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} disabled={Boolean(pending)} onClick={() => setVisible(v => !v)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>} />
          {capsLock && <p id="auth-caps-lock" className="auth-hint" role="status">Caps Lock is on.</p>}
          {newPassword && <p id="auth-password-hint" className="auth-hint">Use 6–128 characters and a password unique to this website.</p>}
          {mode === 'login' && <div className="auth-forgot"><button type="button" onClick={() => switchMode('forgot')} disabled={Boolean(pending)}>Forgot password?</button></div>}
        </div>}
        {newPassword && <Input id="auth-confirm" name="confirm" label="Confirm new password" type={visible ? 'text' : 'password'} autoComplete="new-password" enterKeyHint="go" required maxLength={128} placeholder="Enter it once more" value={values.confirm} onChange={value => change('confirm', value)} onBlur={() => blur('confirm')} disabled={Boolean(pending)} error={touched.confirm ? fieldError('confirm') : ''} reserveErrorLine classNames={fieldStyles} leftIcon={<LockKeyhole aria-hidden="true" />} />}
        <button className="auth-primary" type="submit" disabled={Boolean(pending)}>{pending === 'email' ? loadingText : action}{pending === 'email' ? <LoaderCircle size={18} className="auth-spinner" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}</button>
      </form>
      {mode === 'login' && <button className="auth-secondary" type="button" disabled={Boolean(pending)} onClick={() => switchMode('link')}><Mail size={18} aria-hidden="true" />Email me a sign-in link instead</button>}
      <div className="auth-switch">{mode === 'login' ? <><span>New to Greens Heaven?</span><button type="button" disabled={Boolean(pending)} onClick={() => switchMode('signup')}>Create an account</button></> : mode !== 'update' ? <><span>{mode === 'signup' ? 'Already part of the batch?' : 'Remember your password?'}</span><button type="button" disabled={Boolean(pending)} onClick={() => switchMode('login')}>Sign in</button></> : <a href={destination}>Back to my dashboard</a>}</div>
    </>}
    <p className="auth-privacy">Your account keeps your reservation and payment updates together. <a href="/privacy">How we use your information</a></p>
  </section>
}


