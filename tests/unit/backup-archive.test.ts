import { afterEach, describe, expect, test } from "vitest";
import { randomBytes } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
  realpath,
  lstat,
  symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import {
  sealArchive,
  withAuthenticatedDump,
  authenticateArchive,
  withArchiveLock,
  privateDirectory,
} from "../../packages/backup-cli/src/archive";
import {
  keyProvider,
  validateConfig,
} from "../../packages/backup-cli/src/config";
import { retainBackups } from "../../packages/backup-cli/src/retention";
import { restoreDatabase } from "../../packages/backup-cli/src/operations";

const roots: string[] = [];
afterEach(async () => {
  const parent = await realpath(os.tmpdir());
  for (const root of roots.splice(0)) {
    const absolute = await realpath(root),
      relative = path.relative(parent, absolute);
    if (
      !relative.startsWith("fluivix-backup-unit-") ||
      relative.includes(path.sep) ||
      (await lstat(root)).isSymbolicLink()
    )
      throw Error("Unsafe test cleanup");
    await rm(absolute, { recursive: true });
  }
});
async function fixture() {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "fluivix-backup-unit-")),
  );
  roots.push(root);
  const archive = path.join(root, "archives"),
    work = path.join(root, "work"),
    keys = path.join(root, "keys");
  await mkdir(keys, { mode: 0o700 });
  const key = randomBytes(32),
    keyFile = path.join(keys, "primary.key"),
    passwordFile = path.join(keys, "password");
  await writeFile(keyFile, key, { mode: 0o600 });
  await writeFile(passwordFile, "synthetic-unit-password-only", {
    mode: 0o600,
  });
  const config = validateConfig({
    version: 1,
    connection: {
      host: "127.0.0.1",
      port: 5432,
      user: "backup_test",
      database: "fluivixedu_backup_unit_test",
      passwordFile,
      transport: "local-test",
    },
    archiveDirectory: archive,
    workDirectory: work,
    activeKeyId: "key-v1",
    keys: [{ id: "key-v1", file: keyFile }],
    retention: { keepCount: 2, maxAgeDays: 1, allowApply: true },
  });
  return { root, archive, work, keys, key, keyFile, config };
}
const dump = Buffer.from(
  "PGDMP" + "synthetic-ledger-confidential-value-0123456789".repeat(400),
);
async function save(
  f: Awaited<ReturnType<typeof fixture>>,
  createdAt?: Date,
  id = "key-v1",
  key = f.key,
) {
  return sealArchive({
    source: Readable.from([
      dump.subarray(0, 2),
      dump.subarray(2, 7),
      dump.subarray(7),
    ]),
    sourceCompletion: Promise.resolve(),
    directory: f.archive,
    key,
    keyId: id,
    ...(createdAt ? { createdAt } : {}),
  });
}
async function consume(source: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of source) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
describe("authenticated PostgreSQL backup archives", () => {
  test("round-trips chunked custom-dump bytes without putting plaintext or key in the archive", async () => {
    const f = await fixture(),
      result = await save(f),
      encoded = await readFile(result.filename);
    expect(
      encoded.includes(
        Buffer.from("synthetic-ledger-confidential-value-0123456789"),
      ),
    ).toBe(false);
    expect(encoded.includes(f.key)).toBe(false);
    expect(encoded.length).toBe(result.bytes);
    expect(
      (await authenticateArchive(result.filename, keyProvider(f.config))).keyId,
    ).toBe("key-v1");
    const decoded = await withAuthenticatedDump(
      {
        filename: result.filename,
        keys: keyProvider(f.config),
        workDirectory: f.work,
      },
      consume,
    );
    expect(decoded).toEqual(dump);
    expect(await readdir(f.work)).toEqual([]);
  });
  test("wrong key never invokes the restore consumer and removes temporary plaintext", async () => {
    const f = await fixture(),
      result = await save(f);
    let called = false;
    await expect(
      withAuthenticatedDump(
        {
          filename: result.filename,
          keys: async () => randomBytes(32),
          workDirectory: f.work,
        },
        async () => {
          called = true;
        },
      ),
    ).rejects.toMatchObject({ code: "BACKUP_AUTHENTICATION_FAILED" });
    expect(called).toBe(false);
    expect(await readdir(f.work)).toEqual([]);
  });
  test("consumer cancellation closes the owned file handle and removes temporary plaintext", async () => {
    const f = await fixture(),
      result = await save(f);
    await expect(
      withAuthenticatedDump(
        {
          filename: result.filename,
          keys: keyProvider(f.config),
          workDirectory: f.work,
        },
        async (source) => {
          for await (const chunk of source) {
            expect(Buffer.isBuffer(chunk)).toBe(true);
            break;
          }
          throw Error("synthetic consumer cancellation");
        },
      ),
    ).rejects.toThrow("synthetic consumer cancellation");
    expect(await readdir(f.work)).toEqual([]);
    expect(
      (await authenticateArchive(result.filename, keyProvider(f.config)))
        .archiveId,
    ).toBe(result.archiveId);
  });
  test("tampered ciphertext cannot reach a restore consumer", async () => {
    const f = await fixture(),
      result = await save(f),
      encoded = await readFile(result.filename);
    encoded[encoded.length - 20]! ^= 1;
    await writeFile(result.filename, encoded);
    let called = false;
    await expect(
      withAuthenticatedDump(
        {
          filename: result.filename,
          keys: keyProvider(f.config),
          workDirectory: f.work,
        },
        async () => {
          called = true;
        },
      ),
    ).rejects.toMatchObject({ code: "BACKUP_AUTHENTICATION_FAILED" });
    expect(called).toBe(false);
    expect(await readdir(f.work)).toEqual([]);
  });
  test("truncation is rejected before restore and leaves no plaintext", async () => {
    const f = await fixture(),
      result = await save(f),
      encoded = await readFile(result.filename);
    await writeFile(result.filename, encoded.subarray(0, -7));
    let called = false;
    await expect(
      withAuthenticatedDump(
        {
          filename: result.filename,
          keys: keyProvider(f.config),
          workDirectory: f.work,
        },
        async () => {
          called = true;
        },
      ),
    ).rejects.toMatchObject({ code: "BACKUP_AUTHENTICATION_FAILED" });
    expect(called).toBe(false);
    expect(await readdir(f.work)).toEqual([]);
  });
  test("metadata is authenticated even if a different key ID resolves to the identical key", async () => {
    const f = await fixture(),
      result = await save(f),
      encoded = await readFile(result.filename),
      index = encoded.indexOf(Buffer.from("key-v1"));
    expect(index).toBeGreaterThan(0);
    Buffer.from("key-v2").copy(encoded, index);
    await writeFile(result.filename, encoded);
    await expect(
      authenticateArchive(result.filename, async () => Buffer.from(f.key)),
    ).rejects.toMatchObject({ code: "BACKUP_AUTHENTICATION_FAILED" });
  });
  test("oversized untrusted header is rejected without allocation or consumer access", async () => {
    const f = await fixture(),
      result = await save(f),
      encoded = await readFile(result.filename);
    encoded.writeUInt32BE(0x7fffffff, 8);
    await writeFile(result.filename, encoded);
    await expect(
      authenticateArchive(result.filename, keyProvider(f.config)),
    ).rejects.toMatchObject({ code: "BACKUP_ARCHIVE_INVALID" });
  });
  test("a failed dump process cannot publish an otherwise encrypted stream", async () => {
    const f = await fixture();
    await expect(
      sealArchive({
        source: Readable.from([dump]),
        sourceCompletion: Promise.reject(Error("synthetic source failure")),
        directory: f.archive,
        key: f.key,
        keyId: "key-v1",
      }),
    ).rejects.toMatchObject({ code: "BACKUP_SOURCE_FAILED" });
    expect(await readdir(f.archive)).toEqual([]);
  });
  test("successful non-custom-dump input cannot be committed as a usable backup", async () => {
    const f = await fixture();
    await expect(
      sealArchive({
        source: Readable.from([Buffer.from("not a PostgreSQL custom dump")]),
        sourceCompletion: Promise.resolve(),
        directory: f.archive,
        key: f.key,
        keyId: "key-v1",
      }),
    ).rejects.toMatchObject({ code: "BACKUP_DUMP_FORMAT_INVALID" });
    expect(await readdir(f.archive)).toEqual([]);
  });
  test("size limit failure removes partial output and does not replace earlier archives", async () => {
    const f = await fixture(),
      first = await save(f),
      original = await readFile(first.filename);
    await expect(
      sealArchive({
        source: Readable.from([dump]),
        sourceCompletion: Promise.resolve(),
        directory: f.archive,
        key: f.key,
        keyId: "key-v1",
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: "BACKUP_LIMIT_EXCEEDED" });
    expect(await readFile(first.filename)).toEqual(original);
    expect(await readdir(f.archive)).toEqual([path.basename(first.filename)]);
  });
  test("exclusive job lock rejects overlap and is released by the owning job", async () => {
    const f = await fixture();
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
        enter = resolve;
      }),
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
    const first = withArchiveLock(f.archive, async () => {
      enter();
      await held;
    });
    await Promise.race([entered, first]);
    await expect(
      withArchiveLock(f.archive, async () => {}),
    ).rejects.toMatchObject({ code: "BACKUP_BUSY_OR_LOCK_UNAVAILABLE" });
    release();
    await first;
    await expect(
      withArchiveLock(f.archive, async () => "released"),
    ).resolves.toBe("released");
  });
  test("a directory alias/junction is refused instead of writing through it", async () => {
    const f = await fixture(),
      target = path.join(f.root, "real"),
      alias = path.join(f.root, "alias");
    await mkdir(target, { mode: 0o700 });
    await symlink(target, alias, "junction");
    await expect(privateDirectory(alias)).rejects.toMatchObject({
      code: "BACKUP_DIRECTORY_UNSAFE",
    });
    expect(await readdir(target)).toEqual([]);
  });
  test("retention previews then deletes only authenticated old archives beyond the minimum count", async () => {
    const f = await fixture();
    for (let day = 1; day <= 4; day++)
      await save(f, new Date(`2026-01-0${day}T00:00:00Z`));
    const now = new Date("2026-02-01T00:00:00Z"),
      preview = await retainBackups(f.config, { apply: false, now });
    expect(preview.candidateArchiveIds).toHaveLength(2);
    expect(preview.deletedArchiveIds).toEqual([]);
    expect(await readdir(f.archive)).toHaveLength(4);
    const result = await retainBackups(f.config, { apply: true, now });
    expect(result.deletedArchiveIds).toEqual(preview.candidateArchiveIds);
    expect(result.retainedArchives).toBe(2);
    expect(await readdir(f.archive)).toHaveLength(2);
  });
  test("one unknown key blocks the complete retention apply before any deletion", async () => {
    const f = await fixture();
    for (let day = 1; day <= 3; day++)
      await save(f, new Date(`2026-01-0${day}T00:00:00Z`));
    await save(
      f,
      new Date("2026-01-04T00:00:00Z"),
      "unknown-key",
      randomBytes(32),
    );
    const before = (await readdir(f.archive)).sort();
    await expect(
      retainBackups(f.config, {
        apply: true,
        now: new Date("2026-02-01T00:00:00Z"),
      }),
    ).rejects.toMatchObject({ code: "BACKUP_KEY_UNKNOWN" });
    expect((await readdir(f.archive)).sort()).toEqual(before);
  });
  test("key rotation can authenticate old and new archives without rewriting old keys", async () => {
    const f = await fixture(),
      first = await save(f),
      secondKey = randomBytes(32),
      secondFile = path.join(f.keys, "second.key");
    await writeFile(secondFile, secondKey, { mode: 0o600 });
    const second = await save(f, undefined, "key-v2", secondKey),
      config = validateConfig({
        ...f.config,
        activeKeyId: "key-v2",
        keys: [...f.config.keys, { id: "key-v2", file: secondFile }],
      });
    expect(
      (await authenticateArchive(first.filename, keyProvider(config))).keyId,
    ).toBe("key-v1");
    expect(
      (await authenticateArchive(second.filename, keyProvider(config))).keyId,
    ).toBe("key-v2");
    expect(await readFile(f.keyFile)).toEqual(f.key);
  });
  test("destructive retention and restore both require explicit approval", async () => {
    const f = await fixture(),
      config = validateConfig({
        ...f.config,
        retention: { ...f.config.retention, allowApply: false },
      });
    await expect(retainBackups(config, { apply: true })).rejects.toMatchObject({
      code: "BACKUP_RETENTION_APPROVAL_REQUIRED",
    });
    await expect(
      restoreDatabase({
        config,
        filename: path.join(f.archive, "unused"),
        targetDatabase: "fluivixedu_restored_test",
        confirmCreate: false,
      }),
    ).rejects.toMatchObject({ code: "BACKUP_RESTORE_CONFIRMATION_REQUIRED" });
    expect(() =>
      validateConfig({
        ...f.config,
        keys: [{ id: "key-v1", file: path.join(f.archive, "key") }],
      }),
    ).toThrow("BACKUP_KEYS_MUST_BE_SEPARATE");
  });
});
