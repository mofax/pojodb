// @ts-check
import { KeyAlreadyExistsError, KeyNotFoundError } from "./core/errors.js";
import {
	cursorEntries,
	keyRangeFactory,
	openDatabase,
	requestResult,
	transactionDone,
} from "./core/idb.js";
import { QueryResult } from "./core/query-result.js";

const STORE = "entries";

/** @typedef {AsyncIterable<[IDBValidKey, any]> & { toArray: () => Promise<Array<[IDBValidKey, any]>> }} EntryQueryResult */

/**
 * @typedef {object} KeyValueStore
 * @property {(key: IDBValidKey) => Promise<any>} get
 * @property {(key: IDBValidKey, value: any) => Promise<void>} set
 * @property {(key: IDBValidKey, value: any) => Promise<void>} replace
 * @property {(key: IDBValidKey) => Promise<void>} remove
 * @property {() => Promise<void>} clear
 * @property {(lower: IDBValidKey, upper: IDBValidKey) => EntryQueryResult} getRange
 * @property {() => void} close
 */

/**
 * Creates a named IndexedDB key-value store.
 * @param {string} name
 * @returns {KeyValueStore}
 */
export function KV(name) {
	if (typeof name !== "string" || name.length === 0)
		throw new TypeError("KV(name) requires a non-empty database name.");
	const database = openDatabase(name, 1, (db) => {
		if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
	});

	return {
		async get(key) {
			const db = await database;
			const transaction = db.transaction(STORE, "readonly");
			const result = await requestResult(transaction.objectStore(STORE).get(key));
			await transactionDone(transaction);
			return result;
		},
		async set(key, value) {
			const db = await database;
			const transaction = db.transaction(STORE, "readwrite");
			try {
				await requestResult(transaction.objectStore(STORE).add(value, key));
				await transactionDone(transaction);
			} catch (error) {
				if (error instanceof DOMException && error.name === "ConstraintError")
					throw new KeyAlreadyExistsError(key);
				throw error;
			}
		},
		async replace(key, value) {
			const db = await database;
			const transaction = db.transaction(STORE, "readwrite");
			const store = transaction.objectStore(STORE);
			const count = await requestResult(store.count(key));
			if (count === 0) {
				transaction.abort();
				throw new KeyNotFoundError(key);
			}
			await requestResult(store.put(value, key));
			await transactionDone(transaction);
		},
		async remove(key) {
			const db = await database;
			const transaction = db.transaction(STORE, "readwrite");
			await requestResult(transaction.objectStore(STORE).delete(key));
			await transactionDone(transaction);
		},
		async clear() {
			const db = await database;
			const transaction = db.transaction(STORE, "readwrite");
			await requestResult(transaction.objectStore(STORE).clear());
			await transactionDone(transaction);
		},
		getRange(lower, upper) {
			return new QueryResult(async () => {
				const db = await database;
				const transaction = db.transaction(STORE, "readonly");
				const entries = await cursorEntries(
					transaction.objectStore(STORE),
					keyRangeFactory().bound(lower, upper),
				);
				await transactionDone(transaction);
				return entries;
			});
		},
		close() {
			void database.then((db) => db.close());
		},
	};
}
