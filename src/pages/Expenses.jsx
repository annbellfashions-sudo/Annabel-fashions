import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Transport', 'Licenses', 'Supplies', 'Other']

export default function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Other')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState('')

  async function load() {
    const { data } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false })
    setExpenses(data || [])
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.from('expenses').insert({
      description,
      category,
      amount: parseFloat(amount),
      expense_date: expenseDate,
    })
    if (error) {
      setError(error.message)
      return
    }
    setDescription(''); setAmount('')
    setShowForm(false)
    load()
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', id)
    load()
  }

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0)

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Expenses</h2>
        <button className="btn-secondary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add expense'}
        </button>
      </div>

      <div style={{ background: '#f3efe4', borderRadius: 10, padding: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#6b6357' }}>Total recorded</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#123524' }}>KES {total.toFixed(2)}</div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
          <div className="field">
            <label>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} required />
          </div>
          <div className="field">
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Amount (KES)</label>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn-primary" type="submit">Save expense</button>
        </form>
      )}

      {expenses.map((e) => (
        <div className="product-card" key={e.id}>
          <div className="product-info">
            <div className="name">{e.description}</div>
            <div className="meta">{e.category} • {e.expense_date} • KES {Number(e.amount).toFixed(2)}</div>
          </div>
          <div className="product-actions">
            <button className="icon-btn" onClick={() => handleDelete(e.id)} title="Delete">🗑️</button>
          </div>
        </div>
      ))}
      {expenses.length === 0 && !showForm && <p style={{ color: '#6b6357' }}>No expenses recorded yet.</p>}
    </div>
  )
}
