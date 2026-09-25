import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import OrderInvoice from './OrderInvoice'

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [vendors, setVendors] = useState([])
  const [products, setProducts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [vendorId, setVendorId] = useState('')
  const [cart, setCart] = useState([]) // { id, name, quantity, unit_cost }
  const [viewing, setViewing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function loadAll() {
    const [{ data: ord }, { data: vend }, { data: prod }] = await Promise.all([
      supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('vendors').select('*').order('name'),
      supabase.from('products').select('*').order('name'),
    ])
    setOrders(ord || [])
    setVendors(vend || [])
    setProducts(prod || [])
  }

  useEffect(() => {
    loadAll()
  }, [])

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === product.id)
      if (existing) return prev.map((c) => (c.id === product.id ? { ...c, quantity: c.quantity + 1 } : c))
      return [...prev, { id: product.id, name: product.name, quantity: 1, unit_cost: product.cost_price || 0 }]
    })
  }

  function updateCartItem(id, field, value) {
    setCart((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))
  }

  function removeFromCart(id) {
    setCart((prev) => prev.filter((c) => c.id !== id))
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setVendorId('')
    setCart([])
    setError('')
  }

  async function startEdit(order) {
    const { data: items } = await supabase.from('purchase_order_items').select('*').eq('order_id', order.id)
    setEditingId(order.id)
    setVendorId(order.vendor_id || '')
    setCart(
      (items || []).map((it) => ({
        id: it.product_id,
        name: it.product_name,
        quantity: it.quantity,
        unit_cost: it.unit_cost,
      }))
    )
    setShowForm(true)
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this order?')) return
    await supabase.from('purchase_orders').delete().eq('id', id)
    loadAll()
  }

  const total = cart.reduce((sum, c) => sum + Number(c.unit_cost) * Number(c.quantity), 0)

  async function saveOrder() {
    if (!vendorId || cart.length === 0) {
      setError('Pick a vendor and at least one product')
      return
    }
    setSaving(true)
    setError('')
    try {
      const vendor = vendors.find((v) => v.id === vendorId)
      let order

      if (editingId) {
        const { data, error: updateError } = await supabase
          .from('purchase_orders')
          .update({ vendor_id: vendorId, vendor_name: vendor.name, total })
          .eq('id', editingId)
          .select()
          .single()
        if (updateError) throw updateError
        order = data
        const { error: delError } = await supabase.from('purchase_order_items').delete().eq('order_id', editingId)
        if (delError) throw delError
      } else {
        const { data, error: orderError } = await supabase
          .from('purchase_orders')
          .insert({ vendor_id: vendorId, vendor_name: vendor.name, total, status: 'sent' })
          .select()
          .single()
        if (orderError) throw orderError
        order = data
      }

      const items = cart.map((c) => ({
        order_id: order.id,
        product_id: c.id,
        product_name: c.name,
        quantity: c.quantity,
        unit_cost: Number(c.unit_cost),
        subtotal: Number(c.unit_cost) * c.quantity,
      }))
      const { error: itemsError } = await supabase.from('purchase_order_items').insert(items)
      if (itemsError) throw itemsError

      setViewing({ order, items, vendor })
      cancelForm()
      loadAll()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function openExistingOrder(order) {
    const { data: items } = await supabase.from('purchase_order_items').select('*').eq('order_id', order.id)
    const vendor = vendors.find((v) => v.id === order.vendor_id)
    setViewing({ order, items: items || [], vendor })
  }

  return (
    <div className="content">
      {viewing && (
        <OrderInvoice order={viewing.order} items={viewing.items} vendor={viewing.vendor} onClose={() => setViewing(null)} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Orders</h2>
        <button className="btn-secondary" onClick={() => (showForm ? cancelForm() : setShowForm(true))}>
          {showForm ? 'Cancel' : '+ New order'}
        </button>
      </div>

      {showForm && (
        <div style={{ marginBottom: 20 }}>
          <div className="field">
            <label>Vendor</label>
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">Select a vendor</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>

          <h3>Pick products</h3>
          {products.map((p) => (
            <div className="product-card" key={p.id} onClick={() => addToCart(p)} style={{ cursor: 'pointer' }}>
              <div className="product-info">
                <div className="name">{p.name}</div>
                <div className="meta">Current cost: KES {p.cost_price || 0} • Stock: {p.stock_quantity}</div>
              </div>
            </div>
          ))}

          {cart.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3>Order items</h3>
              {cart.map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ flex: 1, fontSize: 14 }}>{c.name}</span>
                  <input
                    type="number"
                    value={c.quantity}
                    onChange={(e) => updateCartItem(c.id, 'quantity', parseInt(e.target.value || '1', 10))}
                    style={{ width: 60, padding: 6, border: '1px solid #d9d3c7', borderRadius: 6 }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={c.unit_cost}
                    onChange={(e) => updateCartItem(c.id, 'unit_cost', e.target.value)}
                    style={{ width: 80, padding: 6, border: '1px solid #d9d3c7', borderRadius: 6 }}
                  />
                  <a href="#" onClick={() => removeFromCart(c.id)} style={{ fontSize: 12 }}>remove</a>
                </div>
              ))}
              <div className="total-row"><span>Total</span><span>KES {total.toFixed(2)}</span></div>
              {error && <p className="error-text">{error}</p>}
              <button className="btn-primary" onClick={saveOrder} disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update & prepare invoice' : 'Save & prepare invoice'}
              </button>
            </div>
          )}
        </div>
      )}

      <h3>Past orders</h3>
      {orders.length === 0 && <p style={{ color: '#6b6357' }}>No orders yet.</p>}
      {orders.map((o) => (
        <div className="product-card" key={o.id}>
          <div className="product-info" onClick={() => openExistingOrder(o)} style={{ cursor: 'pointer' }}>
            <div className="name">{o.vendor_name}</div>
            <div className="meta">{new Date(o.created_at).toLocaleDateString()} • KES {Number(o.total).toFixed(2)} • {o.status}</div>
          </div>
          <div className="product-actions">
            <button className="icon-btn" onClick={() => startEdit(o)} title="Edit">✏️</button>
            <button className="icon-btn" onClick={() => handleDelete(o.id)} title="Delete">🗑️</button>
          </div>
        </div>
      ))}
    </div>
  )
}
