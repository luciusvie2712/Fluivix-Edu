import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { constants } from "node:fs";
import { open, lstat, realpath, mkdir, link, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { Readable, Writable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";

export class BackupError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
const magic = Buffer.from("FLVXBAK1");
const tagBytes = 16;
const nonceBytes = 12;
const maxHeaderBytes = 4096;
export const defaultMaxArchiveBytes = 2 * 1024 * 1024 * 1024;
export const archiveMetadataSchema = z
  .object({
    version: z.literal(1),
    archiveId: z.uuid(),
    createdAt: z.iso.datetime(),
    keyId: z.string().regex(/^[a-zA-Z0-9_-]{3,80}$/),
    format: z.literal("postgres-custom"),
  })
  .strict();
export type ArchiveMetadata = z.infer<typeof archiveMetadataSchema>;
export type KeyProvider = (keyId: string) => Promise<Buffer>;
export type ArchiveCommit = ArchiveMetadata & {
  filename: string;
  bytes: number;
};

function samePath(a: string, b: string) {
  return process.platform === "win32"
    ? a.toLowerCase() === b.toLowerCase()
    : a === b;
}
export async function privateDirectory(directory: string) {
  // Require canonical absolute paths. In particular, callers constructing a
  // Windows TEMP fixture must expand its 8.3 alias before selecting the root;
  // accepting arbitrary realpath differences here would also accept junctions.
  const resolved = path.resolve(directory);
  if (!path.isAbsolute(directory) || resolved === path.parse(resolved).root)
    throw new BackupError("BACKUP_DIRECTORY_UNSAFE");
  await mkdir(resolved, { mode: 0o700 }).catch((error: unknown) => {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EEXIST"
    )
      throw new BackupError("BACKUP_DIRECTORY_UNSAFE");
  });
  const info = await lstat(resolved);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    !samePath(await realpath(resolved), resolved)
  )
    throw new BackupError("BACKUP_DIRECTORY_UNSAFE");
  if (
    process.platform !== "win32" &&
    ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.())
  )
    throw new BackupError("BACKUP_DIRECTORY_UNSAFE");
  return resolved;
}

async function writeAll(file: FileHandle, buffer: Buffer, position: number) {
  let offset = 0;
  while (offset < buffer.length) {
    const result = await file.write(
      buffer,
      offset,
      buffer.length - offset,
      position + offset,
    );
    if (!result.bytesWritten) throw new BackupError("BACKUP_IO_FAILED");
    offset += result.bytesWritten;
  }
}
async function readExactly(file: FileHandle, bytes: number, position: number) {
  const buffer = Buffer.alloc(bytes);
  let offset = 0;
  while (offset < bytes) {
    const result = await file.read(
      buffer,
      offset,
      bytes - offset,
      position + offset,
    );
    if (!result.bytesRead) throw new BackupError("BACKUP_ARCHIVE_INVALID");
    offset += result.bytesRead;
  }
  return buffer;
}
class FileSink extends Writable {
  constructor(
    private file: FileHandle,
    public position: number,
    private maxBytes: number,
  ) {
    super();
  }
  _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    if (this.position + chunk.length > this.maxBytes) {
      callback(new BackupError("BACKUP_LIMIT_EXCEEDED"));
      return;
    }
    const position = this.position;
    this.position += chunk.length;
    void writeAll(this.file, chunk, position).then(
      () => callback(),
      () => callback(new BackupError("BACKUP_IO_FAILED")),
    );
  }
  _final(callback: (error?: Error | null) => void) {
    void this.file.sync().then(
      () => callback(),
      () => callback(new BackupError("BACKUP_IO_FAILED")),
    );
  }
}
class DumpFormatGate extends Transform {
  private prefix = Buffer.alloc(0);
  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void,
  ) {
    if (this.prefix.length < 5)
      this.prefix = Buffer.concat([
        this.prefix,
        chunk.subarray(0, 5 - this.prefix.length),
      ]);
    callback(null, chunk);
  }
  _flush(callback: (error?: Error | null) => void) {
    callback(
      this.prefix.equals(Buffer.from("PGDMP"))
        ? null
        : new BackupError("BACKUP_DUMP_FORMAT_INVALID"),
    );
  }
}
function keyCopy(key: Buffer) {
  if (key.length !== 32) throw new BackupError("BACKUP_KEY_INVALID");
  return Buffer.from(key);
}
function limit(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 1024 || bytes > 64 * 1024 ** 3)
    throw new BackupError("BACKUP_LIMIT_INVALID");
  return bytes;
}
async function removeOwnedFile(filename: string) {
  await unlink(filename).catch((error: unknown) => {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw new BackupError("BACKUP_TEMPORARY_FILE_CLEANUP_FAILED");
  });
}
async function syncDirectory(directory: string) {
  // File contents are fsynced on all platforms. Directory fsync is not portable
  // to Windows; no Windows power-loss durability or ACL proof is claimed.
  if (process.platform === "win32") return;
  const file = await open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY,
  );
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}

