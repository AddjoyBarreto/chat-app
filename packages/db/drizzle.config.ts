import { defineConfig } from "drizzle-kit";
import { getDrizzleDatabaseUrl } from "./env";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: getDrizzleDatabaseUrl() },
});
