import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function Settings() {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [receiptFooter, setReceiptFooter] = useState('')
  const [logoUrl, setLogoUrl] = useState(null)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [staff, setStaff] = useState([])
  const [newStaffEmail, setNewStaffEmail] = useState('')
  const [newStaffPassword, setNewStaffPassword] = useState('')
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffRole, setNewStaffRole] = useState('cashier')
  const [creatingStaff, setCreatingStaff] = useState(false)
  const [createStaffStatus, setCreateStaffStatus] = useState('')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const { data: userData } = await supabase.auth.getUser()
    setCurrentUserId(userData?.user?.id || null)
    const { data: settings } = await supabase.from('shop_settings').select('*').eq('id', 1).single()
    if (settings) {
      setName(settings.name)
      setAddress(settings.address)
      setLogoUrl(settings.logo_url)
      setReceiptFooter(settings.receipt_footer || '')
    }
    const { data: profiles } = await supabase.from('profiles').select('*').order('created_at', { ascending: true })
    setStaff(profiles || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function handleLogoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  async function saveDetails(e) {
    e.preventDefault()
    setStatus('')
    setSaving(true)
    try {
      let newLogoUrl = logoUrl
      if (logoFile) {
        const ext = logoFile.name.split('.').pop()
        const fileName = `branding/logo-${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, logoFile)
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName)
        newLogoUrl = urlData.publicUrl
      }
      const { error } = await supabase.from('shop_settings').update({ name, address, logo_url: newLogoUrl, receipt_footer: receiptFooter }).eq('id', 1)
      if (error) throw error
      setLogoUrl(newLogoUrl)
      setLogoFile(null)
      setLogoPreview(null)
      setStatus('Saved ✔')
    } catch (err) {
      setStatus(`Error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function changeRole(profileId, role) {
    await supabase.from('profiles').update({ role }).eq('id', profileId)
    load()
  }

  async function createStaffAccount(e) {
    e.preventDefault()
    setCreateStaffStatus('')
    setCreatingStaff(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-staff', {
        body: { email: newStaffEmail, password: newStaffPassword, name: newStaffName, role: newStaffRole },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setCreateStaffStatus(`✔ ${newStaffName} can now sign in`)
      setNewStaffEmail(''); setNewStaffPassword(''); setNewStaffName(''); setNewStaffRole('cashier')
      load()
    } catch (err) {
      setCreateStaffStatus(`Error: ${err.message}`)
    } finally {
      setCreatingStaff(false)
    }
  }

  if (loading) return <div className="content">Loading...</div>

  return (
    <div className="content">
      <h2>Settings</h2>
      <form onSubmit={saveDetails} style={{ marginBottom: 24 }}>
        <div className="image-upload-box">
          <img src={logoPreview || logoUrl || '/logo.jpg'} alt="Shop logo" style={{ width: 90, height: 90, objectFit: 'contain', marginBottom: 8 }} />
          <input type="file" accept="image/*" onChange={handleLogoChange} />
          <p style={{ fontSize: 12, color: '#6b6357', margin: '4px 0 0' }}>Upload a new logo to replace the current one</p>
        </div>
        <div className="field">
          <label>Shop name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>Address</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} required />
        </div>
        <div className="field">
          <label>Receipt footer message</label>
          <input value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} placeholder="e.g. Thank you for choosing us" />
        </div>
        {status && <p style={{ fontSize: 13 }}>{status}</p>}
        <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save details'}</button>
      </form>

      <h3>Staff & roles</h3>
      <form onSubmit={createStaffAccount} style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 12, color: '#6b6357' }}>Create a login for a new cashier or admin.</p>
        <div className="field">
          <label>Full name</label>
          <input value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} required />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={newStaffEmail} onChange={(e) => setNewStaffEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Temporary password</label>
          <input type="password" value={newStaffPassword} onChange={(e) => setNewStaffPassword(e.target.value)} required minLength={6} />
        </div>
        <div className="field">
          <label>Role</label>
          <select value={newStaffRole} onChange={(e) => setNewStaffRole(e.target.value)}>
            <option value="cashier">Cashier</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {createStaffStatus && <p style={{ fontSize: 13 }}>{createStaffStatus}</p>}
        <button className="btn-primary" type="submit" disabled={creatingStaff}>
          {creatingStaff ? 'Creating...' : 'Create staff account'}
        </button>
      </form>
      {staff.map((s) => (
        <div className="product-card" key={s.id}>
          <div className="product-info">
            <div className="name">{s.name}{s.id === currentUserId ? ' (you)' : ''}</div>
            <div className="meta">{s.role}</div>
          </div>
          {s.id === currentUserId ? (
            <span style={{ fontSize: 12, color: '#6b6357' }}>Ask another admin to change your role</span>
          ) : (
            <select value={s.role} onChange={(e) => changeRole(s.id, e.target.value)}>
              <option value="admin">Admin</option>
              <option value="cashier">Cashier</option>
            </select>
          )}
        </div>
      ))}
    </div>
  )
}
