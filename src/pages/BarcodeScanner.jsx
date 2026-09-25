import { useEffect, useRef } from 'react'
import { Html5QrcodeScanner } from 'html5-qrcode'
import { playScanSuccess, playScanError } from '../lib/sound'

// Uses the library's built-in scanner UI (handles camera permission prompts,
// device selection, and start/stop lifecycle far more reliably than driving
// the raw camera stream by hand).
export default function BarcodeScanner({ onScan, onClose }) {
  const containerId = 'barcode-scanner-region'
  const scannerRef = useRef(null)
  const doneRef = useRef(false)

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      containerId,
      { fps: 10, qrbox: { width: 250, height: 150 }, rememberLastUsedCamera: true },
      false
    )
    scannerRef.current = scanner

    scanner.render(
      (decodedText) => {
        if (doneRef.current) return
        doneRef.current = true
        playScanSuccess()
        scanner.clear().catch(() => {})
        onScan(decodedText)
      },
      () => {} // ignore per-frame scan failures, they happen constantly while aiming
    )

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {})
      }
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 60, overflowY: 'auto' }}>
      <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Scan barcode</span>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
      </div>
      <div id={containerId} style={{ padding: 12 }} />
    </div>
  )
}
