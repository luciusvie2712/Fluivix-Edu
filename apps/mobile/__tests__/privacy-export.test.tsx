import { Platform } from "react-native";
import {
  cleanupPrivacyExports,
  sharePrivacyExport,
} from "../lib/privacy-export";
const mockFile = {
  create: jest.fn(),
  write: jest.fn(),
  delete: jest.fn(),
  digest: jest.fn(),
  exists: true,
  size: 20,
  uri: "file:///private-cache/export.json",
  name: "fluivixedu-privacy-10000000-0000-4000-8000-000000000001.json",
};
const mockOld = { ...mockFile, delete: jest.fn() };
const mockOther = { ...mockFile, name: "unrelated.json", delete: jest.fn() };
const mockList = jest.fn();
jest.mock("expo-file-system", () => {
  class File {
    constructor() {
      Object.assign(this, mockFile);
    }
    static [Symbol.hasInstance](x: unknown) {
      return (
        x === mockOld ||
        x === mockOther ||
        (typeof x === "object" &&
          x !== null &&
          Object.getPrototypeOf(x) === File.prototype)
      );
    }
  }
  return {
    File,
    Directory: class {
      exists = true;
      create() {}
      list() {
        return mockList();
      }
    },
    Paths: { cache: "file:///private-cache" },
  };
});
const mockAvailable = jest.fn(),
  mockShare = jest.fn();
jest.mock("expo-sharing", () => ({
  isAvailableAsync: () => mockAvailable(),
  shareAsync: (...args: unknown[]) => mockShare(...args),
}));
const payload = {
  filename: mockFile.name,
  json: '{"synthetic":true}',
  sha256: "synthetic-checksum",
  expiresAt: new Date(Date.now() + 600000).toISOString(),
};
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "android",
  });
  mockAvailable.mockResolvedValue(true);
  mockShare.mockResolvedValue(undefined);
  mockFile.write.mockResolvedValue(undefined);
  mockFile.digest.mockResolvedValue(payload.sha256);
  mockList.mockReturnValue([mockOld, mockOther]);
});
it("shares only a verified private cache file and removes its plaintext after the OS sheet closes", async () => {
  await sharePrivacyExport(payload, () => true);
  expect(mockOld.delete).toHaveBeenCalledTimes(1);
  expect(mockOther.delete).not.toHaveBeenCalled();
  expect(mockFile.write).toHaveBeenCalledWith(payload.json);
  expect(mockFile.digest).toHaveBeenCalledWith("SHA-256");
  expect(mockShare).toHaveBeenCalledWith(
    mockFile.uri,
    expect.objectContaining({ mimeType: "application/json" }),
  );
  expect(mockFile.delete).toHaveBeenCalledTimes(1);
});
it("rejects a changed context after writing and cleans up before any sharing", async () => {
  const current = jest
    .fn()
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(false);
  await expect(sharePrivacyExport(payload, current)).rejects.toThrow(
    "Ngữ cảnh",
  );
  expect(mockShare).not.toHaveBeenCalled();
  expect(mockFile.delete).toHaveBeenCalledTimes(1);
});
it("rejects corrupted content and cleans up without opening the OS sheet", async () => {
  mockFile.digest.mockResolvedValue("wrong-checksum");
  await expect(sharePrivacyExport(payload, () => true)).rejects.toThrow(
    "không khớp",
  );
  expect(mockShare).not.toHaveBeenCalled();
  expect(mockFile.delete).toHaveBeenCalledTimes(1);
});
it("cleans up after a failed OS share and releases the single-export guard", async () => {
  mockShare.mockRejectedValueOnce(Error("Synthetic OS failure"));
  await expect(sharePrivacyExport(payload, () => true)).rejects.toThrow(
    "Synthetic OS failure",
  );
  expect(mockFile.delete).toHaveBeenCalledTimes(1);
  await sharePrivacyExport(payload, () => true);
  expect(mockShare).toHaveBeenCalledTimes(2);
});
it("does not create plaintext on web or on a device without file sharing", async () => {
  Object.defineProperty(Platform, "OS", { configurable: true, value: "web" });
  await expect(sharePrivacyExport(payload, () => true)).rejects.toThrow(
    "iOS hoặc Android",
  );
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: "android",
  });
  mockAvailable.mockResolvedValue(false);
  await expect(sharePrivacyExport(payload, () => true)).rejects.toThrow(
    "chưa hỗ trợ",
  );
  expect(mockFile.create).not.toHaveBeenCalled();
  expect(mockShare).not.toHaveBeenCalled();
});
it("rejects path-like names and expired files before writing", async () => {
  await expect(
    sharePrivacyExport({ ...payload, filename: "../export.json" }, () => true),
  ).rejects.toThrow("không hợp lệ");
  await expect(
    sharePrivacyExport({ ...payload, expiresAt: "2000-01-01Z" }, () => true),
  ).rejects.toThrow("hết hạn");
  expect(mockFile.create).not.toHaveBeenCalled();
});
it("clears only known app-owned export files at startup", async () => {
  await cleanupPrivacyExports();
  expect(mockOld.delete).toHaveBeenCalledTimes(1);
  expect(mockOther.delete).not.toHaveBeenCalled();
});
