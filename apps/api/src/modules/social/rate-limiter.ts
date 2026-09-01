type RedisScriptClient = {
  eval(
    script: string,
    numberOfKeys: number,
    key: string,
    windowSeconds: string,
  ): Promise<unknown>;
};

const consumeScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

export class RedisFixedWindowLimiter {
  constructor(
    private readonly client: RedisScriptClient,
    private readonly prefix = 'ojplatform:social:rate',
  ) {}

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<boolean> {
    const count = Number(
      await this.client.eval(
        consumeScript,
        1,
        `${this.prefix}:${key}`,
        String(windowSeconds),
      ),
    );
    if (!Number.isInteger(count) || count < 1)
      throw new Error('Invalid Redis rate-limit response');
    return count <= limit;
  }
}