export async function sealArchive(input: {
  source: Readable;
  sourceCompletion: Promise<void>;
  directory: string;
  key: Buffer;
  keyId: string;
  createdAt?: Date;
  maxBytes?: number;
  signal?: AbortSignal;
}): Promise<ArchiveCommit> {
  const completed = input.sourceCompletion.then(
    () => true,
    () => false,
  );
  const directory = await privateDirectory(input.directory);
  const maximum = limit(input.maxBytes ?? defaultMaxArchiveBytes);
  const metadata = archiveMetadataSchema.parse({
    version: 1,
    archiveId: randomUUID(),
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    keyId: input.keyId,
    format: "postgres-custom",
  });
  const json = Buffer.from(JSON.stringify(metadata));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(json.length);
  const nonce = randomBytes(nonceBytes);
  const aad = Buffer.concat([magic, length, json, nonce]);
  const temporary = path.join(directory, ".partial-" + metadata.archiveId);
  const filename = path.join(
    directory,
    "backup-" + metadata.archiveId + ".fvbak",
  );
  // Attach the rejection handler immediately, even if the source process fails
  // before its stdout pipeline drains. A failed pg_dump never publishes a file.
  const key = keyCopy(input.key);
  let file: FileHandle | undefined;
  let owned = false;
  try {
    file = await open(
      temporary,
      constants.O_RDWR |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    owned = true;
    await writeAll(file, aad, 0);
    const cipher = createCipheriv("aes-256-gcm", key, nonce, {
      authTagLength: tagBytes,
    });
    cipher.setAAD(aad);
    const sink = new FileSink(file, aad.length, maximum - tagBytes);
    await pipeline(
      input.source,
      new DumpFormatGate(),
      cipher,
      sink,
      input.signal ? { signal: input.signal } : {},
    );
    if (!(await completed)) throw new BackupError("BACKUP_SOURCE_FAILED");
    await writeAll(file, cipher.getAuthTag(), sink.position);
    await file.sync();
    await file.close();
    file = undefined;
    // Hard-link creation is atomic and refuses an existing destination. Rename
    // is deliberately avoided because it can overwrite a prior archive.
    await link(temporary, filename);
    await removeOwnedFile(temporary);
    owned = false;
    await syncDirectory(directory);
    return { ...metadata, filename, bytes: sink.position + tagBytes };
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError("BACKUP_ARCHIVE_WRITE_FAILED");
  } finally {
    key.fill(0);
    await file?.close();
    if (owned) await removeOwnedFile(temporary);
  }
}

async function envelope(filename: string, maxBytes: number) {
  const before = await lstat(filename);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    !samePath(await realpath(filename), path.resolve(filename))
  )
    throw new BackupError("BACKUP_ARCHIVE_INVALID");
  if (
    before.size > limit(maxBytes) ||
    before.size < magic.length + 4 + nonceBytes + tagBytes + 5
  )
    throw new BackupError("BACKUP_ARCHIVE_INVALID");
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (
      info.dev !== before.dev ||
      info.ino !== before.ino ||
      info.size !== before.size
    )
      throw new BackupError("BACKUP_ARCHIVE_INVALID");
    const prefix = await readExactly(file, magic.length + 4, 0);
    if (!prefix.subarray(0, magic.length).equals(magic))
      throw new BackupError("BACKUP_ARCHIVE_INVALID");
    const size = prefix.readUInt32BE(magic.length);
    if (
      !size ||
      size > maxHeaderBytes ||
      info.size < prefix.length + size + nonceBytes + tagBytes + 5
    )
      throw new BackupError("BACKUP_ARCHIVE_INVALID");
    const json = await readExactly(file, size, prefix.length);
    const parsed = archiveMetadataSchema.safeParse(
      JSON.parse(json.toString("utf8")),
    );
    if (
      !parsed.success ||
      path.basename(filename) !== "backup-" + parsed.data.archiveId + ".fvbak"
    )
      throw new BackupError("BACKUP_ARCHIVE_INVALID");
    const nonce = await readExactly(file, nonceBytes, prefix.length + size);
    const aad = Buffer.concat([prefix, json, nonce]);
    const tag = await readExactly(file, tagBytes, info.size - tagBytes);
    return { file, metadata: parsed.data, nonce, aad, tag, bytes: info.size };
  } catch {
    await file.close();
    throw new BackupError("BACKUP_ARCHIVE_INVALID");
  }
}

