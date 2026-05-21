import { SqlitePersistence } from "./persistence.js";

const dbPath = process.env.DB_PATH ?? "gyakuten.db";
export const persistence = new SqlitePersistence(dbPath);
