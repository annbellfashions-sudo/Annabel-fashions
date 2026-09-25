import React, { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import Login from './pages/Login'
import Products from './pages/Products'
import Sales from './pages/Sales'
import Customers from './pages/Customers'
import Services from './pages/Services'
import Vendors from './pages/Vendors'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Orders from './pages/Orders'
import Expenses from './pages/Expenses'

const ADMIN_TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊' },
  { key: 'sales', label: 'Sales', icon: '🛒' },
  { key: 'products', label: 'Products', icon: '🧵' },
  { key: 'orders', label: 'Orders', icon: '📦' },
  { key: 'expenses', label: 'Expenses', icon: '💰' },
  { key: 'customers', label: 'Customers', icon: '👥' },
  { key: 'services', label: 'Services', icon: '✂️' },
  { key: 'vendors', label: 'Vendors', icon: '🚚' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
]
const CASHIER_TABS = [
  { key: 'sales', label: 'Sales', icon: '🛒' },
  { key: 'dashboard', label: 'My Sales', icon: '📊' },
  { key: 'products', label: 'Add Product', icon: '🧵' },
]

function OfflineStatus() {
  const [online, setOnline] = React.useState(navigator.onLine)

  React.useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (online) return null
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999, padding: '8px 12px', textAlign: 'center', background: '#b91c1c', color: '#fff', fontSize: 13 }}>
      Offline mode: the app shell is available on this phone. Data synchronization will resume when internet returns.
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [pharmacy, setPharmacy] = useState({ name: 'Annbell Fashions and Design', logo_url: null })
  const [tab, setTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)

  async function loadProfileAndSettings(userId) {
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(prof || null)
    setTab(prof?.role === 'admin' ? 'dashboard' : 'sales')

    const { data: settings } = await supabase.from('shop_settings').select('name, logo_url').eq('id', 1).single()
    if (settings) setPharmacy(settings)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadProfileAndSettings(data.session.user.id)
      else setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) loadProfileAndSettings(newSession.user.id)
      else setProfile(null)
      setLoading(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="app-shell content">Loading...</div>

  const isAdmin = profile?.role === 'admin'
  const tabs = isAdmin ? ADMIN_TABS : CASHIER_TABS
  const logoSrc = pharmacy.logo_url || '/logo.jpg'

  return (
    <>
      <OfflineStatus />
      <div className="app-shell">
      <div className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={logoSrc} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 4 }} onError={(e) => (e.target.style.display = 'none')} />
          <h1>{pharmacy.name}</h1>
        </div>
        {session && <button onClick={() => supabase.auth.signOut()}>Sign out</button>}
      </div>

      {!session ? (
        <Login />
      ) : (
        <>
          {tab === 'dashboard' && (
            <Dashboard scope={isAdmin ? 'all' : 'own'} userId={session.user.id} isAdmin={isAdmin} />
          )}
          {tab === 'sales' && <Sales userId={session.user.id} />}
          {tab === 'products' && <Products isAdmin={isAdmin} />}
          {tab === 'orders' && isAdmin && <Orders />}
          {tab === 'expenses' && isAdmin && <Expenses />}
          {tab === 'customers' && isAdmin && <Customers />}
          {tab === 'services' && isAdmin && <Services />}
          {tab === 'vendors' && isAdmin && <Vendors />}
          {tab === 'settings' && isAdmin && <Settings />}

          <div className="bottom-nav">
            {tabs.map((t) => (
              <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
                <span className="icon">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
      </div>
    </>
  )
}