async function decryptTo(
  filename: string,
  keys: KeyProvider,
  sink: Writable,
  maximum: number,
  signal?: AbortSignal,
) {
  const value = await envelope(filename, maximum);
  let key: Buffer | undefined;
  try {
    key = keyCopy(await keys(value.metadata.keyId));
    const decipher = createDecipheriv("aes-256-gcm", key, value.nonce, {
      authTagLength: tagBytes,
    });
    decipher.setAAD(value.aad);
    decipher.setAuthTag(value.tag);
    const source = value.file.createReadStream({
      autoClose: false,
      start: value.aad.length,
      end: value.bytes - tagBytes - 1,
    });
    await pipeline(source, decipher, sink, signal ? { signal } : {});
    return value.metadata;
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError("BACKUP_AUTHENTICATION_FAILED");
  } finally {
    key?.fill(0);
    await value.file.close();
  }
}

export async function authenticateArchive(
  filename: string,
  keys: KeyProvider,
  maxBytes = defaultMaxArchiveBytes,
) {
  let prefix = Buffer.alloc(0);
  const sink = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (prefix.length < 5)
        prefix = Buffer.concat([prefix, chunk.subarray(0, 5 - prefix.length)]);
      callback();
    },
  });
  const metadata = await decryptTo(filename, keys, sink, maxBytes);
  if (!prefix.equals(Buffer.from("PGDMP")))
    throw new BackupError("BACKUP_DUMP_FORMAT_INVALID");
  return metadata;
}

export async function withAuthenticatedDump<T>(
  input: {
    filename: string;
    keys: KeyProvider;
    workDirectory: string;
    maxBytes?: number;
    signal?: AbortSignal;
  },
  consume: (source: Readable, metadata: ArchiveMetadata) => Promise<T>,
): Promise<T> {
  const directory = await privateDirectory(input.workDirectory);
  const temporary = path.join(directory, ".restore-" + randomUUID());
  const file = await open(
    temporary,
    constants.O_RDWR |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  let stream: Readable | undefined;
  try {
    const sink = new FileSink(
      file,
      0,
      limit(input.maxBytes ?? defaultMaxArchiveBytes),
    );
    const metadata = await decryptTo(
      input.filename,
      input.keys,
      sink,
      input.maxBytes ?? defaultMaxArchiveBytes,
      input.signal,
    );
    if (!(await readExactly(file, 5, 0)).equals(Buffer.from("PGDMP")))
      throw new BackupError("BACKUP_DUMP_FORMAT_INVALID");
    // No consumer is called and no pg_restore process may start before GCM
    // finalization above has authenticated the entire archive.
    stream = file.createReadStream({
      autoClose: false,
      start: 0,
      end: sink.position - 1,
    });
    return await consume(stream, metadata);
  } finally {
    stream?.destroy();
    await file.close();
    await removeOwnedFile(temporary);
  }
}

export async function withArchiveLock<T>(
  directory: string,
  action: () => Promise<T>,
): Promise<T> {
  const root = await privateDirectory(directory);
  const filename = path.join(root, ".backup-lock");
  let file: FileHandle;
  try {
    file = await open(filename, "wx", 0o600);
  } catch {
    throw new BackupError("BACKUP_BUSY_OR_LOCK_UNAVAILABLE");
  }
  const owned = await file.stat();
  const release = async () => {
    await file.close();
    const current = await lstat(filename);
    if (
      current.isSymbolicLink() ||
      current.dev !== owned.dev ||
      current.ino !== owned.ino
    )
      throw new BackupError("BACKUP_LOCK_OWNERSHIP_LOST");
    await unlink(filename);
  };
  let result: T;
  try {
    result = await action();
  } catch (error) {
    await release();
    throw error;
  }
  await release();
  return result;
}
