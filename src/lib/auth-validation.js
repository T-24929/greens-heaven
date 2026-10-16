export function validateAuthField(field, value, mode, password = '') {
  if (field === 'email') {
    const email = value.trim()
    if (!email) return 'Enter your email address.'
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email, like name@example.com.'
  }
  if (field === 'password') {
    if (!value) return mode === 'login' ? 'Enter your password.' : 'Choose a password for your account.'
    if (mode !== 'login' && value.length < 6) return 'Use at least 6 characters.'
    if (value.length > 128) return 'Use no more than 128 characters.'
  }
  if (field === 'confirm') {
    if (!value) return 'Enter your new password again.'
    if (value !== password) return 'Your passwords don’t match yet.'
  }
  return ''
}

