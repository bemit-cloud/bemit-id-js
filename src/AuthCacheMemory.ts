import { AuthCacheAdapter, AuthCacheAdapterPersistOptions, AuthCacheScopes } from '@bemit/cloud-id/AuthCache'

export class AuthCacheMemoryAdapter implements AuthCacheAdapter {
    private readonly cache: { [id: string]: { exp?: number, value: string } } = {}

    async get<T>(scope: AuthCacheScopes, key: string): Promise<T | undefined> {
        const item = this.cache[`${scope}:${key}`]
        if(!item) return undefined
        const now = new Date().getTime() / 1000
        if(item.exp && item.exp < now) {
            delete this.cache[`${scope}:${key}`]
            return undefined
        }
        return item.value as T | undefined
    }

    async persist(scope: AuthCacheScopes, key: string, value: string, opts?: AuthCacheAdapterPersistOptions): Promise<void> {
        this.cache[key] = {
            exp: typeof opts?.expire === 'number' ? (new Date().getTime() / 1000) + opts.expire : undefined,
            value: value,
        }
    }
}
