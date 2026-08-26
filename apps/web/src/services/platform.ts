export type PlatformReadiness = {
  status: 'ok' | 'not_ready';
  dependencies: Record<string, 'ok' | 'unavailable'>;
};

export async function fetchReadiness(baseUrl = ''): Promise<PlatformReadiness> {
  const response = await fetch(`${baseUrl}/ready`);
  if (response.status !== 200 && response.status !== 503)
    throw new Error(`Readiness request failed (${response.status})`);
  return (await response.json()) as PlatformReadiness;
}
