const DB_NAME = "felt";
const DB_VERSION = 1;

const STORE_DEFINITIONS = {
  heroes: {
    keyPath: "id",
    indexes: [],
  },
  hands: {
    keyPath: "id",
    indexes: [
      { name: "heroId", keyPath: "heroId" },
      { name: "ts", keyPath: "ts" },
    ],
  },
};

let dbPromise = null;
const memoryDatabases = new Map();

export async function openDb() {
  const indexedDb = indexedDbFactory();

  if (!indexedDb) {
    return memoryDb(DB_NAME);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDb.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onupgradeneeded = (event) => {
        configureDatabase(request.result, event.target.transaction);
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  return dbPromise;
}

export async function get(storeName, key) {
  const db = await openDb();

  if (db.memory) {
    return clone(db.stores[storeName]?.get(key));
  }

  return requestValue(db.transaction(storeName, "readonly").objectStore(storeName).get(key));
}

export async function put(storeName, value) {
  const db = await openDb();
  const record = clone(value);

  if (db.memory) {
    db.stores[storeName].set(record.id, record);
    return record;
  }

  await requestValue(db.transaction(storeName, "readwrite").objectStore(storeName).put(record));
  return record;
}

export async function deleteRecord(storeName, key) {
  const db = await openDb();

  if (db.memory) {
    return db.stores[storeName]?.delete(key) || false;
  }

  await requestValue(db.transaction(storeName, "readwrite").objectStore(storeName).delete(key));
  return true;
}

export async function getAll(storeName) {
  const db = await openDb();

  if (db.memory) {
    return [...db.stores[storeName].values()].map(clone);
  }

  return requestValue(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
}

export async function getAllByIndex(storeName, indexName, value) {
  const db = await openDb();

  if (db.memory) {
    return [...db.stores[storeName].values()]
      .filter((record) => record?.[indexName] === value)
      .map(clone);
  }

  const index = db.transaction(storeName, "readonly").objectStore(storeName).index(indexName);
  return requestValue(index.getAll(value));
}

export async function deleteByIndex(storeName, indexName, value) {
  const records = await getAllByIndex(storeName, indexName, value);
  await Promise.all(records.map((record) => deleteRecord(storeName, record.id)));
  return records.length;
}

export function resetMemoryDb() {
  memoryDatabases.delete(DB_NAME);
}

function configureDatabase(db, transaction) {
  Object.entries(STORE_DEFINITIONS).forEach(([storeName, definition]) => {
    const store = db.objectStoreNames.contains(storeName)
      ? transaction.objectStore(storeName)
      : db.createObjectStore(storeName, { keyPath: definition.keyPath });

    definition.indexes.forEach((index) => {
      if (!store.indexNames.contains(index.name)) {
        store.createIndex(index.name, index.keyPath, { unique: false });
      }
    });
  });
}

function indexedDbFactory() {
  try {
    return globalThis.indexedDB || null;
  } catch {
    return null;
  }
}

function memoryDb(name) {
  if (!memoryDatabases.has(name)) {
    memoryDatabases.set(name, {
      memory: true,
      stores: Object.fromEntries(
        Object.keys(STORE_DEFINITIONS).map((storeName) => [storeName, new Map()]),
      ),
    });
  }

  return memoryDatabases.get(name);
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function clone(value) {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}
