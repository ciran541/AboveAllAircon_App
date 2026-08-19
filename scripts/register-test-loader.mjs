/** Registers the TypeScript module hooks before anything else is imported. */
import { register } from "node:module";

register("./test-hooks.mjs", import.meta.url);
