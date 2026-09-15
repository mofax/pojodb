# pojodb

`pojodb` is a small database library for browser applications. Built on IndexedDB.

## KV

```js
import { KV } from "pojodb/kv";

const kv = KV("settings");
await kv.set("theme", "dark"); // rejects when the key already exists
await kv.replace("theme", "light"); // rejects when the key is missing

for await (const [key, value] of kv.getRange("a", "z")) {
	console.log(key, value);
}
```

`get`, `set`, `replace`, `remove`, and `clear` return promises. `getRange`
returns an `AsyncIterable` and also provides `await result.toArray()`.

## Database

```js
import { AND, COMP, Database, ORDER_BY } from "pojodb/database";

const db = Database({
	name: "tasks",
	version: 1,
	migrate({ createTable }, oldVersion) {
		if (oldVersion === 0) {
			createTable("tasks", {
				fields: {
					id: { primaryKey: true },
					status: { index: true },
					createdAt: { index: true },
				},
			});
		}
	},
});

await db.open();
const tasks = db.table("tasks");
await tasks.insert({ id: "task-1", status: "open", createdAt: 1 });

const openTasks = tasks.query({
	where: AND(COMP("status", "=", "open")),
	orderBy: ORDER_BY("createdAt", "desc"),
});

for await (const task of openTasks) console.log(task);
```

Tables provide `get`, `insert`, `replace`, `upsert`, `remove`, `clear`, and
`query`. Queries use `COMP`, `AND`, `OR`, and `ORDER_BY`; comparison fields and
sort fields must be the primary key or an explicitly declared index.
