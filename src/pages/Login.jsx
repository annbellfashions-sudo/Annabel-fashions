import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="content">
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <img src="/logo.jpg" alt="Annbell Fashions and Design" style={{ width: 140, height: 140, objectFit: 'contain' }} onError={(e) => (e.target.style.display = 'none')} />
      </div>
      <h2>Staff Sign In</h2>
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
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? 'Please wait...' : 'Sign In'}
        </button>
      </form>
      <p style={{ marginTop: 12, fontSize: 13, textAlign: 'center', color: '#6b6357' }}>
        New staff accounts are created by an admin from Settings — ask your admin for a login.
      </p>
    </div>
  )
}
