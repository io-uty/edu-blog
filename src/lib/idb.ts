// 일러스트처럼 큰 이미지 데이터는 localStorage 대신 IndexedDB에 저장한다.
const DB = "bbolog";
const STORE = "blobs";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export const idbGet = (key: string) => tx<string | undefined>("readonly", (s) => s.get(key)).catch(() => undefined);
export const idbSet = (key: string, v: string) => tx("readwrite", (s) => s.put(v, key)).then(() => true).catch(() => false);
export const idbDel = (key: string) => tx("readwrite", (s) => s.delete(key)).catch(() => undefined);
