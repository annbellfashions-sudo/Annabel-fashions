const DB_NAME = 'annbell-fashions-local';
const DB_VERSION = 2;
const DATA_STORE = 'app_data';
const QUEUE_STORE = 'sync_queue';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DATA_STORE)) db.createObjectStore(DATA_STORE);
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function localGet(key) {
  if (!('indexedDB' in window)) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_STORE, 'readonly');
    const request = tx.objectStore(DATA_STORE).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function localSet(key, value) {
  if (!('indexedDB' in window)) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_STORE, 'readwrite');
    tx.objectStore(DATA_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function localDelete(key) {
  if (!('indexedDB' in window)) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_STORE, 'readwrite');
    tx.objectStore(DATA_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cacheTable(table, rows) {
  await localSet(`table:${table}`, rows || []);
}

export async function getCachedTable(table) {
  return (await localGet(`table:${table}`)) || [];
}

export async function addToSyncQueue(operation) {
  const db = await openDb();
  const item = { id: crypto.randomUUID(), created_at: Date.now(), ...operation };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).put(item);
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueue() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const request = tx.objectStore(QUEUE_STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function removeQueueItem(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingSyncCount() {
  try { return (await getQueue()).length; } catch { return 0; }
}

export async function flushSyncQueue(supabase) {
  if (!navigator.onLine) return { synced: 0, remaining: await getPendingSyncCount() };
  const queue = await getQueue();
  let synced = 0;
  for (const item of queue.sort((a, b) => a.created_at - b.created_at)) {
    try {
      let result;
      if (item.type === 'insert') result = await supabase.from(item.table).insert(item.row);
      else if (item.type === 'update') result = await supabase.from(item.table).update(item.changes).eq('id', item.id_value);
      else if (item.type === 'delete') result = await supabase.from(item.table).delete().eq('id', item.id_value);
      if (result?.error) throw result.error;
      await removeQueueItem(item.id);
      synced++;
    } catch (error) {
      console.warn('Offline sync paused:', error.message || error);
      break;
    }
  }
  return { synced, remaining: await getPendingSyncCount() };
}

export async function queueInsert(supabase, table, row) {
  if (navigator.onLine) {
    const result = await supabase.from(table).insert(row).select().single();
    if (!result.error) return result;
  }
  await addToSyncQueue({ type: 'insert', table, row });
  return { data: row, error: null, offline: true };
}

export async function syncNow(supabase) {
  return flushSyncQueue(supabase);
}
