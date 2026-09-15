// @ts-check
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { KV } from "../src/kv.js";

let sequence = 0;
/** @returns {string} */
function name() {
	sequence += 1;
	return `kv-${sequence}`;
}

describe("KV", () => {
	/** @type {ReturnType<typeof KV>[]} */
	const stores = [];
	afterEach(() => stores.splice(0).forEach((store) => store.close()));

	it("persists values and enforces insert/replace semantics", async () => {
		const store = KV(name());
		stores.push(store);
		await store.set("a", { count: 1 });
		await expect(store.set("a", { count: 2 })).rejects.toMatchObject({
			name: "KeyAlreadyExistsError",
		});
		expect(await store.get("a")).toEqual({ count: 1 });
		await store.replace("a", { count: 2 });
		expect(await store.get("a")).toEqual({ count: 2 });
		await expect(store.replace("missing", 1)).rejects.toMatchObject({ name: "KeyNotFoundError" });
	});

	it("yields inclusive ranges in key order", async () => {
		const store = KV(name());
		stores.push(store);
		await store.set("a", 1);
		await store.set("b", 2);
		await store.set("c", 3);
		expect(await store.getRange("a", "b").toArray()).toEqual([
			["a", 1],
			["b", 2],
		]);
		await store.remove("a");
		expect(await store.get("a")).toBeUndefined();
	});
});
