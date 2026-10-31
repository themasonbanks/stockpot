import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateDatabaseTypes } from "./generate-database-types";

describe("database type generation", () => {
  for (const scenario of ["failure", "empty", "missing", "success"]) {
    test(`${scenario}: preserves existing types unless generation succeeds`, async () => {
      const directory = await mkdtemp(join(tmpdir(), "stockpot-types-"));
      const destination = join(directory, "database.types.ts");
      const original = "export type Database = { previous: true };\n";
      const generated = "export type Database = { generated: true };\n";
      try {
        await Bun.write(destination, original);
        const command =
          scenario === "missing"
            ? [join(directory, "nonexistent-supabase")]
            : [
                Bun.which("bun") ?? process.execPath,
                "-e",
                scenario === "failure"
                  ? 'console.log("partial output"); process.exit(1)'
                  : scenario === "empty"
                    ? "process.exit(0)"
                    : `process.stdout.write(${JSON.stringify(generated)})`,
              ];
        if (scenario === "success") {
          await generateDatabaseTypes(destination, command);
        } else {
          await expect(generateDatabaseTypes(destination, command)).rejects.toThrow();
        }
        expect(await Bun.file(destination).text()).toBe(
          scenario === "success" ? generated : original,
        );
        expect(await readdir(directory)).toEqual(["database.types.ts"]);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});
