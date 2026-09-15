// @ts-check
import { compareKeys, cursorEntries, keyRangeFactory, transactionDone } from "../core/idb.js";
import { QueryError } from "../core/errors.js";

/** @typedef {import('../query/expressions.js').Expression} Expression */
/** @typedef {import('../query/expressions.js').Comparison} Comparison */
/** @typedef {import('../query/expressions.js').OrderBy} OrderBy */

/** @param {IDBObjectStore} store @param {Expression | undefined} expression @param {OrderBy | undefined} orderBy */
export async function executeQuery(store, expression, orderBy) {
	if (expression) validateIndexes(store, comparisons(expression));
	if (orderBy && orderBy.field !== store.keyPath && !store.indexNames.contains(orderBy.field)) {
		throw new QueryError(`ORDER_BY field ${orderBy.field} is not indexed on table ${store.name}.`);
	}

	/** @type {Array<[IDBValidKey, any]>} */
	let entries;
	if (!expression) {
		entries = await cursorEntries(store, null);
	} else {
		const branches = dnf(expression);
		if (branches.length > 64) throw new QueryError("Query expands to more than 64 OR branches.");
		/** @type {Map<IDBValidKey, any>} */
		const rows = new Map();
		for (const branch of branches) {
			const driving = branch[0];
			const source = sourceFor(store, driving.field);
			const found = await cursorEntries(source, rangeFor(driving));
			for (const [primaryKey, value] of found) {
				if (branch.every((comparison) => matches(value, comparison))) rows.set(primaryKey, value);
			}
		}
		entries = [...rows.entries()];
	}

	if (orderBy) {
		entries.sort(([leftKey, left], [rightKey, right]) => {
			const result = compareKeys(
				valueAt(left, leftKey, orderBy.field, store.keyPath),
				valueAt(right, rightKey, orderBy.field, store.keyPath),
			);
			return orderBy.direction === "asc" ? result : -result;
		});
	}
	return entries.map(([, value]) => value);
}

/** @param {IDBObjectStore} store @param {Comparison[]} comparisons */
function validateIndexes(store, comparisons) {
	for (const comparison of comparisons) {
		if (comparison.field !== store.keyPath && !store.indexNames.contains(comparison.field)) {
			throw new QueryError(
				`Query field ${comparison.field} is not indexed on table ${store.name}.`,
			);
		}
	}
}

/** @param {Expression} expression @returns {Comparison[][]} */
function dnf(expression) {
	if (expression.kind === "comparison") return [[expression]];
	const parts = expression.expressions.map(dnf);
	if (expression.kind === "or") return parts.flat();
	return parts.reduce((left, right) =>
		left.flatMap((leftBranch) => right.map((rightBranch) => [...leftBranch, ...rightBranch])),
	);
}

/** @param {Expression} expression @returns {Comparison[]} */
function comparisons(expression) {
	return expression.kind === "comparison"
		? [expression]
		: expression.expressions.flatMap(comparisons);
}

/** @param {IDBObjectStore} store @param {string} field */
function sourceFor(store, field) {
	return field === store.keyPath ? store : store.index(field);
}

/** @param {Comparison} comparison */
function rangeFor(comparison) {
	const range = keyRangeFactory();
	switch (comparison.operator) {
		case "=":
			return range.only(comparison.value);
		case "<":
			return range.upperBound(comparison.value, true);
		case "<=":
			return range.upperBound(comparison.value);
		case ">":
			return range.lowerBound(comparison.value, true);
		case ">=":
			return range.lowerBound(comparison.value);
	}
}

/** @param {any} row @param {Comparison} comparison */
function matches(row, comparison) {
	const result = compareKeys(row[comparison.field], comparison.value);
	switch (comparison.operator) {
		case "=":
			return result === 0;
		case "<":
			return result < 0;
		case "<=":
			return result <= 0;
		case ">":
			return result > 0;
		case ">=":
			return result >= 0;
	}
}

/** @param {any} row @param {IDBValidKey} primaryKey @param {string} field @param {string | string[] | null} keyPath */
function valueAt(row, primaryKey, field, keyPath) {
	return typeof keyPath === "string" && field === keyPath ? primaryKey : row[field];
}

export { transactionDone };
