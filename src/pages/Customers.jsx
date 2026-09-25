import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { localGet, localSet } from '../lib/offlineStore'

const emptyForm = { name: '', phone: '', email: '' }

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  async function load() {
    if (!navigator.onLine) {
      setCustomers((await localGet('customers')) || [])
      return
    }
    const { data, error: loadError } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    if (loadError) {
      setCustomers((await localGet('customers')) || [])
      return
    }
    setCustomers(data || [])
    await localSet('customers', data || [])
  }

  async function syncOfflineCustomers() {
    if (!navigator.onLine) return
    const queue = (await localGet('offline_customers')) || []
    if (!queue.length) return
    const remaining = []
    for (const item of queue) {
      try {
        if (item.operation === 'insert') {
          const { error } = await supabase.from('customers').insert(item.payload)
          if (error) throw error
        } else if (item.operation === 'update') {
          const { error } = await supabase.from('customers').update(item.payload).eq('id', item.id)
          if (error) throw error
        } else if (item.operation === 'delete') {
          const { error } = await supabase.from('customers').delete().eq('id', item.id)
          if (error) throw error
        }
      } catch (_) { remaining.push(item) }
    }
    await localSet('offline_customers', remaining)
    if (!remaining.length) await load()
  }

  useEffect(() => {
    load()
    const online = () => syncOfflineCustomers()
    window.addEventListener('online', online)
    if (navigator.onLine) syncOfflineCustomers()
    return () => window.removeEventListener('online', online)
  }, [])

  function setField(key, value) { setForm((f) => ({ ...f, [key]: value })) }
  function startEdit(c) {
    setEditingId(c.id); setForm({ name: c.name, phone: c.phone || '', email: c.email || '' }); setShowForm(true)
  }
  function cancelForm() { setShowForm(false); setEditingId(null); setForm(emptyForm); setError('') }

  async function handleSubmit(e) {
    e.preventDefault(); setError('')
    const payload = { name: form.name, phone: form.phone, email: form.email }
    try {
      if (!navigator.onLine) {
        const id = editingId || crypto.randomUUID()
        const full = { ...payload, id, total_spent: editingId ? (customers.find(c => c.id === editingId)?.total_spent || 0) : 0, ...(editingId ? {} : { created_at: new Date().toISOString() }) }
        const current = (await localGet('customers')) || customers
        const next = editingId ? current.map(c => c.id === editingId ? { ...c, ...full } : c) : [full, ...current]
        const queue = (await localGet('offline_customers')) || []
        await localSet('customers', next)
        await localSet('offline_customers', [...queue, { operation: editingId ? 'update' : 'insert', id, payload: full }])
        setCustomers(next); cancelForm(); return
      }
      const { error } = editingId
        ? await supabase.from('customers').update(payload).eq('id', editingId)
        : await supabase.from('customers').insert(payload)
      if (error) throw error
      cancelForm(); load()
    } catch (err) { setError(err.message) }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this customer?')) return
    if (!navigator.onLine) {
      const next = customers.filter(c => c.id !== id)
      const queue = (await localGet('offline_customers')) || []
      await localSet('customers', next)
      await localSet('offline_customers', [...queue, { operation: 'delete', id }])
      setCustomers(next); return
    }
    await supabase.from('customers').delete().eq('id', id); load()
  }

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><h2 style={{ margin: 0 }}>Customers</h2><button className="btn-secondary" onClick={() => (showForm ? cancelForm() : setShowForm(true))}>{showForm ? 'Cancel' : '+ Add customer'}</button></div>
      {showForm && <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
        <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setField('name', e.target.value)} required /></div>
        <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setField('phone', e.target.value)} /></div>
        <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} /></div>
        {error && <p className="error-text">{error}</p>}<button className="btn-primary" type="submit">{editingId ? 'Update customer' : 'Save customer'}</button>
      </form>}
      {customers.map(c => <div className="product-card" key={c.id}><div className="product-info"><div className="name">{c.name}</div><div className="meta">{c.phone || c.email || ''} • Total spent: KES {c.total_spent || 0}</div></div><div className="product-actions"><button className="icon-btn" onClick={() => startEdit(c)} title="Edit">✏️</button><button className="icon-btn" onClick={() => handleDelete(c.id)} title="Delete">🗑️</button></div></div>)}
      {customers.length === 0 && !showForm && <p style={{ color: '#6b6357' }}>No customers recorded yet.</p>}
    </div>
  )
}
