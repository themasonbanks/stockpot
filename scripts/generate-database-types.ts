import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Keep the previous types intact if Supabase is unavailable or generation fails.
export async function generateDatabaseTypes(
  destination: string,
  command = ["supabase", "gen", "types", "typescript", "--local"],
): Promise<void> {
  const directory = dirname(resolve(destination));
  await mkdir(directory, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(directory, ".database-types-"));
  const temporaryFile = join(temporaryDirectory, "database.types.ts");
  try {
    const process = Bun.spawn(command, { stdout: "pipe", stderr: "inherit" });
    const output = await new Response(process.stdout).text();
    const exitCode = await process.exited;
    if (exitCode !== 0) throw new Error(`Database type generation failed (exit ${exitCode})`);
    if (!output.trim()) throw new Error("Database type generation returned no types");
    await Bun.write(temporaryFile, output);
    await rename(temporaryFile, resolve(destination));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await generateDatabaseTypes("packages/database/src/database.types.ts");
}
