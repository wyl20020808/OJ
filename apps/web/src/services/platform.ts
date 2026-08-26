export type PlatformHealth = { status: 'ok' };

export async function fetchHealth(baseUrl = ''): Promise<PlatformHealth> {
  const response = await fetch(`${baseUrl}/health`);
  if (!response.ok)
    throw new Error(`Health request failed (${response.status})`);
  return (await response.json()) as PlatformHealth;
}
