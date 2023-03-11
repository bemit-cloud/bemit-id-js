export type AuthCacheScopes =
    'resource_client' |
    'id_keys' |
    'oauth_credentials'

export interface AuthCacheAdapterPersistOptions {
    // how long the value should be stored in `seconds`
    expire?: number
}

export interface AuthCacheAdapter {
    get<T>(scope: AuthCacheScopes, key: string): Promise<T | undefined>

    persist(
        scope: AuthCacheScopes, key: string,
        value: string,
        opts?: AuthCacheAdapterPersistOptions,
    ): Promise<void>
}

export class AuthCacheDisabledAdapter implements AuthCacheAdapter {
    get<T>(): Promise<T | undefined> {
        return Promise.resolve(undefined)
    }

    persist(): Promise<void> {
        return Promise.resolve()
    }
}
