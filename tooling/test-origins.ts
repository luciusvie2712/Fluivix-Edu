function port(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535)
    throw new Error(`Invalid local test port: ${name}`);
  return value;
}
export const testPorts = {
  web: port("E2E_WEB_PORT", 3000),
  platform: port("E2E_PLATFORM_PORT", 3001),
  api: port("E2E_API_PORT", 4000),
  database: port("E2E_DATABASE_PORT", 55433),
};
export const testOrigins = {
  web: `http://localhost:${testPorts.web}`,
  platform: `http://localhost:${testPorts.platform}`,
  api: `http://localhost:${testPorts.api}`,
};
export function mailLinkPattern(path: string) {
  return new RegExp(
    testOrigins.web.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
      path +
      "#token=[A-Za-z0-9_-]{43}",
  );
}
