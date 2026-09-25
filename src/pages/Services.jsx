import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const SUGGESTED_SERVICES = [
  { name: 'Custom garment tailoring', description: 'Made-to-measure suits, dresses, and outfits' },
  { name: 'Alterations', description: 'Resizing, hemming, and fit adjustments' },
  { name: 'Wedding attire design', description: 'Bridal gowns, bridesmaid dresses, groom suits' },
  { name: 'School uniform tailoring', description: 'Bulk or individual uniform orders' },
  { name: 'Embroidery & embellishment', description: 'Custom stitching, beadwork, patches' },
  { name: 'Garment repair & mending', description: 'Zips, tears, patchwork' },
  { name: 'Measurements & fittings', description: 'In-person sizing sessions' },
  { name: 'Fabric consultation', description: 'Helping customers choose fabric and design' },
  { name: 'Rush / express service', description: 'Same-day or next-day turnaround for an extra fee' },
]

const emptyForm = { name: '', description: '', price: '' }

export default function Services() {
  const [services, setServices] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function loadServices() {
    const { data } = await supabase.from('services').select('*').order('created_at', { ascending: false })
    setServices(data || [])
  }

  useEffect(() => {
    loadServices()
  }, [])

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function startEdit(s) {
    setEditingId(s.id)
    setForm({ name: s.name, description: s.description || '', price: s.price ?? '' })
    setImagePreview(s.image_url || null)
    setImageFile(null)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setImageFile(null)
    setImagePreview(null)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setUploading(true)
    try {
      let image_url = editingId ? undefined : null
      if (imageFile) {
        const ext = imageFile.name.split('.').pop()
        const fileName = `services/${crypto.randomUUID()}.${ext}`
        const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, imageFile)
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName)
        image_url = urlData.publicUrl
      }

      const payload = {
        name: form.name,
        description: form.description,
        price: form.price !== '' ? parseFloat(form.price) : null,
      }
      if (image_url !== undefined) payload.image_url = image_url

      if (editingId) {
        const { error } = await supabase.from('services').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('services').insert(payload)
        if (error) throw error
      }
      cancelForm()
      loadServices()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this service?')) return
    await supabase.from('services').delete().eq('id', id)
    loadServices()
  }

  async function addSuggested(s) {
    await supabase.from('services').insert({ name: s.name, description: s.description })
    loadServices()
  }

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Services</h2>
        <button className="btn-secondary" onClick={() => (showForm ? cancelForm() : setShowForm(true))}>
          {showForm ? 'Cancel' : '+ Add service'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
          <div className="image-upload-box">
            {imagePreview && <img src={imagePreview} className="image-preview" alt="preview" />}
            <input type="file" accept="image/*" onChange={handleFileChange} />
            <p style={{ fontSize: 12, color: '#6b6357', margin: '4px 0 0' }}>Optional — add a photo for this service</p>
          </div>
          <div className="field">
            <label>Service name</label>
            <input value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          </div>
          <div className="field">
            <label>Description</label>
            <input value={form.description} onChange={(e) => setField('description', e.target.value)} />
          </div>
          <div className="field">
            <label>Price (KES, optional)</label>
            <input type="number" step="0.01" value={form.price} onChange={(e) => setField('price', e.target.value)} />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn-primary" type="submit" disabled={uploading}>
            {uploading ? 'Saving...' : editingId ? 'Update service' : 'Save service'}
          </button>
        </form>
      )}

      {services.map((s) => (
        <div className="product-card" key={s.id}>
          {s.image_url ? <img src={s.image_url} alt={s.name} /> : <div className="product-thumb-placeholder">🧵</div>}
          <div className="product-info">
            <div className="name">{s.name}</div>
            <div className="meta">{s.description}{s.price != null ? ` • KES ${s.price}` : ''}</div>
          </div>
          <div className="product-actions">
            <button className="icon-btn" onClick={() => startEdit(s)} title="Edit">✏️</button>
            <button className="icon-btn" onClick={() => handleDelete(s.id)} title="Delete">🗑️</button>
          </div>
        </div>
      ))}

      {services.length === 0 && !showForm && (
        <>
          <p style={{ color: '#6b6357' }}>No services added yet. Common tailoring services you could offer:</p>
          {SUGGESTED_SERVICES.map((s) => (
            <div className="product-card" key={s.name}>
              <div className="product-info">
                <div className="name">{s.name}</div>
                <div className="meta">{s.description}</div>
              </div>
              <button className="btn-secondary" onClick={() => addSuggested(s)}>Add</button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
