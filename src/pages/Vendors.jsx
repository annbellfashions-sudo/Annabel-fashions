import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { localGet, localSet } from '../lib/offlineStore'

const emptyForm = { name: '', contactPerson: '', phone: '', email: '', itemsSupplied: '' }

export default function Vendors() {
  const [vendors, setVendors] = useState([]); const [showForm, setShowForm] = useState(false); const [editingId, setEditingId] = useState(null); const [form, setForm] = useState(emptyForm); const [error, setError] = useState('')
  async function loadVendors() {
    if (!navigator.onLine) { setVendors((await localGet('vendors')) || []); return }
    const { data, error } = await supabase.from('vendors').select('*').order('created_at', { ascending: false })
    if (error) { setVendors((await localGet('vendors')) || []); return }
    setVendors(data || []); await localSet('vendors', data || [])
  }
  async function syncOfflineVendors() {
    if (!navigator.onLine) return
    const queue=(await localGet('offline_vendors'))||[]; if(!queue.length)return
    const remaining=[]
    for(const item of queue){try{if(item.operation==='insert'){const {error}=await supabase.from('vendors').insert(item.payload);if(error)throw error}else if(item.operation==='update'){const {error}=await supabase.from('vendors').update(item.payload).eq('id',item.id);if(error)throw error}else{const {error}=await supabase.from('vendors').delete().eq('id',item.id);if(error)throw error}}catch(_){remaining.push(item)}}
    await localSet('offline_vendors',remaining); if(!remaining.length)await loadVendors()
  }
  useEffect(()=>{loadVendors();const online=()=>syncOfflineVendors();window.addEventListener('online',online);if(navigator.onLine)syncOfflineVendors();return()=>window.removeEventListener('online',online)},[])
  function setField(key,value){setForm(f=>({...f,[key]:value}))}
  function startEdit(v){setEditingId(v.id);setForm({name:v.name,contactPerson:v.contact_person||'',phone:v.phone||'',email:v.email||'',itemsSupplied:v.items_supplied||''});setShowForm(true)}
  function cancelForm(){setShowForm(false);setEditingId(null);setForm(emptyForm);setError('')}
  async function handleSubmit(e){e.preventDefault();setError('');const payload={name:form.name,contact_person:form.contactPerson,phone:form.phone,email:form.email,items_supplied:form.itemsSupplied};try{if(!navigator.onLine){const id=editingId||crypto.randomUUID();const full={...payload,id,...(editingId?{}:{created_at:new Date().toISOString()})};const current=(await localGet('vendors'))||vendors;const next=editingId?current.map(v=>v.id===editingId?{...v,...full}:v):[full,...current];const q=(await localGet('offline_vendors'))||[];await localSet('vendors',next);await localSet('offline_vendors',[...q,{operation:editingId?'update':'insert',id,payload:full}]);setVendors(next);cancelForm();return}const {error}=editingId?await supabase.from('vendors').update(payload).eq('id',editingId):await supabase.from('vendors').insert(payload);if(error)throw error;cancelForm();loadVendors()}catch(err){setError(err.message)}}
  async function handleDelete(id){if(!window.confirm('Delete this vendor?'))return;if(!navigator.onLine){const next=vendors.filter(v=>v.id!==id);const q=(await localGet('offline_vendors'))||[];await localSet('vendors',next);await localSet('offline_vendors',[...q,{operation:'delete',id}]);setVendors(next);return}await supabase.from('vendors').delete().eq('id',id);loadVendors()}
  return <div className="content"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><h2 style={{margin:0}}>Vendors</h2><button className="btn-secondary" onClick={()=>showForm?cancelForm():setShowForm(true)}>{showForm?'Cancel':'+ Add vendor'}</button></div>
  {showForm&&<form onSubmit={handleSubmit} style={{marginBottom:20}}><div className="field"><label>Vendor / company name</label><input value={form.name} onChange={e=>setField('name',e.target.value)} required/></div><div className="field"><label>Contact person</label><input value={form.contactPerson} onChange={e=>setField('contactPerson',e.target.value)}/></div><div className="field"><label>Phone</label><input value={form.phone} onChange={e=>setField('phone',e.target.value)}/></div><div className="field"><label>Email</label><input type="email" value={form.email} onChange={e=>setField('email',e.target.value)}/></div><div className="field"><label>Materials/items supplied</label><input value={form.itemsSupplied} onChange={e=>setField('itemsSupplied',e.target.value)} placeholder="e.g. cotton fabric, buttons, thread"/></div>{error&&<p className="error-text">{error}</p>}<button className="btn-primary" type="submit">{editingId?'Update vendor':'Save vendor'}</button></form>}
  {vendors.map(v=><div className="product-card" key={v.id}><div className="product-info"><div className="name">{v.name}</div><div className="meta">{v.items_supplied}</div><div className="meta">{v.contact_person} {v.phone}</div></div><div className="product-actions"><button className="icon-btn" onClick={()=>startEdit(v)} title="Edit">✏️</button><button className="icon-btn" onClick={()=>handleDelete(v.id)} title="Delete">🗑️</button></div></div>)}
  {vendors.length===0&&!showForm&&<p style={{color:'#6b6357'}}>No vendors added yet.</p>}</div>
}
