import { useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import { supabase } from '../lib/supabaseClient'

export default function OrderInvoice({ order, items, vendor, onClose }) {
  const [pharmacy, setPharmacy] = useState({ name: 'Annbell Fashions and Design', address: 'Enter your shop address in Settings', logo_url: null })

  useEffect(() => {
    supabase
      .from('shop_settings')
      .select('name, address, logo_url')
      .eq('id', 1)
      .single()
      .then(({ data }) => data && setPharmacy(data))
  }, [])

  const logoSrc = pharmacy.logo_url || '/logo.jpg'

  function buildSummaryText() {
    const lines = [
      `Purchase Order from ${pharmacy.name}`,
      `To: ${order.vendor_name || vendor?.name || 'Vendor'}`,
      `Date: ${new Date(order.created_at || Date.now()).toLocaleDateString()}`,
      '',
      ...items.map((it) => `${it.product_name} x${it.quantity} — KES ${Number(it.subtotal).toFixed(2)}`),
      '',
      `Total: KES ${Number(order.total).toFixed(2)}`,
    ]
    return lines.join('\n')
  }

  function sendWhatsApp() {
    const text = encodeURIComponent(buildSummaryText())
    const phone = vendor?.phone ? vendor.phone.replace(/[^0-9]/g, '') : ''
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`
    window.open(url, '_blank')
  }

  function savePdf() {
    const doc = new jsPDF()
    let y = 20
    doc.setFontSize(16)
    doc.text(pharmacy.name, 20, y)
    y += 7
    doc.setFontSize(10)
    doc.text(pharmacy.address, 20, y)
    y += 12
    doc.setFontSize(12)
    doc.text(`Purchase Order — To: ${order.vendor_name || vendor?.name || 'Vendor'}`, 20, y)
    y += 6
    doc.setFontSize(10)
    doc.text(`Date: ${new Date(order.created_at || Date.now()).toLocaleDateString()}`, 20, y)
    y += 10
    doc.line(20, y, 190, y)
    y += 8
    items.forEach((it) => {
      doc.text(`${it.product_name} x${it.quantity}`, 20, y)
      doc.text(`KES ${Number(it.subtotal).toFixed(2)}`, 160, y)
      y += 7
    })
    y += 4
    doc.line(20, y, 190, y)
    y += 8
    doc.setFontSize(12)
    doc.text(`Total: KES ${Number(order.total).toFixed(2)}`, 20, y)
    doc.save(`order-${(order.vendor_name || 'vendor').replace(/\s+/g, '-')}-${Date.now()}.pdf`)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end' }}>
      <div className="modal-sheet" style={{ background: '#fff', maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px 16px 0 0', padding: 20 }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <img src={logoSrc} alt={pharmacy.name} style={{ width: 60, height: 60, objectFit: 'contain' }} onError={(e) => (e.target.style.display = 'none')} />
          <h3 style={{ margin: '6px 0 0' }}>{pharmacy.name}</h3>
          <p style={{ fontSize: 12, color: '#6b6357', margin: 0 }}>{pharmacy.address}</p>
        </div>
        <p style={{ fontSize: 13 }}>Purchase order to: <strong>{order.vendor_name || vendor?.name}</strong></p>
        <p style={{ fontSize: 13 }}>Date: {new Date(order.created_at || Date.now()).toLocaleString()}</p>
        <hr />
        {items.map((it, i) => (
          <div className="cart-row" key={i}>
            <span>{it.product_name} x{it.quantity}</span>
            <span>KES {Number(it.subtotal).toFixed(2)}</span>
          </div>
        ))}
        <div className="total-row"><span>Total</span><span>KES {Number(order.total).toFixed(2)}</span></div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Close</button>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => window.print()}>Print</button>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={savePdf}>Save PDF</button>
          <button className="btn-primary" style={{ flex: '1 0 100%' }} onClick={sendWhatsApp}>Send via WhatsApp</button>
        </div>
      </div>
    </div>
  )
}
