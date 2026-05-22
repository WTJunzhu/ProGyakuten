import { createClient } from "@libsql/client";
import { SqlitePersistence } from "./persistence.js";

const url = process.env.TURSO_URL ?? "file:gyakuten.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

export const db = createClient({ url, authToken });
export const persistence = new SqlitePersistence(db);
