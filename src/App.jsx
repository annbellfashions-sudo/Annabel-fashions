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
import { localGet, localSet } from './lib/offlineStore'

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
      Offline mode: using data saved on this phone. Changes will synchronize when internet returns.
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
    // Always try the phone cache first. This makes startup reliable even if the
    // browser reports online but the network request is unavailable.
    const cachedProfile = await localGet(`profile_${userId}`)
    const cachedSettings = await localGet('shop_settings')

    if (cachedProfile) {
      setProfile(cachedProfile)
      setTab(cachedProfile.role === 'admin' ? 'dashboard' : 'sales')
    }
    if (cachedSettings) {
      setPharmacy({
        name: cachedSettings.name || 'Annbell Fashions and Design',
        logo_url: cachedSettings.logo_url || null,
      })
    }

    // If offline, the cached profile/settings are enough to open the app.
    if (!navigator.onLine) {
      return { profile: cachedProfile, settings: cachedSettings }
    }

    // Refresh the cache from Supabase when internet is available.
    try {
      const { data: prof, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      const finalProfile = profileError ? cachedProfile : prof
      if (finalProfile) {
        setProfile(finalProfile)
        setTab(finalProfile.role === 'admin' ? 'dashboard' : 'sales')
        await localSet(`profile_${userId}`, finalProfile)
      }

      const { data: settings, error: settingsError } = await supabase
        .from('shop_settings')
        .select('name, logo_url')
        .eq('id', 1)
        .single()

      const finalSettings = settingsError ? cachedSettings : settings
      if (finalSettings) {
        setPharmacy({
          name: finalSettings.name || 'Annbell Fashions and Design',
          logo_url: finalSettings.logo_url || null,
        })
        await localSet('shop_settings', finalSettings)
      }

      return { profile: finalProfile, settings: finalSettings }
    } catch (_) {
      // Network failed after navigator.onLine said true. Stay on cached data.
      return { profile: cachedProfile, settings: cachedSettings }
    }
  }

  useEffect(() => {
    let mounted = true

    async function startApp() {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (!mounted) return

        if (error) {
          setLoading(false)
          return
        }

        const currentSession = data?.session || null
        setSession(currentSession)

        if (currentSession) {
          await loadProfileAndSettings(currentSession.user.id)
        }
      } catch (_) {
        // Supabase may be unreachable. A locally persisted session can still
        // sometimes be recovered by the client; otherwise show Login normally.
      } finally {
        if (mounted) setLoading(false)
      }
    }

    startApp()

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return
      setSession(newSession)

      if (newSession) {
        // INITIAL_SESSION is already handled by startApp(); loading the cached
        // profile again is harmless and keeps auth changes synchronized.
        await loadProfileAndSettings(newSession.user.id)
      } else {
        setProfile(null)
        setTab('dashboard')
      }

      if (mounted) setLoading(false)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (loading) return <div className="app-shell content">Loading Annbell Fashions...</div>

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
        ) : !profile ? (
          <div className="content">
            <h2>Offline profile unavailable</h2>
            <p>Please connect to the internet once so this phone can save your staff profile for offline use.</p>
            <button className="btn-primary" onClick={() => window.location.reload()}>Try Again</button>
          </div>
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
