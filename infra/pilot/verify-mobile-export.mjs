import assert from "node:assert/strict";
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { resolve, relative, sep } from "node:path";

assert.equal(process.platform, "linux");
assert.equal(process.cwd(), "/app");
const mobile = createRequire(resolve("apps/mobile/package.json"));
const reactNative = createRequire(mobile.resolve("react-native/package.json"));
const compilerVersion = reactNative("hermes-compiler/package.json").version;
const root = resolve("apps/mobile/dist");
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    assert(!entry.isSymbolicLink(), "Unexpected export symlink");
    return entry.isDirectory() ? walk(file) : [file];
  });
}
// https://github.com/facebook/hermes/blob/main/include/hermes/BCGen/HBC/BytecodeFileFormat.h
const platforms = {};
for (const platform of ["android", "ios"]) {
  const files = walk(root).filter(
    (file) => file.includes(sep + platform + sep) && file.endsWith(".hbc"),
  );
  assert(files.length > 0, "Native Hermes bytecode export missing");
  platforms[platform] = files.map((file) => {
    const bytes = readFileSync(file);
    assert(bytes.length > 32);
    assert.equal(bytes.readBigUInt64LE(0), 0x1f1903c103bc1fc6n);
    return {
      path: relative(root, file),
      bytes: bytes.length,
      bytecodeVersion: bytes.readUInt32LE(8),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
}
assert.equal(
  platforms.android[0].bytecodeVersion,
  platforms.ios[0].bytecodeVersion,
);
mkdirSync(".cache", { recursive: true });
writeFileSync(
  ".cache/mobile-export-verification.json",
  JSON.stringify(
    {
      status: "PASS",
      platform: process.platform,
      nodeVersion: process.version,
      hermesCompilerVersion: compilerVersion,
      platforms,
      scope:
        "Actual Android/iOS Hermes bytecode export; signed installable native builds and physical devices NOT_VERIFIED",
    },
    null,
    2,
  ) + "\n",
);
console.log("PILOT_NATIVE_HERMES_BYTECODE_EXPORT_PASS android ios");
