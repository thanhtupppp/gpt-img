const DATABASE_NAME = "piecs-library";
const DATABASE_VERSION = 2;

let databasePromise: Promise<IDBDatabase> | undefined;

export function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("templates")) {
        database.createObjectStore("templates", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("favorites")) {
        database.createObjectStore("favorites", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error("Unable to open PIECS database."));
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error("PIECS database upgrade is blocked by another open tab."));
    };
  });
  return databasePromise;
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

export async function closeDatabaseForTests(): Promise<void> {
  if (!databasePromise) return;
  const database = await databasePromise;
  database.close();
  databasePromise = undefined;
}
