import EmbeddedPostgres from "embedded-postgres";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import path from "node:path";
// embedded-postgres 17.6's Windows taskkill stop can hang waiting for an exit.
// Use PostgreSQL's own bounded shutdown against this instance's exact data directory.
export default class TestPostgres extends EmbeddedPostgres {
  override async stop() {
    if (process.platform !== "win32") return super.stop();
    const directory = path.resolve(this.options.databaseDir);
    const root = path.resolve(".cache") + path.sep;
    if (!directory.startsWith(root))
      throw new Error("Test cluster must stay under workspace .cache");
    try {
      await access(path.join(directory, "postmaster.pid"));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return;
      throw error;
    }
    const require = createRequire(import.meta.url);
    const embeddedRequire = createRequire(require.resolve("embedded-postgres"));
    const binary: { pg_ctl: string } = await import(
      pathToFileURL(embeddedRequire.resolve("@embedded-postgres/windows-x64"))
        .href
    );
    await promisify(execFile)(
      binary.pg_ctl,
      ["stop", "-D", directory, "-m", "fast", "-w", "-t", "15"],
      { windowsHide: true, timeout: 20000 },
    );
  }
}
