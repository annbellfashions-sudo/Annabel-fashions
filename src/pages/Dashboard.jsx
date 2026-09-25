import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import SaleDetail from './SaleDetail'
import { localGet, localSet } from '../lib/offlineStore'

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
function startOfWeek() {
  const d = startOfToday()
  d.setDate(d.getDate() - d.getDay())
  return d
}
function startOfMonth() {
  const d = startOfToday()
  d.setDate(1)
  return d
}

// scope: 'all' (admin — full financials) or 'own' (cashier — just their own sales)
export default function Dashboard({ scope = 'all', userId, isAdmin }) {
  const [range, setRange] = useState('today')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [salesItems, setSalesItems] = useState([])
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewingSale, setViewingSale] = useState(null)

  const { from, to } = useMemo(() => {
    if (range === 'today') return { from: startOfToday(), to: new Date() }
    if (range === 'week') return { from: startOfWeek(), to: new Date() }
    if (range === 'month') return { from: startOfMonth(), to: new Date() }
    return {
      from: customFrom ? new Date(customFrom) : startOfToday(),
      to: customTo ? new Date(new Date(customTo).setHours(23, 59, 59, 999)) : new Date(),
    }
  }, [range, customFrom, customTo])

  async function loadData() {
    setLoading(true)

    // Offline: use the complete sales/products/expenses snapshot saved on this phone.
    // Never wait on Supabase when the device has no connection.
    if (!navigator.onLine) {
      const [cachedItems, cachedSales, cachedProducts, cachedExpenses] = await Promise.all([
        localGet('sales_items'),
        localGet('sales'),
        localGet('products'),
        localGet('expenses'),
      ])
      const allItems = cachedItems || []
      const allSales = cachedSales || []
      const start = from.getTime()
      const end = to.getTime()
      const items = allItems.filter((it) => {
        const t = new Date(it.created_at || 0).getTime()
        const own = scope !== 'own' || it.created_by === userId
        return t >= start && t <= end && own
      })
      const salesRows = allSales.filter((row) => {
        const t = new Date(row.created_at || 0).getTime()
        const own = scope !== 'own' || row.created_by === userId
        return t >= start && t <= end && own
      })
      const expRows = (cachedExpenses || []).filter((e) => {
        const d = String(e.expense_date || '')
        return d >= from.toISOString().slice(0, 10) && d <= to.toISOString().slice(0, 10)
      })
      setSalesItems(items)
      setSales(salesRows)
      setProducts(cachedProducts || [])
      setExpenses(scope === 'all' ? expRows : [])
      setLoading(false)
      return
    }

    let itemsQuery = supabase
      .from('sales_items')
      .select('quantity, unit_price, cost_price, subtotal, created_at, sale_id, created_by, item_type')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
    if (scope === 'own') itemsQuery = itemsQuery.eq('created_by', userId)
    const { data: items } = await itemsQuery
    setSalesItems(items || [])

    let salesQuery = supabase
      .from('sales')
      .select('*')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at', { ascending: false })
    if (scope === 'own') salesQuery = salesQuery.eq('created_by', userId)
    const { data: salesRows } = await salesQuery
    setSales(salesRows || [])

    // Cache the full current snapshots so the dashboard can render offline later.
    const { data: allItems } = await supabase.from('sales_items').select('quantity, unit_price, cost_price, subtotal, created_at, sale_id, created_by, item_type')
    const { data: allSales } = await supabase.from('sales').select('*').order('created_at', { ascending: false })
    if (allItems) await localSet('sales_items', allItems)
    if (allSales) await localSet('sales', allSales)

    if (scope === 'all') {
      const { data: prods } = await supabase.from('products').select('name, cost_price, price, stock_quantity, reorder_level')
      setProducts(prods || [])
      if (prods) {
        // Products page stores the full product rows; dashboard keeps its own lightweight snapshot too.
        const fullProducts = (await localGet('products')) || prods
        await localSet('products', fullProducts)
      }
      const { data: exp } = await supabase
        .from('expenses')
        .select('amount, expense_date')
        .gte('expense_date', from.toISOString().slice(0, 10))
        .lte('expense_date', to.toISOString().slice(0, 10))
      setExpenses(exp || [])

      const { data: allExpenses } = await supabase.from('expenses').select('amount, expense_date')
      if (allExpenses) await localSet('expenses', allExpenses)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customFrom, customTo, scope, userId])

  async function handleDeleteSale(saleId) {
    if (!window.confirm('Delete this sale? Stock will be restored for its items.')) return
    const { data: items } = await supabase.from('sales_items').select('product_id, quantity').eq('sale_id', saleId)
    for (const it of items || []) {
      const { data: prod } = await supabase.from('products').select('stock_quantity').eq('id', it.product_id).single()
      if (prod) {
        await supabase.from('products').update({ stock_quantity: prod.stock_quantity + it.quantity }).eq('id', it.product_id)
      }
    }
    const { error } = await supabase.from('sales').delete().eq('id', saleId)
    if (error) {
      alert(error.message)
      return
    }
    loadData()
  }

  const totalRevenue = salesItems.reduce((sum, it) => sum + Number(it.subtotal), 0)
  const totalCost = salesItems.reduce((sum, it) => sum + Number(it.cost_price) * Number(it.quantity), 0)
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const salesAfterExpenses = totalRevenue - totalExpenses
  const servicesSold = salesItems.filter((it) => it.item_type === 'service').reduce((s, it) => s + it.quantity, 0)
  const grossProfit = totalRevenue - totalCost
  const netProfit = grossProfit - totalExpenses
  const stockValue = products.reduce((sum, p) => sum + Number(p.cost_price || 0) * Number(p.stock_quantity || 0), 0)
  const potentialRevenue = products.reduce((sum, p) => sum + Number(p.price || 0) * Number(p.stock_quantity || 0), 0)
  const lowStockProducts = products.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= (p.reorder_level ?? 10))

  const chartData = useMemo(() => {
    const byDay = {}
    salesItems.forEach((it) => {
      const day = new Date(it.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      byDay[day] = (byDay[day] || 0) + Number(it.subtotal)
    })
    return Object.entries(byDay).map(([day, total]) => ({ day, total }))
  }, [salesItems])

  return (
    <div className="content">
      {viewingSale && <SaleDetail sale={viewingSale} onClose={() => setViewingSale(null)} />}
      <h2>{scope === 'own' ? 'My Sales' : 'Dashboard'}</h2>

      {scope === 'all' && lowStockProducts.length > 0 && (
        <div style={{ background: '#fdf3e3', border: '1px solid #f0dcb0', borderRadius: 10, padding: 12, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#a0680a', marginBottom: 4 }}>📦 {lowStockProducts.length} product{lowStockProducts.length > 1 ? 's' : ''} low on stock</div>
          {lowStockProducts.map((p) => (
            <div key={p.name} style={{ fontSize: 13, color: '#6b6357' }}>{p.name} — {p.stock_quantity} left</div>
          ))}
        </div>
      )}

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={range === 'today' ? 'active' : ''} onClick={() => setRange('today')}>Today</button>
        <button className={range === 'week' ? 'active' : ''} onClick={() => setRange('week')}>Week</button>
        <button className={range === 'month' ? 'active' : ''} onClick={() => setRange('month')}>Month</button>
        <button className={range === 'custom' ? 'active' : ''} onClick={() => setRange('custom')}>Custom</button>
      </div>

      {range === 'custom' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>From</label>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>To</label>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 20 }}>
            <DashCard label="Total sales" value={`KES ${totalRevenue.toFixed(2)}`} bg="#e3f2ec" fg="#0f6b41" />
            {scope === 'all' && (
              <DashCard label="Cash left after expenses" value={`KES ${salesAfterExpenses.toFixed(2)}`} bg={salesAfterExpenses >= 0 ? '#e0f3f5' : '#fbeceb'} fg={salesAfterExpenses >= 0 ? '#0e6e79' : '#b3261e'} />
            )}
            <DashCard label="Items sold" value={salesItems.reduce((s, it) => s + it.quantity, 0)} bg="#e8ecfb" fg="#3949ab" />
            {scope === 'all' && <DashCard label="Services sold" value={servicesSold} bg="#f3e8fb" fg="#7b1fa2" />}
            {scope === 'all' && (
              <>
                <DashCard label="Gross profit" value={`KES ${grossProfit.toFixed(2)}`} bg={grossProfit >= 0 ? '#e6f4e6' : '#fbeceb'} fg={grossProfit >= 0 ? '#2e7d32' : '#b3261e'} />
                <DashCard label="Expenses" value={`KES ${totalExpenses.toFixed(2)}`} bg="#fdeee3" fg="#c25a10" />
                <DashCard label="Net profit" value={`KES ${netProfit.toFixed(2)}`} bg={netProfit >= 0 ? '#123524' : '#fbeceb'} fg={netProfit >= 0 ? '#ffffff' : '#b3261e'} />
                <DashCard label="Cost of goods sold" value={`KES ${totalCost.toFixed(2)}`} bg="#f5efe0" fg="#8a6d1f" />
                <DashCard label="Stock value (cost)" value={`KES ${stockValue.toFixed(2)}`} bg="#e6eef7" fg="#1a5a96" />
                <DashCard label="Stock value (retail)" value={`KES ${potentialRevenue.toFixed(2)}`} bg="#fde8ef" fg="#ad1457" />
              </>
            )}
          </div>

          {chartData.length > 0 && (
            <div style={{ height: 200, marginBottom: 20 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="day" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v) => `KES ${v.toFixed(2)}`} />
                  <Bar dataKey="total" fill="#123524" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <h3>Sales in this period (tap to view items)</h3>
          {sales.length === 0 && <p style={{ color: '#6b6357' }}>No sales recorded in this period.</p>}
          {sales.map((s) => {
            const canDelete = isAdmin || s.created_by === userId
            return (
              <div className="product-card" key={s.id} onClick={() => setViewingSale(s)} style={{ cursor: 'pointer' }}>
                <div className="product-info">
                  <div className="name">{s.customer_name} — KES {Number(s.total).toFixed(2)}</div>
                  <div className="meta">{new Date(s.created_at).toLocaleString()} • {s.payment_method}</div>
                </div>
                {canDelete && (
                  <div className="product-actions">
                    <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleDeleteSale(s.id) }} title="Delete sale">🗑️</button>
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function DashCard({ label, value, bg = '#f3efe4', fg = '#123524' }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, color: fg, opacity: 0.75 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: fg }}>{value}</div>
    </div>
  )
}
