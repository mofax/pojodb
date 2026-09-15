// @ts-check
import { defineConfig } from "vite-plus";

export default defineConfig({
	lint: {
		ignorePatterns: ["dist/**", "node_modules/**"],
		options: {
			typeAware: true,
			typeCheck: true,
		},
	},
	pack: {
		entry: {
			kv: "./src/kv.js",
			database: "./src/database.js",
		},
		format: ["esm"],
		dts: { tsconfig: "./tsconfig.json" },
		unbundle: true,
		clean: true,
		target: "es2022",
	},
});
