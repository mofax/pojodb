// @ts-check
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { AND, COMP, Database, ORDER_BY, OR } from "../src/database.js";

let sequence = 0;
/** @returns {string} */
function name() {
	sequence += 1;
	return `database-${sequence}`;
}

/** @returns {ReturnType<typeof Database>} */
function createDatabase(version = 1) {
	return Database({
		name: name(),
		version,
		migrate(context, oldVersion) {
			if (oldVersion === 0) {
				context.createTable("tasks", {
					fields: {
						id: { primaryKey: true },
						status: { index: true },
						priority: { index: true },
						createdAt: { index: true },
					},
				});
			}
		},
	});
}

describe("Database and Table", () => {
	/** @type {ReturnType<typeof Database>[]} */
	const databases = [];
	afterEach(() => databases.splice(0).forEach((database) => database.close()));

	it("performs CRUD operations with explicit duplicate behavior", async () => {
		const database = createDatabase();
		databases.push(database);
		await database.open();
		const tasks = database.table("tasks");
		await tasks.insert({ id: "one", status: "open", priority: 1, createdAt: 1 });
		await expect(
			tasks.insert({ id: "one", status: "closed", priority: 2, createdAt: 2 }),
		).rejects.toMatchObject({ name: "KeyAlreadyExistsError" });
		await tasks.replace({ id: "one", status: "closed", priority: 2, createdAt: 2 });
		expect(await tasks.get("one")).toMatchObject({ status: "closed" });
	});

	it("executes indexed boolean expressions and ordered asynchronous results", async () => {
		const database = createDatabase();
		databases.push(database);
		await database.open();
		const tasks = database.table("tasks");
		await tasks.insert({ id: "one", status: "open", priority: 2, createdAt: 3 });
		await tasks.insert({ id: "two", status: "open", priority: 1, createdAt: 1 });
		await tasks.insert({ id: "three", status: "closed", priority: 1, createdAt: 2 });
		const result = tasks.query({
			where: OR(
				AND(COMP("status", "=", "open"), COMP("priority", ">=", 1)),
				COMP("status", "=", "closed"),
			),
			orderBy: ORDER_BY("createdAt"),
		});
		expect((await result.toArray()).map((task) => task.id)).toEqual(["two", "three", "one"]);
		/** @type {string[]} */ const ids = [];
		for await (const task of result) ids.push(task.id);
		expect(ids).toEqual(["two", "three", "one"]);
	});

	it("rejects comparisons on non-indexed fields", async () => {
		const database = createDatabase();
		databases.push(database);
		await database.open();
		await expect(
			database
				.table("tasks")
				.query({ where: COMP("title", "=", "x") })
				.toArray(),
		).rejects.toMatchObject({ name: "QueryError" });
	});

	it("adds an index during a later schema version", async () => {
		const databaseName = name();
		const first = Database({
			name: databaseName,
			version: 1,
			migrate(context, oldVersion) {
				if (oldVersion === 0) {
					context.createTable("tasks", {
						fields: { id: { primaryKey: true }, status: { index: true } },
					});
				}
			},
		});
		await first.open();
		await first.table("tasks").insert({ id: "one", status: "open", priority: 2 });
		first.close();
		await Promise.resolve();

		const second = Database({
			name: databaseName,
			version: 2,
			migrate(context, oldVersion) {
				if (oldVersion === 1) context.addIndex("tasks", "priority");
			},
		});
		databases.push(second);
		await second.open();
		expect(
			(
				await second
					.table("tasks")
					.query({ where: COMP("priority", "=", 2) })
					.toArray()
			).map((task) => task.id),
		).toEqual(["one"]);
	});
});
