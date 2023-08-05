import crypto from 'crypto'
import { IdManager } from '@bemit/cloud-id/IdManager'
import { AuthCacheAdapter, AuthCacheDisabledAdapter } from '@bemit/cloud-id/AuthCache'

export interface IdAuthCredentialsBase {
    type: string
}

export interface IdAuthCredentialsApiToken extends IdAuthCredentialsBase {
    type: 'api_token'
    name: string
    secret: string
    audience?: string
}

export interface IdAuthCredentialsOauth extends IdAuthCredentialsBase {
    type: 'oauth'
    client_id: string
    client_secret: string
    aud: string
}

export type IdAuthCredentials = IdAuthCredentialsOauth | IdAuthCredentialsApiToken

export class IdClientAuth {
    protected readonly cacheAdapter: AuthCacheAdapter
    protected readonly idManager: IdManager
    protected readonly cacheExpire: number
    protected readonly encSecret: string

    constructor(init: {
        cacheExpire: number
        encSecret: string
        idManager: IdManager
        cacheAdapter?: AuthCacheAdapter
    }) {
        if(init.encSecret.length !== 32) {
            throw new Error('IdClientAuth encSecret invalid length, must be 32')
        }
        this.idManager = init.idManager
        this.cacheAdapter = init.cacheAdapter || new AuthCacheDisabledAdapter()
        this.cacheExpire = init.cacheExpire
        this.encSecret = init.encSecret
    }

    public async authTokenApiToken(credentials: IdAuthCredentialsApiToken): Promise<{
        access_token: string
        expires_in: number
        token_type?: string
    } | undefined> {
        return this.idManager.apiClient()
            .post(this.idManager.getHost() + '/id/api-token')
            .send({
                name: credentials.name,
                secret: credentials.secret,
                aud: credentials.audience,
            })
            .then((r) => {
                if(r.statusCode === 200) {
                    return JSON.parse(r.text)
                }
                return undefined
            })
            .catch(e => {
                console.error('IdClientAuth.authTokenApiKey failed', e)
                return undefined
            })
    }

    public async authTokenOauth<AT extends {
        access_token: string
        expires_in?: number
        token_type?: string
    }>(credentials: IdAuthCredentialsOauth): Promise<AT | undefined> {
        return this.idManager.apiClient()
            .post(this.idManager.getHost() + '/oauth/token')
            .send({
                client_id: credentials.client_id,
                client_secret: credentials.client_secret,
                aud: credentials.aud,
                grant_type: 'client_credentials',
            })
            .then((r) => {
                if(r.statusCode === 200) {
                    return JSON.parse(r.text)
                }
                return undefined
            })
            .catch(e => {
                console.error('IdClientAuth.authTokenOauth failed', e)
                return undefined
            })
    }

    public async authToken<AT extends {
        access_token: string
        expires_in?: number
        token_type?: string
    }>(credentials: IdAuthCredentials): Promise<AT | undefined> {
        switch(credentials.type) {
            case 'api_token':
                return await this.authTokenApiToken(credentials) as AT | undefined
            case 'oauth':
                return await this.authTokenOauth(credentials) as AT | undefined
            default:
                // @ts-ignore
                throw new Error('authToken for `' + credentials.type + '` credentials not supported')
        }
    }

    encrypt(text: string): string {
        const iv = crypto.randomBytes(16)
        const cipher = crypto.createCipheriv('aes-256-ctr', this.encSecret, iv)
        const encrypted = Buffer.concat([cipher.update(text), cipher.final()])
        return iv.toString('hex') + ':' + encrypted.toString('hex')
    }

    decrypt(hash: string): string {
        const [iv, content] = hash.split(':')
        const decipher = crypto.createDecipheriv('aes-256-ctr', this.encSecret, Buffer.from(iv, 'hex'))

        const decrypted = Buffer.concat([decipher.update(Buffer.from(content, 'hex')), decipher.final()])

        return decrypted.toString()
    }

    public async auth<AT extends { access_token: string }>(credentials: IdAuthCredentials): Promise<AT | undefined> {
        const credKey = credentials.type === 'api_token' ? credentials.name :
            credentials.type === 'oauth' ? credentials.client_id :
                // @ts-ignore
                credentials.type
        const authData = await this.cacheAdapter.get<string>('oauth_credentials', credKey)
        if(authData) {
            return JSON.parse(this.decrypt(authData))
        }
        const token = await this.authToken<AT>(credentials)
        if(typeof token === 'object') {
            await this.cacheAdapter.persist(
                'oauth_credentials', credKey, this.encrypt(JSON.stringify(token)),
                {
                    expire: this.cacheExpire,
                },
            )
            return token
        }
        return undefined
    }
}
