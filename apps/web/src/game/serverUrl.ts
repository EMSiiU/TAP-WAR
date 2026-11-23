export function resolveGameServerUrl(
  rawEnv: string | undefined,
  isDev: boolean,
  browserOrigin?: string,
): string {
  const trimmed = rawEnv?.trim() ?? ''
  if (trimmed) {
    const withProtocol = /^(https?|wss?):\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    return withProtocol.replace(/\/+$/, '')
  }

  if (!isDev && browserOrigin) {
    return browserOrigin.replace(/\/+$/, '')
  }

  return 'http://127.0.0.1:2567'
}

export function toHealthCheckUrl(serverUrl: string): string {
  return toApiUrl(serverUrl, '/health')
}

export function toApiUrl(serverUrl: string, path: string): string {
  const httpUrl = serverUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')
  return new URL(path, httpUrl).toString()
}
