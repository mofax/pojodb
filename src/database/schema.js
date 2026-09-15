// @ts-check
import { SchemaError } from "../core/errors.js";

/** @typedef {{ primaryKey?: boolean, index?: boolean | { unique?: boolean } }} FieldDescriptor */
/** @typedef {{ fields: Record<string, FieldDescriptor> }} TableSchema */

/** @param {IDBDatabase} database @param {string} name @param {TableSchema} schema */
export function createTable(database, name, schema) {
	if (database.objectStoreNames.contains(name))
		throw new SchemaError(`Table ${name} already exists.`);
	if (!schema || !schema.fields)
		throw new SchemaError(`Table ${name} requires a fields descriptor.`);
	const entries = Object.entries(schema.fields);
	const primaryKeys = entries.filter(([, descriptor]) => descriptor.primaryKey === true);
	if (primaryKeys.length !== 1)
		throw new SchemaError(`Table ${name} must declare exactly one primaryKey field.`);
	const [primaryKey] = primaryKeys[0];
	const store = database.createObjectStore(name, { keyPath: primaryKey });
	for (const [field, descriptor] of entries) {
		if (!descriptor.index) continue;
		const options =
			typeof descriptor.index === "object"
				? { unique: descriptor.index.unique === true }
				: undefined;
		store.createIndex(field, field, options);
	}
}
