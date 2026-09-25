import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { localGet } from '../lib/offlineStore'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)

  useEffect(() => {
    // Supabase keeps an authenticated session on this device. We never store
    // the password locally. This only lets us explain the offline state clearly.
    supabase.auth.getSession().then(async ({ data }) => {
      if (data?.session) {
        const cachedProfile = await localGet(`profile_${data.session.user.id}`)
        setOfflineReady(Boolean(cachedProfile))
      }
    }).catch(() => {})
  }, [])

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!navigator.onLine) {
      setError(offlineReady
        ? 'You are already signed in on this phone. Close and reopen the app to continue offline.'
        : 'Internet is required for the first sign in on this phone. Sign in once while online, then you can use the app offline.')
      setLoading(false)
      return
    }

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) setError(signInError.message)
    } catch (_) {
      setError('Unable to connect. Check your internet connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="content">
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <img src="/logo.jpg" alt="Annbell Fashions and Design" style={{ width: 140, height: 140, objectFit: 'contain' }} onError={(e) => (e.target.style.display = 'none')} />
      </div>
      <h2>Staff Sign In</h2>
      {!navigator.onLine && (
        <p style={{ marginTop: 8, fontSize: 13, textAlign: 'center', color: '#b45309' }}>
          You are offline. First-time sign in requires internet; a phone that has already signed in can reopen its saved session offline.
        </p>
      )}
      <form onSubmit={handleSignIn}>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn-primary" type="submit" disabled={loading || !navigator.onLine}>
          {loading ? 'Please wait...' : 'Sign In'}
        </button>
      </form>
      <p style={{ marginTop: 12, fontSize: 13, textAlign: 'center', color: '#6b6357' }}>
        Sign in once while online. After that, the app can reopen using the saved session and cached staff profile when there is no internet.
      </p>
      <p style={{ marginTop: 8, fontSize: 12, textAlign: 'center', color: '#6b6357' }}>
        New staff accounts are created by an admin from Settings — ask your admin for a login.
      </p>
    </div>
  )
}
