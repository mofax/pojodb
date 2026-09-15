// @ts-check
import { PojodbError } from "./errors.js";

/** @param {IDBRequest} request @returns {Promise<any>} */
export function requestResult(request) {
	return new Promise((resolve, reject) => {
		request.addEventListener("success", () => resolve(request.result), { once: true });
		request.addEventListener(
			"error",
			() => reject(request.error ?? new PojodbError("IndexedDB request failed.")),
			{ once: true },
		);
	});
}

/** @param {IDBTransaction} transaction @returns {Promise<void>} */
export function transactionDone(transaction) {
	return new Promise((resolve, reject) => {
		transaction.addEventListener("complete", () => resolve(), { once: true });
		transaction.addEventListener(
			"abort",
			() => reject(transaction.error ?? new PojodbError("IndexedDB transaction aborted.")),
			{ once: true },
		);
		transaction.addEventListener(
			"error",
			() => reject(transaction.error ?? new PojodbError("IndexedDB transaction failed.")),
			{ once: true },
		);
	});
}

/**
 * @param {string} name
 * @param {number} version
 * @param {(database: IDBDatabase, transaction: IDBTransaction, oldVersion: number) => void} upgrade
 * @returns {Promise<IDBDatabase>}
 */
export function openDatabase(name, version, upgrade) {
	if (!globalThis.indexedDB) {
		return Promise.reject(new PojodbError("IndexedDB is unavailable in this environment."));
	}

	return new Promise((resolve, reject) => {
		const request = globalThis.indexedDB.open(name, version);
		request.addEventListener("upgradeneeded", (event) => {
			try {
				if (!request.transaction)
					throw new PojodbError("IndexedDB did not provide an upgrade transaction.");
				upgrade(
					request.result,
					request.transaction,
					/** @type {IDBVersionChangeEvent} */ (event).oldVersion,
				);
			} catch (error) {
				request.transaction?.abort();
				reject(error);
			}
		});
		request.addEventListener("success", () => resolve(request.result), { once: true });
		request.addEventListener(
			"error",
			() => reject(request.error ?? new PojodbError("Could not open IndexedDB database.")),
			{ once: true },
		);
	});
}

/**
 * Materializes a cursor before returning. IndexedDB transactions close when an
 * async iterator yields control, so exposing a live cursor would be unsafe.
 * @param {IDBObjectStore | IDBIndex} source
 * @param {IDBKeyRange | null} range
 * @param {IDBCursorDirection} [direction]
 * @returns {Promise<Array<[IDBValidKey, any]>>}
 */
export async function cursorEntries(source, range, direction = "next") {
	/** @type {Array<[IDBValidKey, any]>} */
	const entries = [];
	const request = source.openCursor(range, direction);
	await new Promise((resolve, reject) => {
		request.addEventListener(
			"error",
			() => reject(request.error ?? new PojodbError("IndexedDB cursor failed.")),
			{ once: true },
		);
		request.addEventListener("success", () => {
			const cursor = request.result;
			if (!cursor) {
				resolve(undefined);
				return;
			}
			entries.push([cursor.primaryKey, cursor.value]);
			cursor.continue();
		});
	});
	return entries;
}

/** @returns {typeof IDBKeyRange} */
export function keyRangeFactory() {
	if (!globalThis.IDBKeyRange)
		throw new PojodbError("IDBKeyRange is unavailable in this environment.");
	return /** @type {typeof IDBKeyRange} */ (globalThis.IDBKeyRange);
}

/** @param {unknown} left @param {unknown} right */
export function compareKeys(left, right) {
	return globalThis.indexedDB.cmp(
		/** @type {IDBValidKey} */ (left),
		/** @type {IDBValidKey} */ (right),
	);
}
