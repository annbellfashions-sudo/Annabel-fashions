import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { localGet, localSet } from '../lib/offlineStore'
import OrderInvoice from './OrderInvoice'

export default function Orders() {
  const [orders,setOrders]=useState([]);const [vendors,setVendors]=useState([]);const [products,setProducts]=useState([]);const [showForm,setShowForm]=useState(false);const [editingId,setEditingId]=useState(null);const [vendorId,setVendorId]=useState('');const [cart,setCart]=useState([]);const [viewing,setViewing]=useState(null);const [saving,setSaving]=useState(false);const [error,setError]=useState('')
  async function loadAll(){
    if(!navigator.onLine){setOrders((await localGet('orders'))||[]);setVendors((await localGet('vendors'))||[]);setProducts((await localGet('products'))||[]);return}
    const [o,v,p]=await Promise.all([supabase.from('purchase_orders').select('*').order('created_at',{ascending:false}),supabase.from('vendors').select('*').order('name'),supabase.from('products').select('*').order('name')])
    if(!o.error){setOrders(o.data||[]);await localSet('orders',o.data||[])}else setOrders((await localGet('orders'))||[])
    if(!v.error){setVendors(v.data||[]);await localSet('vendors',v.data||[])}else setVendors((await localGet('vendors'))||[])
    if(!p.error){setProducts(p.data||[]);await localSet('products',p.data||[])}else setProducts((await localGet('products'))||[])
  }
  async function getItems(orderId){
    if(!navigator.onLine){const all=(await localGet('order_items'))||{};return all[orderId]||[]}
    const {data,error}=await supabase.from('purchase_order_items').select('*').eq('order_id',orderId);if(!error){const all=(await localGet('order_items'))||{};all[orderId]=data||[];await localSet('order_items',all);return data||[]}return []
  }
  async function syncOfflineOrders(){
    if(!navigator.onLine)return;const q=(await localGet('offline_orders'))||[];if(!q.length)return;const rem=[]
    for(const item of q){try{
      if(item.operation==='delete'){const {error}=await supabase.from('purchase_orders').delete().eq('id',item.id);if(error)throw error}
      else if(item.operation==='insert'){const {error}=await supabase.from('purchase_orders').insert(item.order);if(error)throw error;const {error:ie}=await supabase.from('purchase_order_items').insert(item.items);if(ie)throw ie}
      else if(item.operation==='update'){const {error}=await supabase.from('purchase_orders').update(item.order).eq('id',item.id);if(error)throw error;const {error:de}=await supabase.from('purchase_order_items').delete().eq('order_id',item.id);if(de)throw de;const {error:ie}=await supabase.from('purchase_order_items').insert(item.items);if(ie)throw ie}
    }catch(_){rem.push(item)}}
    await localSet('offline_orders',rem);if(!rem.length)await loadAll()
  }
  useEffect(()=>{loadAll();const online=()=>syncOfflineOrders();window.addEventListener('online',online);if(navigator.onLine)syncOfflineOrders();return()=>window.removeEventListener('online',online)},[])
  function addToCart(product){setCart(prev=>{const existing=prev.find(c=>c.id===product.id);if(existing)return prev.map(c=>c.id===product.id?{...c,quantity:c.quantity+1}:c);return[...prev,{id:product.id,name:product.name,quantity:1,unit_cost:product.cost_price||0}]})}
  function updateCartItem(id,field,value){setCart(prev=>prev.map(c=>c.id===id?{...c,[field]:value}:c))}
  function removeFromCart(id){setCart(prev=>prev.filter(c=>c.id!==id))}
  function cancelForm(){setShowForm(false);setEditingId(null);setVendorId('');setCart([]);setError('')}
  async function startEdit(order){const items=await getItems(order.id);setEditingId(order.id);setVendorId(order.vendor_id||'');setCart(items.map(it=>({id:it.product_id,name:it.product_name,quantity:it.quantity,unit_cost:it.unit_cost})));setShowForm(true)}
  async function handleDelete(id){if(!window.confirm('Delete this order?'))return;if(!navigator.onLine){const next=orders.filter(o=>o.id!==id);const q=(await localGet('offline_orders'))||[];const all=(await localGet('order_items'))||{};delete all[id];await localSet('orders',next);await localSet('order_items',all);await localSet('offline_orders',[...q,{operation:'delete',id}]);setOrders(next);return}await supabase.from('purchase_orders').delete().eq('id',id);loadAll()}
  const total=cart.reduce((sum,c)=>sum+Number(c.unit_cost)*Number(c.quantity),0)
  async function saveOrder(){
    if(!vendorId||cart.length===0){setError('Pick a vendor and at least one product');return}setSaving(true);setError('')
    try{const vendor=vendors.find(v=>v.id===vendorId);const id=editingId||crypto.randomUUID();const order={id,vendor_id:vendorId,vendor_name:vendor?.name||'',total,status:'sent',created_at:editingId?(orders.find(o=>o.id===editingId)?.created_at||new Date().toISOString()):new Date().toISOString()};const items=cart.map(c=>({id:crypto.randomUUID(),order_id:id,product_id:c.id,product_name:c.name,quantity:Number(c.quantity),unit_cost:Number(c.unit_cost),subtotal:Number(c.unit_cost)*Number(c.quantity)}));
      if(!navigator.onLine){const current=(await localGet('orders'))||orders;const next=editingId?current.map(o=>o.id===id?order:o):[order,...current];const q=(await localGet('offline_orders'))||[];const all=(await localGet('order_items'))||{};all[id]=items;await localSet('orders',next);await localSet('order_items',all);await localSet('offline_orders',[...q,{operation:editingId?'update':'insert',id,order:{vendor_id:vendorId,vendor_name:vendor?.name||'',total,status:'sent',created_at:order.created_at,id},items}]);setOrders(next);setViewing({order,items,vendor});cancelForm();return}
      if(editingId){const {error:ue}=await supabase.from('purchase_orders').update({vendor_id:vendorId,vendor_name:vendor?.name||'',total}).eq('id',id);if(ue)throw ue;const {error:de}=await supabase.from('purchase_order_items').delete().eq('order_id',id);if(de)throw de}else{const {error:oe}=await supabase.from('purchase_orders').insert({id,vendor_id:vendorId,vendor_name:vendor?.name||'',total,status:'sent'});if(oe)throw oe}
      const {error:ie}=await supabase.from('purchase_order_items').insert(items);if(ie)throw ie;setViewing({order,items,vendor});cancelForm();loadAll()
    }catch(err){setError(err.message)}finally{setSaving(false)}
  }
  async function openExistingOrder(order){const items=await getItems(order.id);const vendor=vendors.find(v=>v.id===order.vendor_id);setViewing({order,items,vendor})}
  return <div className="content">{viewing&&<OrderInvoice order={viewing.order} items={viewing.items} vendor={viewing.vendor} onClose={()=>setViewing(null)}/>}<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><h2 style={{margin:0}}>Orders</h2><button className="btn-secondary" onClick={()=>showForm?cancelForm():setShowForm(true)}>{showForm?'Cancel':'+ New order'}</button></div>
  {showForm&&<div style={{marginBottom:20}}><div className="field"><label>Vendor</label><select value={vendorId} onChange={e=>setVendorId(e.target.value)}><option value="">Select a vendor</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></div><h3>Pick products</h3>{products.map(p=><div className="product-card" key={p.id} onClick={()=>addToCart(p)} style={{cursor:'pointer'}}><div className="product-info"><div className="name">{p.name}</div><div className="meta">Current cost: KES {p.cost_price||0} • Stock: {p.stock_quantity}</div></div></div>)}{cart.length>0&&<div style={{marginTop:16}}><h3>Order items</h3>{cart.map(c=><div key={c.id} style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}><span style={{flex:1,fontSize:14}}>{c.name}</span><input type="number" value={c.quantity} onChange={e=>updateCartItem(c.id,'quantity',parseInt(e.target.value||'1',10))} style={{width:60,padding:6,border:'1px solid #d9d3c7',borderRadius:6}}/><input type="number" step="0.01" value={c.unit_cost} onChange={e=>updateCartItem(c.id,'unit_cost',e.target.value)} style={{width:80,padding:6,border:'1px solid #d9d3c7',borderRadius:6}}/><a href="#" onClick={e=>{e.preventDefault();removeFromCart(c.id)}} style={{fontSize:12}}>remove</a></div>)}<div className="total-row"><span>Total</span><span>KES {total.toFixed(2)}</span></div>{error&&<p className="error-text">{error}</p>}<button className="btn-primary" onClick={saveOrder} disabled={saving}>{saving?'Saving...':editingId?'Update & prepare invoice':'Save & prepare invoice'}</button></div>}</div>}
  <h3>Past orders</h3>{orders.length===0&&<p style={{color:'#6b6357'}}>No orders yet.</p>}{orders.map(o=><div className="product-card" key={o.id}><div className="product-info" onClick={()=>openExistingOrder(o)} style={{cursor:'pointer'}}><div className="name">{o.vendor_name}</div><div className="meta">{new Date(o.created_at).toLocaleDateString()} • KES {Number(o.total).toFixed(2)} • {o.status}</div></div><div className="product-actions"><button className="icon-btn" onClick={()=>startEdit(o)} title="Edit">✏️</button><button className="icon-btn" onClick={()=>handleDelete(o.id)} title="Delete">🗑️</button></div></div>)}</div>
}
