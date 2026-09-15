// @ts-check

/** @template T */
export class QueryResult {
	/** @param {() => Promise<T[]>} load */
	constructor(load) {
		this.load = load;
	}

	/** @returns {Promise<T[]>} */
	async toArray() {
		return this.load();
	}

	/** @returns {AsyncGenerator<T, void, undefined>} */
	async *[Symbol.asyncIterator]() {
		for (const value of await this.load()) yield value;
	}
}
