import { useRef, useState } from 'react'
import { ArrowRight, Check, Eye, EyeOff, KeyRound, LockKeyhole, Mail, LoaderCircle } from 'lucide-react'
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
  const params = new URLSearchParams(window.location.search)
  const adminLogin = params.get('next') === 'admin'
  const claimAccount = recovery && params.get('claim') === '1'
  const otpType = params.get('flow') === 'recovery' ? 'recovery' : 'invite'
  const codeFlow = recovery && params.get('flow') === 'recovery'
  const [activationEmail, setActivationEmail] = useState('')
  const [activationCode, setActivationCode] = useState('')
  const [activationVerified, setActivationVerified] = useState(false)
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

  async function verifyActivationCode(event) {
    event.preventDefault()
    if (!supabase || busy.current) return
    const email = activationEmail.trim().toLowerCase()
    const emailError = validateAuthField('email', email, 'link')
    const token = activationCode.replace(/\D/g, '')
    if (emailError) { setError(emailError); return }
    if (!/^\d{6,8}$/.test(token)) { setError('Enter the 6–8 digit code from your latest email.'); return }

    busy.current = true
    setPending('verify')
    setError('')
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: otpType })
      if (verifyError) throw verifyError
      if (!data?.session) throw new Error('Verification completed without opening your account. Please request a new code.')
      setValues(current => ({ ...current, email }))
      setActivationVerified(true)
      setActivationCode('')
    } catch (verifyError) {
      if (['otp_expired', 'invite_not_found'].includes(verifyError?.code)) {
        setError('That code has expired or was already used. Ask an organizer to send a new setup email.')
      } else setError(friendlyError(verifyError))
    } finally {
      busy.current = false
      setPending('')
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!supabase || busy.current) return
    setTouched(Object.fromEntries(fields.map(field => [field, true])))
    const invalid = fields.find(field => fieldError(field))
    if (invalid) { formRef.current.elements.namedItem(invalid)?.focus(); return }
    busy.current = true
    setPending('email'); setError(''); setMessage('')
    let navigating = false
    let accountClaimed = null
    let claimFailed = false
    try {
      const email = values.email.trim()
      const password = values.password
      let result
      if (mode === 'login') result = await supabase.auth.signInWithPassword({ email, password })
      if (mode === 'signup') result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=${adminLogin ? 'admin' : 'attendee'}` } })
      if (mode === 'forgot') result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/confirm?next=recovery` })
      if (mode === 'link') result = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/confirm?next=${adminLogin ? 'admin' : 'attendee'}` } })
      if (mode === 'update') {
        result = await supabase.auth.updateUser({ password })
        if (!result.error && claimAccount) {
          try {
            const claim = await supabase.rpc('claim_in_person_reservation')
            claimFailed = Boolean(claim.error)
            accountClaimed = !claim.error && claim.data === true
          } catch { claimFailed = true }
        }
      }
      if (result.error) {
        if (mode === 'link' && result.error.code === 'otp_disabled') {
          throw new Error('Email sign-in links are currently unavailable. Please sign in with your password.')
        }
        throw result.error
      }
      if (mode === 'forgot') setMessage('If an account exists for this email, you’ll receive a password reset link. Open it to choose a new password.')
      else if (mode === 'link') setMessage('If an account exists for this email, you’ll receive a sign-in link. Open it to continue.')
      else if (mode === 'signup' && !result.data.session) setMessage('Check your inbox for a confirmation link to finish setting up your account.')
      else if (mode === 'update') setMessage(claimAccount
        ? accountClaimed
          ? 'Your password is set and your ticket is linked. You can open your attendee dashboard now.'
          : claimFailed
            ? 'Your password is set. The dashboard will retry linking your ticket when you sign in.'
            : 'Your password is set, but no unclaimed ticket was found for this email. Check the address in your setup email or contact an organizer.'
        : 'Your password has been updated. Your dashboard is ready when you are.')
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
  if (recovery && claimAccount && params.get('flow') === 'invite' && !user) return <section className="auth-content"><h1>Ask for a new setup link.</h1><Notice kind="error">This account setup link expired or was already used. Ask an organizer to resend the setup email.</Notice><a className="auth-primary" href="/login">Back to sign in<ArrowRight size={18} /></a></section>
  if (recovery && !user && !activationVerified && !codeFlow) return <section className="auth-content"><h1>Request a new reset link.</h1><Notice kind="error">This password reset link could not be verified. Return to sign in and request a new password reset link.</Notice><a className="auth-primary" href="/login">Back to sign in<ArrowRight size={18} /></a></section>

  if (codeFlow && !user && !activationVerified) return <section className="auth-content auth-code-content" aria-labelledby="auth-title">
    <div className="auth-heading"><p className="auth-eyebrow">{claimAccount ? 'TICKET ACCOUNT' : 'PASSWORD RESET'}</p><h1 id="auth-title">{claimAccount ? 'Enter your email code.' : 'Enter your reset code.'}</h1><p className="auth-description">Use the code in the latest Greens Heaven email. The code confirms your email without relying on a one-time link.</p></div>
    <Notice kind="error">{error}</Notice>
    <form className="auth-form" onSubmit={verifyActivationCode} noValidate aria-busy={Boolean(pending)}>
      <Input id="activation-email" name="email" label="Email address" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" required maxLength={254} placeholder="you@example.com" value={activationEmail} onChange={value => { setActivationEmail(value); setError('') }} disabled={Boolean(pending)} classNames={fieldStyles} leftIcon={<Mail aria-hidden="true" />} />
      <Input id="activation-code" name="token" label="Email code" type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]*" enterKeyHint="go" required maxLength={8} placeholder="Enter the code" value={activationCode} onChange={value => { setActivationCode(value.replace(/\D/g, '').slice(0, 8)); setError('') }} disabled={Boolean(pending)} classNames={fieldStyles} leftIcon={<KeyRound aria-hidden="true" />} />
      <p className="auth-code-help" id="activation-code-help">If it has expired, ask an organizer to send a new setup email. Use the newest code only.</p>
      <button className="auth-primary" type="submit" disabled={Boolean(pending)}>{pending === 'verify' ? 'Verifying code…' : 'Verify email'}{pending === 'verify' ? <LoaderCircle size={18} className="auth-spinner" aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}</button>
    </form>
    <a className="auth-secondary" href="/login">Back to sign in<ArrowRight size={18} aria-hidden="true" /></a>
    <p className="auth-privacy">Your account keeps your reservation and payment updates together. <a href="/privacy">How we use your information</a></p>
  </section>

  const [title, description, action, loadingText] = claimAccount
    ? ['Set up your ticket account.', 'Choose a password you’ll use to sign in and view your Greens Heaven ticket.', 'Save password', 'Saving your password…']
    : copy[mode]
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


