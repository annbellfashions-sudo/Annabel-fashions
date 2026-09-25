import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Receipt from './Receipt'
import BarcodeScanner from './BarcodeScanner'
import { playScanError } from '../lib/sound'
import { localGet, localSet } from '../lib/offlineStore'

export default function Sales({ userId }) {
  const [products, setProducts] = useState([])
  const [services, setServices] = useState([])
  const [customers, setCustomers] = useState([])
  const [cart, setCart] = useState([]) // { type: 'product'|'service', item, quantity }
  const [customerName, setCustomerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [amountPaid, setAmountPaid] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [completedSale, setCompletedSale] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [staffName, setStaffName] = useState('')

  async function loadStaffName() {
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return
    const { data: prof } = await supabase.from('profiles').select('name').eq('id', userData.user.id).single()
    if (prof?.name) setStaffName(prof.name)
  }

  async function loadProducts() {
    if (!navigator.onLine) { setProducts((await localGet('products')) || []); return }
    const { data } = await supabase.from('products').select('*')
    const rows = data || []
    setProducts(rows)
    await localSet('products', rows)
  }
  async function loadServices() {
    if (!navigator.onLine) { setServices((await localGet('services')) || []); return }
    const { data } = await supabase.from('services').select('*').order('name')
    const rows = data || []
    setServices(rows)
    await localSet('services', rows)
  }
  async function loadCustomers() {
    if (!navigator.onLine) { setCustomers((await localGet('customers')) || []); return }
    const { data } = await supabase.from('customers').select('*').order('name')
    const rows = data || []
    setCustomers(rows)
    await localSet('customers', rows)
  }

  async function cacheSalesSnapshot() {
    if (!navigator.onLine) return
    const { data: allSales } = await supabase.from('sales').select('*').order('created_at', { ascending: false })
    const { data: allItems } = await supabase.from('sales_items').select('quantity, unit_price, cost_price, subtotal, created_at, sale_id, created_by, item_type')
    if (allSales) await localSet('sales', allSales)
    if (allItems) await localSet('sales_items', allItems)
  }

  async function syncOfflineSales() {
    if (!navigator.onLine) return
    const queue = (await localGet('offline_sales')) || []
    if (!queue.length) return
    const remaining = []
    for (const entry of queue) {
      try {
        const { data: sale, error } = await supabase.from('sales').insert(entry.sale && { customer_name: entry.sale.customer_name, total: entry.sale.total, payment_method: entry.sale.payment_method, status: entry.sale.status, amount_paid: entry.sale.amount_paid }).select().single()
        if (error) throw error
        const items = entry.items.map(i => ({ ...i, sale_id: sale.id }))
        const { error: itemError } = await supabase.from('sales_items').insert(items)
        if (itemError) throw itemError
        for (const i of entry.items) if (i.product_id) {
          const p = products.find(x => x.id === i.product_id)
          if (p) await supabase.from('products').update({ stock_quantity: Math.max(0, p.stock_quantity - i.quantity) }).eq('id', p.id)
        }
      } catch (e) { remaining.push(entry) }
    }
    await localSet('offline_sales', remaining)
    if (!remaining.length) setStatus('Offline sales synchronized with Supabase.')
    await loadProducts(); await loadCustomers()
    await cacheSalesSnapshot()
  }

  useEffect(() => {
    loadProducts()
    loadServices()
    loadCustomers()
    loadStaffName()
    const online = () => syncOfflineSales()
    window.addEventListener('online', online)
    if (navigator.onLine) syncOfflineSales()
    return () => window.removeEventListener('online', online)
  }, [])

  function addProductToCart(product) {
    if (!product.stock_quantity || product.stock_quantity <= 0) {
      alert('This product is out of stock, please restock.')
      return
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.type === 'product' && c.item.id === product.id)
      if (existing) {
        if (existing.quantity + 1 > product.stock_quantity) {
          alert('Not enough stock available.')
          return prev
        }
        return prev.map((c) => (c === existing ? { ...c, quantity: c.quantity + 1 } : c))
      }
      return [...prev, { type: 'product', item: product, quantity: 1 }]
    })
  }

  function addServiceToCart(service) {
    if (service.price == null) {
      setStatus(`${service.name} has no price set — add one in Services first`)
      return
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.type === 'service' && c.item.id === service.id)
      if (existing) return prev.map((c) => (c === existing ? { ...c, quantity: c.quantity + 1 } : c))
      return [...prev, { type: 'service', item: service, quantity: 1 }]
    })
  }

  function removeFromCart(type, id) {
    setCart((prev) => prev.filter((c) => !(c.type === type && c.item.id === id)))
  }

  function handleScanResult(decodedText, err) {
    setScanning(false)
    if (err) {
      playScanError()
      setStatus(`Scan error: ${err}`)
      return
    }
    const match = products.find((p) => p.barcode === decodedText)
    if (match) {
      addProductToCart(match)
      setStatus(`Added ${match.name}`)
    } else {
      playScanError()
      setStatus(`No product found with barcode ${decodedText}`)
    }
  }

  const total = cart.reduce((sum, c) => sum + Number(c.item.price) * c.quantity, 0)

  async function checkout() {
    if (cart.length === 0) return
    setSaving(true)
    setStatus('')
    try {
      const finalName = customerName.trim() || 'Walk-in'
      const paidAmount = amountPaid !== '' ? parseFloat(amountPaid) : total

      if (!navigator.onLine) {
        const sale = {
          id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          customer_name: finalName, total, payment_method: paymentMethod,
          status: 'completed', amount_paid: paidAmount, offline: true,
          created_by: userId || null,
          created_at: new Date().toISOString()
        }
        const items = cart.map((c) => ({
          product_id: c.type === 'product' ? c.item.id : null,
          service_id: c.type === 'service' ? c.item.id : null,
          item_type: c.type, quantity: c.quantity, unit_price: c.item.price,
          cost_price: c.type === 'product' ? c.item.cost_price || 0 : 0,
          created_by: userId || null,
          subtotal: c.item.price * c.quantity,
        }))
        const queue = (await localGet('offline_sales')) || []
        queue.push({ sale, items, customerName: finalName })
        await localSet('offline_sales', queue)
        const cachedSales = (await localGet('sales')) || []
        const cachedItems = (await localGet('sales_items')) || []
        await localSet('sales', [sale, ...cachedSales])
        await localSet('sales_items', [...items, ...cachedItems])
        const nextProducts = products.map(p => {
          const line = cart.find(c => c.type === 'product' && c.item.id === p.id)
          return line ? { ...p, stock_quantity: Math.max(0, p.stock_quantity - line.quantity) } : p
        })
        setProducts(nextProducts)
        await localSet('products', nextProducts)
        setCompletedSale({ sale, items: cart.map(c => ({ product: { id: c.item.id, name: c.item.name, price: c.item.price }, quantity: c.quantity })) })
        setCart([]); setCustomerName(''); setAmountPaid('')
        setStatus('Sale saved on this phone. It will sync when internet returns.')
        return
      }

      let customer = customers.find((c) => c.name.toLowerCase() === finalName.toLowerCase())
      if (!customer && finalName !== 'Walk-in') {
        const { data: newCustomer, error: custError } = await supabase
          .from('customers')
          .insert({ name: finalName })
          .select()
          .single()
        if (custError) throw custError
        customer = newCustomer
      }

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert({ customer_name: finalName, total, payment_method: paymentMethod, status: 'completed', amount_paid: paidAmount })
        .select()
        .single()
      if (saleError) throw saleError

      const items = cart.map((c) => ({
        sale_id: sale.id,
        product_id: c.type === 'product' ? c.item.id : null,
        service_id: c.type === 'service' ? c.item.id : null,
        item_type: c.type,
        quantity: c.quantity,
        unit_price: c.item.price,
        cost_price: c.type === 'product' ? c.item.cost_price || 0 : 0,
        subtotal: c.item.price * c.quantity,
      }))
      const { error: itemsError } = await supabase.from('sales_items').insert(items)
      if (itemsError) throw itemsError

      for (const c of cart) {
        if (c.type === 'product') {
          await supabase
            .from('products')
            .update({ stock_quantity: Math.max(0, c.item.stock_quantity - c.quantity) })
            .eq('id', c.item.id)
        }
      }

      if (customer) {
        await supabase.from('customers').update({ total_spent: Number(customer.total_spent || 0) + total }).eq('id', customer.id)
      }

      setCompletedSale({
        sale,
        items: cart.map((c) => ({ product: { id: c.item.id, name: c.item.name, price: c.item.price }, quantity: c.quantity })),
      })
      setCart([])
      setCustomerName('')
      setAmountPaid('')
      loadProducts()
      loadCustomers()
      cacheSalesSnapshot()
    } catch (err) {
      setStatus(`Error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="content">
      {completedSale && (
        <Receipt sale={completedSale.sale} items={completedSale.items} servedBy={staffName} onClose={() => setCompletedSale(null)} />
      )}
      {scanning && <BarcodeScanner onScan={handleScanResult} onClose={() => setScanning(false)} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>New Sale</h2>
        <button className="btn-secondary" onClick={() => setScanning(true)}>📷 Scan item</button>
      </div>
      {status && <p style={{ fontSize: 13 }}>{status}</p>}

      {cart.length > 0 && (
        <div style={{ marginBottom: 20, background: '#f7f5f0', borderRadius: 10, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Cart</h3>
          {cart.map((c) => (
            <div className="cart-row" key={`${c.type}-${c.item.id}`}>
              <span>{c.item.name} x{c.quantity}</span>
              <span>
                KES {(c.item.price * c.quantity).toFixed(2)}{' '}
                <a href="#" onClick={() => removeFromCart(c.type, c.item.id)} style={{ marginLeft: 8, fontSize: 12 }}>remove</a>
              </span>
            </div>
          ))}
          <div className="total-row"><span>Total</span><span>KES {total.toFixed(2)}</span></div>
          <div className="field">
            <label>Customer</label>
            <input
              list="customer-options"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Search or type a new customer"
            />
            <datalist id="customer-options">
              {customers.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>Payment method</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="mpesa">M-Pesa</option>
              <option value="card">Card</option>
            </select>
          </div>
          <div className="field">
            <label>Amount paid (KES)</label>
            <input
              type="number"
              step="0.01"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder={total.toFixed(2)}
            />
          </div>
          {amountPaid !== '' && (
            <p style={{ fontSize: 13, fontWeight: 600, color: parseFloat(amountPaid) - total < 0 ? '#b3261e' : '#123524' }}>
              {parseFloat(amountPaid) - total >= 0
                ? `Change due: KES ${(parseFloat(amountPaid) - total).toFixed(2)}`
                : `Balance due: KES ${(total - parseFloat(amountPaid)).toFixed(2)}`}
            </p>
          )}
          <button className="btn-primary" onClick={checkout} disabled={saving}>
            {saving ? 'Processing...' : 'Complete sale'}
          </button>
        </div>
      )}

      <h3>Products</h3>
      {products.map((p) => {
        const outOfStock = !p.stock_quantity || p.stock_quantity <= 0
        const disabled = outOfStock
        return (
          <div
            className="product-card"
            key={p.id}
            onClick={() => addProductToCart(p)}
            style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}
          >
            {p.image_url ? <img src={p.image_url} alt={p.name} /> : <div className="product-thumb-placeholder">No photo</div>}
            <div className="product-info">
              <div className="name">
                {p.name}{' '}
                {outOfStock && <span className="expired-badge">OUT OF STOCK</span>}
              </div>
              <div className="meta">KES {p.price} • Stock: {p.stock_quantity}</div>
            </div>
          </div>
        )
      })}

      <h3>Services</h3>
      {services.length === 0 && <p style={{ color: '#6b6357' }}>No services added yet — add some in the Services tab.</p>}
      {services.map((s) => (
        <div className="product-card" key={s.id} onClick={() => addServiceToCart(s)} style={{ cursor: 'pointer' }}>
          {s.image_url ? <img src={s.image_url} alt={s.name} /> : <div className="product-thumb-placeholder">🧵</div>}
          <div className="product-info">
            <div className="name">{s.name}</div>
            <div className="meta">{s.description}{s.price != null ? ` • KES ${s.price}` : ' • No price set'}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
