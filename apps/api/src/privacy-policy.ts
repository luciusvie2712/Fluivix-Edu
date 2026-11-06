/** Technical configuration, not evidence of legal approval. */
export function configuredPrivacyPolicy() {
  const rawVersion = process.env.PRIVACY_POLICY_VERSION;
  const version =
    rawVersion && rawVersion.length <= 100 && rawVersion.trim() === rawVersion
      ? rawVersion
      : null;
  let noticeUrl: string | null = null;
  try {
    const raw = process.env.PRIVACY_NOTICE_URL ?? "";
    const url = new URL(raw);
    if (
      raw.length <= 2048 &&
      url.protocol === "https:" &&
      url.hostname &&
      !url.username &&
      !url.password
    )
      noticeUrl = raw;
  } catch {
    /* Unconfigured: never return credential-bearing/invalid URLs. */
  }
  return { configured: !!version && !!noticeUrl, version, noticeUrl };
}
