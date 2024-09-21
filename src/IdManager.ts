import superagent, { Request, SuperAgent, SuperAgentRequest } from 'superagent'
import jwt, { Algorithm, SignOptions, VerifyOptions } from 'jsonwebtoken'
import { AuthCacheAdapter, AuthCacheDisabledAdapter } from '@bemit/cloud-id/AuthCache'
import { AuthCacheMemoryAdapter } from '@bemit/cloud-id/AuthCacheMemory'

export interface AbstractIdValidationStrategy {
    type: string
    issuer?: string
    audience?: string
    algorithms?: Algorithm[]
}

export interface IdValidationStrategyLoadKey extends AbstractIdValidationStrategy {
    type: 'load-key'
    keyUrl: string
}

export interface IdValidationStrategyMemoryKeyPair extends AbstractIdValidationStrategy {
    type: 'memory-key-pair'
    keyPrivate?: string
    keyPublic: string
}

export interface IdValidationStrategyMemoryKey extends AbstractIdValidationStrategy {
    type: 'memory-key'
    keyMem: string
}

export type IdValidationStrategy =
    IdValidationStrategyLoadKey |
    IdValidationStrategyMemoryKey |
    IdValidationStrategyMemoryKeyPair

export class IdManager {
    protected readonly host?: string
    protected readonly cacheExpire: number
    protected readonly cacheExpireMemory: number
    protected readonly cacheAdapter: AuthCacheAdapter
    protected readonly cacheAdapterMemory: AuthCacheAdapter
    protected readonly validation?: IdValidationStrategy

    constructor(init: {
        host?: string
        cacheAdapter?: AuthCacheAdapter
        // seconds how long the verification-key is cached by the CacheAdapter
        cacheExpire?: number
        // seconds how long the verification-key is cached in memory
        cacheExpireMemory?: number
        validation?: IdValidationStrategy
    }) {
        this.host = init.host
        this.cacheExpire = init.cacheExpire || 360
        this.cacheExpireMemory = init.cacheExpireMemory || 180
        this.validation = init.validation
        this.cacheAdapter = init.cacheAdapter || new AuthCacheDisabledAdapter()
        this.cacheAdapterMemory = new AuthCacheMemoryAdapter()
    }

    public getHost(): string {
        if(!this.host) {
            throw new Error('IdManager requires `host` to enable API features')
        }
        return this.host
    }

    public getValidation(): IdValidationStrategy | undefined {
        return this.validation
    }

    public apiClient(acceptText?: boolean): SuperAgent<SuperAgentRequest> & Request {
        return superagent
            .agent()
            .set('Accept', acceptText ? 'text/plain' : 'application/json')
            .set('Content-Type', 'application/json')
            .set('User-Agent', 'bemit.id SDK; NodeJS')
    }

    public async getValidationKeyLoadKey(keyUrl: string): Promise<string | undefined> {
        const key = 'vk:' + Buffer.from(this.getHost()).toString('base64')
        let validationKey = await this.cacheAdapterMemory.get<string>('id_keys', key)
        if(!validationKey) {
            validationKey = await this.cacheAdapter.get<string>('id_keys', key)
            if(validationKey) {
                await this.cacheAdapterMemory.persist('id_keys', key, validationKey, {expire: this.cacheExpireMemory})
                return validationKey
            }
        }
        validationKey = await this.apiClient()
            .get(this.getHost() + keyUrl)
            .then((r) => {
                if(r.statusCode === 200) {
                    return r.text
                }
                return undefined
            })
            .catch(e => {
                console.log('IdManager.getValidationKey failed', e)
                return undefined
            })
        if(typeof validationKey === 'string') {
            await this.cacheAdapter.persist(
                'id_keys', key, validationKey,
                {
                    expire: this.cacheExpire,
                },
            )
            await this.cacheAdapterMemory.persist('id_keys', key, validationKey, {expire: this.cacheExpireMemory})
        }
        return validationKey
    }

    public async getValidationKey(): Promise<string | undefined> {
        const validation = this.validation
        if(!validation) return undefined
        const type = validation?.type
        switch(type) {
            case 'load-key':
                return await this.getValidationKeyLoadKey(validation.keyUrl)
            case 'memory-key':
                return validation.keyMem
            case 'memory-key-pair':
                return validation.keyPublic
            default:
                throw new Error('IdManager.getValidationKey invalid validation strategy type: ' + type)
        }
    }

    protected async getPrivateKey(): Promise<string | undefined> {
        const validation = this.validation
        switch(validation?.type) {
            case 'memory-key':
                return validation.keyMem
            case 'memory-key-pair':
                return validation.keyPrivate
            default:
                throw new Error('IdManager.getPrivateKey invalid validation strategy type: ' + validation?.type)
        }
    }

    public async verify(
        bearer: string,
        options: Omit<VerifyOptions, 'issuer' | 'audience' | 'algorithms'> = {},
    ): Promise<string | jwt.Jwt | jwt.JwtPayload | undefined> {
        const validation = this.validation
        if(!validation) {
            throw new Error('IdManager.verify not available, must have `validation` config')
        }
        const validationKey = await this.getValidationKey()
        if(!validationKey) {
            throw new Error('IdManager.verify validationKey not available')
        }
        return new Promise((resolve, reject) => {
            jwt.verify(bearer, validationKey, {
                algorithms: validation.algorithms,
                issuer: validation.issuer,
                audience: validation.audience,
                ...options,
            }, (error, payload) => {
                if(error) {
                    reject(error)
                    return
                }
                resolve(payload)
            })
        })
    }

    public async sign(
        payload: string | Buffer | object,
        options: Omit<SignOptions, 'issuer' | 'audience' | 'algorithm'> = {},
    ): Promise<string> {
        const validation = this.getValidation()
        if(!validation) {
            throw new Error('IdManager.sign not available, must have `validation` config')
        }
        const signKey = await this.getPrivateKey()
        if(!signKey) {
            throw new Error('IdManager.sign signKey not available')
        }
        return jwt.sign(
            payload, signKey,
            {
                ...validation.algorithms?.[0] ? {
                    algorithm: validation.algorithms[0],
                } : {},
                ...validation.issuer ? {
                    issuer: validation.issuer,
                } : {},
                ...validation.audience ? {
                    audience: validation.audience,
                } : {},
                ...options,
            },
        )
    }
}
