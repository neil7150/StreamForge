export interface EndpointJSONResult {
  payload: unknown
  endpoint: string
}

export async function fetchJSONWithFailover(
  endpoints: string[],
  path: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 8_000
): Promise<EndpointJSONResult> {
  if (endpoints.length === 0) throw new Error('No provider endpoints are configured')

  const request = async (endpoint: string): Promise<EndpointJSONResult> => {
    const response = await fetchImpl(`${endpoint}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!response.ok) throw new Error(`${endpoint} returned HTTP ${response.status}`)
    return { payload: await response.json(), endpoint }
  }

  try {
    return await request(endpoints[0])
  } catch (primaryError) {
    if (endpoints.length === 1) throw primaryError
    try {
      return await Promise.any(endpoints.slice(1).map(request))
    } catch {
      throw primaryError
    }
  }
}
