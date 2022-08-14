import crypto from 'crypto'
import { IdManager } from '@bemit/cloud-id/IdManager'
import { RedisConnection } from '@bemit/redis/RedisConnection'

export interface IdAuthCredentialsBase {
    type: string
}

export interface IdAuthCredentialsApiToken extends IdAuthCredentialsBase {
    type: 'api_token'
    name: string
    secret: string
}

export interface IdAuthCredentialsOauth extends IdAuthCredentialsBase {
    type: 'oauth'
    client_id: string
    client_secret: string
    aud: string
}

export type IdAuthCredentials = IdAuthCredentialsOauth | IdAuthCredentialsApiToken

export class IdClientAuth {
    protected readonly redis: RedisConnection
    protected readonly idManager: IdManager
    protected readonly cacheExpire: number
    protected readonly encSecret: string

    constructor(init: {
        cacheExpire: number
        encSecret: string
        redis: RedisConnection
        idManager: IdManager
    }) {
        if(init.encSecret.length !== 32) {
            throw new Error('IdClientAuth encSecret invalid length, must be 32')
        }
        this.idManager = init.idManager
        this.redis = init.redis
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

    public async authTokenOauth(credentials: IdAuthCredentialsOauth): Promise<{
        access_token: string
        expires_in: number
        token_type?: string
    } | undefined> {
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

    public async authToken(credentials: IdAuthCredentials): Promise<{
        access_token: string
        expires_in: number
        token_type?: string
    } | undefined> {
        switch(credentials.type) {
            case 'api_token':
                return this.authTokenApiToken(credentials)
            case 'oauth':
                return this.authTokenOauth(credentials)
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

    public async auth(credentials: IdAuthCredentials): Promise<{
        access_token: string
    } | undefined> {
        const credKey = credentials.type === 'api_token' ? credentials.name :
            credentials.type === 'oauth' ? credentials.client_id :
                // @ts-ignore
                credentials.type
        const key = 'id:' + 'auth:' + crypto.createHash('sha512').update(credKey).digest('hex')
        const redis = await this.redis.client()
        const authData = await redis.get(key)
        if(authData) {
            return JSON.parse(this.decrypt(authData))
        }
        const token = await this.authToken(credentials)
        if(typeof token === 'object') {
            await redis.set(key, this.encrypt(JSON.stringify(token)), {
                EX: this.cacheExpire,
            })
            return token
        }
        return undefined
    }
}
