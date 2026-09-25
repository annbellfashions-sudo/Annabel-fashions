import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function SaleDetail({ sale, onClose }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('sales_items')
      .select('quantity, unit_price, subtotal, product:products(name)')
      .eq('sale_id', sale.id)
      .then(({ data }) => {
        setItems(data || [])
        setLoading(false)
      })
  }, [sale.id])

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 55, display: 'flex', alignItems: 'flex-end' }}>
      <div className="modal-sheet" style={{ background: '#fff', maxHeight: '80vh', overflowY: 'auto', borderRadius: '16px 16px 0 0', padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>Sale — {sale.customer_name}</h3>
        <p style={{ fontSize: 13, color: '#6b6357' }}>{new Date(sale.created_at).toLocaleString()} • {sale.payment_method}</p>
        <hr />
        {loading && <p>Loading...</p>}
        {!loading && items.map((it, i) => (
          <div className="cart-row" key={i}>
            <span>{it.product?.name || 'Item'} x{it.quantity}</span>
            <span>KES {Number(it.subtotal).toFixed(2)}</span>
          </div>
        ))}
        <div className="total-row"><span>Total</span><span>KES {Number(sale.total).toFixed(2)}</span></div>
        <button className="btn-secondary" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
