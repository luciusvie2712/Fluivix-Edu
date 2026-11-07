import { Platform } from "react-native";
import type { components } from "@fluivix/api-client";
import * as Sharing from "expo-sharing";
import { Directory, File, Paths } from "expo-file-system";
let sharing = false;

export async function cleanupPrivacyExports() {
  if (Platform.OS === "web" || sharing) return;
  const directory = new Directory(Paths.cache, "fluivixedu-privacy-exports");
  if (!directory.exists) return;
  for (const entry of directory.list()) {
    if (
      entry instanceof File &&
      /^fluivixedu-privacy-[0-9a-f-]{36}\.json$/i.test(entry.name)
    )
      entry.delete();
  }
}

// This directory contains only this feature's transient plaintext files. A new
// export removes remnants of an interrupted share before creating another file.
export async function sharePrivacyExport(
  value: components["schemas"]["PrivacyExportView"],
  isCurrent: () => boolean,
) {
  if (sharing) throw new Error("Một bản xuất khác đang được chia sẻ.");
  sharing = true;
  try {
    await share(value, isCurrent);
  } finally {
    sharing = false;
  }
}
async function share(
  value: components["schemas"]["PrivacyExportView"],
  isCurrent: () => boolean,
) {
  if (Platform.OS === "web")
    throw new Error(
      "Xuất tệp cần ứng dụng iOS hoặc Android. Không tải dữ liệu lên liên kết công khai.",
    );
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("Thiết bị chưa hỗ trợ chia sẻ tệp.");
  if (!isCurrent()) throw new Error("Ngữ cảnh đã thay đổi. Vui lòng tải lại.");
  if (
    !/^fluivixedu-privacy-[0-9a-f-]{36}\.json$/i.test(value.filename) ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= Date.now() ||
    value.json.length > 2097152
  )
    throw new Error("Bản xuất không hợp lệ hoặc đã hết hạn.");
  const directory = new Directory(Paths.cache, "fluivixedu-privacy-exports");
  directory.create({ idempotent: true });
  for (const entry of directory.list()) {
    if (
      entry instanceof File &&
      /^fluivixedu-privacy-[0-9a-f-]{36}\.json$/i.test(entry.name)
    )
      entry.delete();
  }
  const file = new File(directory, value.filename);
  try {
    file.create();
    await file.write(value.json);
    if (file.size > 2097152 || (await file.digest("SHA-256")) !== value.sha256)
      throw new Error("Nội dung bản xuất không khớp xác nhận của máy chủ.");
    if (!isCurrent())
      throw new Error("Ngữ cảnh đã thay đổi. Vui lòng tải lại.");
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/json",
      UTI: "public.json",
      dialogTitle: "Lưu bản xuất dữ liệu riêng tư",
    });
  } finally {
    if (file.exists) file.delete();
  }
}
