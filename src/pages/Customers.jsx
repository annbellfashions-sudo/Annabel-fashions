import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const emptyForm = { name: '', phone: '', email: '' }

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  async function load() {
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    setCustomers(data || [])
  }

  useEffect(() => {
    load()
  }, [])

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function startEdit(c) {
    setEditingId(c.id)
    setForm({ name: c.name, phone: c.phone || '', email: c.email || '' })
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (editingId) {
      const { error } = await supabase.from('customers').update(form).eq('id', editingId)
      if (error) {
        setError(error.message)
        return
      }
    } else {
      const { error } = await supabase.from('customers').insert(form)
      if (error) {
        setError(error.message)
        return
      }
    }
    cancelForm()
    load()
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this customer?')) return
    await supabase.from('customers').delete().eq('id', id)
    load()
  }

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Customers</h2>
        <button className="btn-secondary" onClick={() => (showForm ? cancelForm() : setShowForm(true))}>
          {showForm ? 'Cancel' : '+ Add customer'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          </div>
          <div className="field">
            <label>Phone</label>
            <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn-primary" type="submit">{editingId ? 'Update customer' : 'Save customer'}</button>
        </form>
      )}

      {customers.map((c) => (
        <div className="product-card" key={c.id}>
          <div className="product-info">
            <div className="name">{c.name}</div>
            <div className="meta">{c.phone || c.email || ''} • Total spent: KES {c.total_spent}</div>
          </div>
          <div className="product-actions">
            <button className="icon-btn" onClick={() => startEdit(c)} title="Edit">✏️</button>
            <button className="icon-btn" onClick={() => handleDelete(c.id)} title="Delete">🗑️</button>
          </div>
        </div>
      ))}
      {customers.length === 0 && !showForm && <p style={{ color: '#6b6357' }}>No customers recorded yet.</p>}
    </div>
  )
}
