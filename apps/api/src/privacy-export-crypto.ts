import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function configuration() {
  const raw = process.env.PRIVACY_EXPORT_KEY;
  const id = process.env.PRIVACY_EXPORT_KEY_ID;
  if (
    !raw ||
    !/^[a-f0-9]{64}$/i.test(raw) ||
    !id ||
    !/^[A-Za-z0-9_-]{3,80}$/.test(id)
  )
    return null;
  return { key: Buffer.from(raw, "hex"), id };
}
const aad = (tenantId: string, requestId: string, keyId: string) =>
  Buffer.from(`fluivixedu:privacy-export:v1:${tenantId}:${requestId}:${keyId}`);
export function sealPrivacyExport(
  tenantId: string,
  requestId: string,
  json: string,
) {
  const config = configuration();
  if (!config)
    throw new ConflictException(
      "Chưa cấu hình khóa riêng cho bản xuất dữ liệu. Yêu cầu chưa được thực thi.",
    );
  const bytes = Buffer.from(json, "utf8");
  if (!bytes.length || bytes.length > 2097152)
    throw new ConflictException(
      "Dữ liệu vượt giới hạn bản xuất trực tuyến; cần xử lý qua kênh riêng được phê duyệt.",
    );
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", config.key, iv);
  cipher.setAAD(aad(tenantId, requestId, config.id));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return {
    keyId: config.id,
    ciphertext: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
      "base64",
    ),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteCount: bytes.length,
  };
}
export function openPrivacyExport(row: {
  tenantId: string;
  requestId: string;
  keyId: string;
  ciphertext: string | null;
  sha256: string;
  byteCount: number;
}) {
  const config = configuration();
  if (!config || config.id !== row.keyId || !row.ciphertext)
    throw new ServiceUnavailableException(
      "Bản xuất hiện chưa thể mở an toàn. Liên hệ trung tâm.",
    );
  let bytes: Buffer | undefined;
  try {
    const envelope = Buffer.from(row.ciphertext, "base64");
    if (envelope.length > 28 && envelope.length <= 2097152 + 28) {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        config.key,
        envelope.subarray(0, 12),
      );
      decipher.setAuthTag(envelope.subarray(12, 28));
      decipher.setAAD(aad(row.tenantId, row.requestId, row.keyId));
      bytes = Buffer.concat([
        decipher.update(envelope.subarray(28)),
        decipher.final(),
      ]);
    }
  } catch {
    bytes = undefined;
  }
  if (
    !bytes ||
    bytes.length !== row.byteCount ||
    createHash("sha256").update(bytes).digest("hex") !== row.sha256
  )
    throw new ServiceUnavailableException(
      "Không xác minh được tính toàn vẹn của bản xuất. Liên hệ trung tâm.",
    );
  return bytes.toString("utf8");
}
export function privacyExportTtlMinutes() {
  const raw = process.env.PRIVACY_EXPORT_TTL_MINUTES ?? "30";
  if (!/^\d{1,4}$/.test(raw) || Number(raw) < 1 || Number(raw) > 1440)
    throw new ConflictException("Thời hạn bản xuất chưa được cấu hình hợp lệ.");
  return Number(raw);
}
