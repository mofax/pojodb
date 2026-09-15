// @ts-check
import { KeyAlreadyExistsError, KeyNotFoundError, SchemaError } from "./core/errors.js";
import { openDatabase, requestResult, transactionDone } from "./core/idb.js";
import { QueryResult } from "./core/query-result.js";
import { executeQuery } from "./database/query.js";
import { createTable } from "./database/schema.js";
import {
	AND as makeAnd,
	COMP as makeComparison,
	OR as makeOr,
	ORDER_BY as makeOrderBy,
} from "./query/expressions.js";

/** @typedef {{ primaryKey?: boolean, index?: boolean | { unique?: boolean } }} FieldDescriptor */
/** @typedef {{ fields: Record<string, FieldDescriptor> }} TableSchema */
/** @typedef {'=' | '<' | '<=' | '>' | '>='} ComparisonOperator */
/** @typedef {{ kind: 'comparison', field: string, operator: ComparisonOperator, value: IDBValidKey }} Comparison */
/** @typedef {{ kind: 'and' | 'or', expressions: readonly Expression[] }} Group */
/** @typedef {Comparison | Group} Expression */
/** @typedef {{ field: string, direction: 'asc' | 'desc' }} OrderBy */
/** @typedef {AsyncIterable<Record<string, any>> & { toArray: () => Promise<Record<string, any>[]> }} RecordQueryResult */

/**
 * @typedef {object} MigrationContext
 * @property {(name: string, schema: TableSchema) => void} createTable
 * @property {(table: string, field: string, options?: { unique?: boolean }) => void} addIndex
 */

/**
 * @typedef {object} DatabaseOptions
 * @property {string} name
 * @property {number} version
 * @property {(context: MigrationContext, oldVersion: number) => void} migrate
 */

/** @typedef {{ where?: Expression, orderBy?: OrderBy }} QueryOptions */
/** @typedef {{ open: () => Promise<DatabaseInstance>, table: (name: string) => Table, close: () => void }} DatabaseInstance */

/**
 * Creates a versioned IndexedDB database.
 * @param {DatabaseOptions} options
 * @returns {DatabaseInstance}
 */
export function Database(options) {
	if (!options || typeof options.name !== "string" || options.name.length === 0)
		throw new TypeError("Database requires a non-empty name.");
	if (!Number.isInteger(options.version) || options.version < 1)
		throw new TypeError("Database version must be a positive integer.");
	if (typeof options.migrate !== "function")
		throw new TypeError("Database requires a migrate(context, oldVersion) function.");

	/** @type {Promise<IDBDatabase> | null} */
	let connection = null;
	/** @type {DatabaseInstance} */
	const api = {
		open: async () => {
			if (!connection) {
				connection = openDatabase(
					options.name,
					options.version,
					(database, transaction, oldVersion) => {
						/** @type {MigrationContext} */
						const context = {
							createTable: (name, schema) => createTable(database, name, schema),
							addIndex: (table, field, indexOptions = {}) => {
								const store = transaction.objectStore(table);
								if (store.indexNames.contains(field))
									throw new SchemaError(`Index ${field} already exists on ${table}.`);
								store.createIndex(field, field, { unique: indexOptions.unique === true });
							},
						};
						options.migrate(context, oldVersion);
					},
				);
			}
			await connection;
			return api;
		},
		table: (name) => {
			if (typeof name !== "string" || name.length === 0)
				throw new TypeError("table(name) requires a table name.");
			return new Table(name, () => {
				if (!connection) throw new SchemaError("Call await db.open() before accessing a table.");
				return connection;
			});
		},
		close: () => {
			void connection?.then((database) => database.close());
		},
	};
	return api;
}

/** A handle for records in one declared IndexedDB object store. */
export class Table {
	/** @param {string} name @param {() => Promise<IDBDatabase>} database */
	constructor(name, database) {
		this.name = name;
		this.database = database;
	}

	/** @param {IDBValidKey} key */
	async get(key) {
		const transaction = (await this.database()).transaction(this.name, "readonly");
		const value = await requestResult(transaction.objectStore(this.name).get(key));
		await transactionDone(transaction);
		return value;
	}

	/** @param {Record<string, any>} record */
	async insert(record) {
		const transaction = (await this.database()).transaction(this.name, "readwrite");
		const store = transaction.objectStore(this.name);
		try {
			await requestResult(store.add(record));
			await transactionDone(transaction);
		} catch (error) {
			if (error instanceof DOMException && error.name === "ConstraintError")
				throw new KeyAlreadyExistsError(primaryKeyFor(store, record));
			throw error;
		}
	}

	/** @param {Record<string, any>} record */
	async replace(record) {
		const transaction = (await this.database()).transaction(this.name, "readwrite");
		const store = transaction.objectStore(this.name);
		const key = primaryKeyFor(store, record);
		if ((await requestResult(store.count(key))) === 0) {
			transaction.abort();
			throw new KeyNotFoundError(key);
		}
		await requestResult(store.put(record));
		await transactionDone(transaction);
	}

	/** @param {Record<string, any>} record */
	async upsert(record) {
		const transaction = (await this.database()).transaction(this.name, "readwrite");
		await requestResult(transaction.objectStore(this.name).put(record));
		await transactionDone(transaction);
	}

	/** @param {IDBValidKey} key */
	async remove(key) {
		const transaction = (await this.database()).transaction(this.name, "readwrite");
		await requestResult(transaction.objectStore(this.name).delete(key));
		await transactionDone(transaction);
	}

	async clear() {
		const transaction = (await this.database()).transaction(this.name, "readwrite");
		await requestResult(transaction.objectStore(this.name).clear());
		await transactionDone(transaction);
	}

	/** @param {QueryOptions} [options] @returns {RecordQueryResult} */
	query(options = {}) {
		return new QueryResult(async () => {
			const transaction = (await this.database()).transaction(this.name, "readonly");
			const records = await executeQuery(
				transaction.objectStore(this.name),
				options.where,
				options.orderBy,
			);
			await transactionDone(transaction);
			return records;
		});
	}
}

/** @param {string} field @param {ComparisonOperator} operator @param {IDBValidKey} value @returns {Comparison} */
export function COMP(field, operator, value) {
	return /** @type {Comparison} */ (makeComparison(field, operator, value));
}

/** @param {...Expression} expressions @returns {Group} */
export function AND(...expressions) {
	return /** @type {Group} */ (makeAnd(...expressions));
}

/** @param {...Expression} expressions @returns {Group} */
export function OR(...expressions) {
	return /** @type {Group} */ (makeOr(...expressions));
}

/** @param {string} field @param {'asc' | 'desc'} [direction] @returns {OrderBy} */
export function ORDER_BY(field, direction) {
	return /** @type {OrderBy} */ (makeOrderBy(field, direction));
}

/** @param {IDBObjectStore} store @param {Record<string, any>} record */
function primaryKeyFor(store, record) {
	if (typeof store.keyPath !== "string")
		throw new SchemaError(`Table ${store.name} must have a string primary key.`);
	return /** @type {IDBValidKey} */ (record[store.keyPath]);
}
