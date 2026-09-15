// @ts-check
import { QueryError } from "../core/errors.js";

/** @typedef {'=' | '<' | '<=' | '>' | '>='} ComparisonOperator */
/** @typedef {{ kind: 'comparison', field: string, operator: ComparisonOperator, value: IDBValidKey }} Comparison */
/** @typedef {{ kind: 'and' | 'or', expressions: readonly Expression[] }} Group */
/** @typedef {Comparison | Group} Expression */
/** @typedef {{ field: string, direction: 'asc' | 'desc' }} OrderBy */

/** @param {string} field @param {ComparisonOperator} operator @param {IDBValidKey} value @returns {Comparison} */
export function COMP(field, operator, value) {
	if (typeof field !== "string" || field.length === 0)
		throw new QueryError("COMP requires a field name.");
	if (!["=", "<", "<=", ">", ">="].includes(operator))
		throw new QueryError(`Unsupported comparison operator: ${operator}.`);
	return Object.freeze({ kind: "comparison", field, operator, value });
}

/** @param {...Expression} expressions @returns {Group} */
export function AND(...expressions) {
	return group("and", expressions);
}

/** @param {...Expression} expressions @returns {Group} */
export function OR(...expressions) {
	return group("or", expressions);
}

/** @param {string} field @param {'asc' | 'desc'} [direction] @returns {OrderBy} */
export function ORDER_BY(field, direction = "asc") {
	if (typeof field !== "string" || field.length === 0)
		throw new QueryError("ORDER_BY requires a field name.");
	if (direction !== "asc" && direction !== "desc")
		throw new QueryError("ORDER_BY direction must be asc or desc.");
	return Object.freeze({ field, direction });
}

/** @param {'and' | 'or'} kind @param {Expression[]} expressions @returns {Group} */
function group(kind, expressions) {
	if (expressions.length === 0)
		throw new QueryError(`${kind.toUpperCase()} requires at least one expression.`);
	for (const expression of expressions) {
		if (
			!expression ||
			(expression.kind !== "comparison" && expression.kind !== "and" && expression.kind !== "or")
		) {
			throw new QueryError(`${kind.toUpperCase()} only accepts query expressions.`);
		}
	}
	return Object.freeze({ kind, expressions: Object.freeze([...expressions]) });
}
