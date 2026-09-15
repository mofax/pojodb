// @ts-check

/** Base error for Pojodb failures. */
export class PojodbError extends Error {
	/** @param {string} message */
	constructor(message) {
		super(message);
		this.name = "PojodbError";
	}
}

/** Raised when an insert is attempted for an existing key. */
export class KeyAlreadyExistsError extends PojodbError {
	/** @param {IDBValidKey} key */
	constructor(key) {
		super(`A value already exists for key ${JSON.stringify(key)}.`);
		this.name = "KeyAlreadyExistsError";
	}
}

/** Raised when an operation requires an existing key or row. */
export class KeyNotFoundError extends PojodbError {
	/** @param {IDBValidKey} key */
	constructor(key) {
		super(`No value exists for key ${JSON.stringify(key)}.`);
		this.name = "KeyNotFoundError";
	}
}

/** Raised when a declared schema or query cannot be represented by IndexedDB. */
export class SchemaError extends PojodbError {
	/** @param {string} message */
	constructor(message) {
		super(message);
		this.name = "SchemaError";
	}
}

/** Raised when a query expression violates the supported protocol. */
export class QueryError extends PojodbError {
	/** @param {string} message */
	constructor(message) {
		super(message);
		this.name = "QueryError";
	}
}
