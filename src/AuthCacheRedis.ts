import { AuthCacheAdapter, AuthCacheAdapterPersistOptions, AuthCacheScopes } from '@bemit/cloud-id/AuthCache'
import { RedisConnection } from '@bemit/redis/RedisConnection'

export class AuthCacheRedisAdapter implements AuthCacheAdapter {
    private readonly redis: RedisConnection

    constructor(redis: RedisConnection) {
        this.redis = redis
    }

    async get<T>(scope: AuthCacheScopes, key: string): Promise<T | undefined> {
        return await this.redis.client()
            .then(c =>
                c.get(`${scope}:${key}`) as any as T | undefined,
            )
    }

    async persist(scope: AuthCacheScopes, key: string, value: string, opts?: AuthCacheAdapterPersistOptions): Promise<void> {
        await this.redis.client()
            .then(c =>
                c.set(
                    key, value,
                    opts ? {
                        EX: opts.expire,
                    } : {},
                ),
            )
    }
}
