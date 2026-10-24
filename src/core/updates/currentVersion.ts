/** Version embedded at build time from package.json (the single source of truth). */
export function getCurrentVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
}
