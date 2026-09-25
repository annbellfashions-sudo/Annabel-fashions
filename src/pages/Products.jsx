import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import BarcodeScanner from './BarcodeScanner'
import { playScanError } from '../lib/sound'
import { localGet, localSet } from '../lib/offlineStore'

const emptyForm = { name: '', category: '', costPrice: '', price: '', stock: '', reorderLevel: '10', barcode: '' }

export default function Products({ isAdmin }) {
  const [products, setProducts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [restockingId, setRestockingId] = useState(null)
  const [restockQty, setRestockQty] = useState('')

  async function loadProducts() {
    if (!navigator.onLine) {
      setProducts((await localGet('products')) || [])
      return
    }
    const { data, error: loadError } = await supabase.from('products').select('*').order('created_at', { ascending: false })
    if (loadError) {
      setProducts((await localGet('products')) || [])
      return
    }
    setProducts(data || [])
    await localSet('products', data || [])
  }

  async function syncOfflineProducts() {
    if (!navigator.onLine) return
    const queue = (await localGet('offline_products')) || []
    if (!queue.length) return
    const remaining = []
    for (const item of queue) {
      try {
        if (item.operation === 'insert') {
          const { error } = await supabase.from('products').insert(item.payload)
          if (error) throw error
        } else if (item.operation === 'update') {
          const { error } = await supabase.from('products').update(item.payload).eq('id', item.id)
          if (error) throw error
        } else if (item.operation === 'delete') {
          const { error } = await supabase.from('products').delete().eq('id', item.id)
          if (error) throw error
        }
      } catch (_) {
        remaining.push(item)
      }
    }
    await localSet('offline_products', remaining)
    if (!remaining.length) await loadProducts()
  }

  useEffect(() => {
    loadProducts()
    const online = () => syncOfflineProducts()
    window.addEventListener('online', online)
    if (navigator.onLine) syncOfflineProducts()
    return () => window.removeEventListener('online', online)
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

  function handleScanResult(decodedText, err) {
    setScanning(false)
    if (decodedText) setField('barcode', decodedText)
    else if (err) {
      playScanError()
      setError(err)
    }
  }

  function startEdit(p) {
    setEditingId(p.id)
    setForm({
      name: p.name,
      category: p.category || '',
      costPrice: p.cost_price || '',
      price: p.price,
      stock: p.stock_quantity,
      reorderLevel: p.reorder_level ?? 10,
      barcode: p.barcode || '',
    })
    setImagePreview(p.image_url || null)
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

  async function handleDelete(id) {
    if (!window.confirm('Delete this product? This cannot be undone.')) return
    if (!navigator.onLine) {
      const next = products.filter((p) => p.id !== id)
      const queue = (await localGet('offline_products')) || []
      await localSet('products', next)
      await localSet('offline_products', [...queue, { operation: 'delete', id }])
      setProducts(next)
      return
    }
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) setError(error.message)
    else loadProducts()
  }

  async function handleRestock(id) {
    const qty = parseInt(restockQty, 10)
    if (!qty || qty <= 0) return
    const product = products.find((p) => p.id === id)
    const payload = { stock_quantity: (product.stock_quantity || 0) + qty }
    if (!navigator.onLine) {
      const next = products.map((p) => p.id === id ? { ...p, ...payload } : p)
      const queue = (await localGet('offline_products')) || []
      await localSet('products', next)
      await localSet('offline_products', [...queue, { operation: 'update', id, payload }])
      setProducts(next)
    } else {
      const { error } = await supabase.from('products').update(payload).eq('id', id)
      if (error) setError(error.message)
      else loadProducts()
    }
    setRestockingId(null)
    setRestockQty('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setUploading(true)

    try {
      // Product photos are uploaded to Supabase Storage. When offline, save the
      // product without a new photo and let the user add the photo later online.
      let image_url = editingId ? undefined : null
      if (imageFile) {
        if (!navigator.onLine) {
          if (!editingId) image_url = null
          else image_url = undefined
        } else {
          const ext = imageFile.name.split('.').pop()
          const fileName = `${crypto.randomUUID()}.${ext}`
          const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, imageFile)
          if (uploadError) throw uploadError
          const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(fileName)
          image_url = urlData.publicUrl
        }
      }

      const payload = {
        id: editingId || crypto.randomUUID(),
        name: form.name,
        category: form.category,
        cost_price: form.costPrice ? parseFloat(form.costPrice) : 0,
        price: parseFloat(form.price),
        stock_quantity: parseInt(form.stock || '0', 10),
        reorder_level: parseInt(form.reorderLevel || '10', 10),
        barcode: form.barcode || null,
      }
      if (image_url !== undefined) payload.image_url = image_url
      if (!editingId) payload.created_at = new Date().toISOString()

      if (!navigator.onLine) {
        const current = (await localGet('products')) || products
        const next = editingId
          ? current.map((p) => p.id === editingId ? { ...p, ...payload } : p)
          : [payload, ...current]
        const queue = (await localGet('offline_products')) || []
        await localSet('products', next)
        await localSet('offline_products', [...queue, { operation: editingId ? 'update' : 'insert', id: payload.id, payload }])
        setProducts(next)
        cancelForm()
        return
      }

      if (editingId) {
        const { error: updateError } = await supabase.from('products').update(payload).eq('id', editingId)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase.from('products').insert(payload)
        if (insertError) throw insertError
      }

      cancelForm()
      loadProducts()
    } catch (err) {
      setError(err.message || 'Failed to save product')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="content">
      {scanning && <BarcodeScanner onScan={handleScanResult} onClose={() => setScanning(false)} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Products</h2>
        <button className="btn-secondary" onClick={() => (showForm ? cancelForm() : setShowForm(true))}>
          {showForm ? 'Cancel' : '+ Add product'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
          <div className="image-upload-box">
            {imagePreview && <img src={imagePreview} className="image-preview" alt="preview" />}
            <input type="file" accept="image/*" onChange={handleFileChange} />
            <p style={{ fontSize: 12, color: '#6b6357', margin: '4px 0 0' }}>Optional — add a photo of the item</p>
          </div>
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setField('name', e.target.value)} required />
          </div>
          <div className="field">
            <label>Category</label>
            <input value={form.category} onChange={(e) => setField('category', e.target.value)} />
          </div>
          <div className="field">
            <label>Barcode</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={form.barcode} onChange={(e) => setField('barcode', e.target.value)} placeholder="Scan or type" style={{ flex: 1 }} />
              <button type="button" className="btn-secondary" onClick={() => setScanning(true)}>Scan</button>
            </div>
          </div>
          <div className="field">
            <label>Buying price / cost (KES)</label>
            <input type="number" step="0.01" value={form.costPrice} onChange={(e) => setField('costPrice', e.target.value)} />
          </div>
          <div className="field">
            <label>Selling price (KES)</label>
            <input type="number" step="0.01" value={form.price} onChange={(e) => setField('price', e.target.value)} required />
          </div>
          <div className="field">
            <label>Stock quantity</label>
            <input type="number" value={form.stock} onChange={(e) => setField('stock', e.target.value)} />
          </div>
          <div className="field">
            <label>Low stock alert level</label>
            <input type="number" value={form.reorderLevel} onChange={(e) => setField('reorderLevel', e.target.value)} />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn-primary" type="submit" disabled={uploading}>
            {uploading ? 'Saving...' : editingId ? 'Update product' : 'Save product'}
          </button>
        </form>
      )}

      {products.map((p) => {
        const lowStock = p.stock_quantity > 0 && p.stock_quantity <= (p.reorder_level ?? 10)
        return (
          <div key={p.id}>
            <div className="product-card">
              {p.image_url ? <img src={p.image_url} alt={p.name} /> : <div className="product-thumb-placeholder">No photo</div>}
              <div className="product-info">
                <div className="name">
                  {p.name}{' '}
                  {lowStock && <span className="expired-badge" style={{ color: '#a0680a' }}>LOW STOCK</span>}
                  {p.stock_quantity <= 0 && <span className="expired-badge">OUT OF STOCK</span>}
                </div>
                <div className="meta">{p.category || 'Uncategorized'} • Sell KES {p.price} • Cost KES {p.cost_price || 0} • Stock: {p.stock_quantity}</div>
              </div>
              <div className="product-actions">
                <button className="icon-btn" onClick={() => setRestockingId(restockingId === p.id ? null : p.id)} title="Restock">📦</button>
                {isAdmin && (
                  <>
                    <button className="icon-btn" onClick={() => startEdit(p)} title="Edit">✏️</button>
                    <button className="icon-btn" onClick={() => handleDelete(p.id)} title="Delete">🗑️</button>
                  </>
                )}
              </div>
            </div>
            {restockingId === p.id && (
              <div style={{ display: 'flex', gap: 8, padding: '0 0 12px' }}>
                <input
                  type="number"
                  placeholder="Quantity to add"
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  style={{ flex: 1, padding: 8, border: '1px solid #d9d3c7', borderRadius: 6 }}
                />
                <button className="btn-primary" style={{ width: 'auto', padding: '8px 16px' }} onClick={() => handleRestock(p.id)}>Add</button>
              </div>
            )}
          </div>
        )
      })}
      {products.length === 0 && !showForm && <p style={{ color: '#6b6357' }}>No products yet. Add your first one.</p>}
    </div>
  )
}
