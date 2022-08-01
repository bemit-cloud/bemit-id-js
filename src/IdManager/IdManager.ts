import superagent, { SuperAgent, SuperAgentRequest } from 'superagent'
import jwt, { Algorithm } from 'jsonwebtoken'
import { RedisManager } from '@bemit/redis/RedisManager'

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

export interface IdValidationStrategyMemoryKey extends AbstractIdValidationStrategy {
    type: 'memory-key'
    keyMem: string
}

export type IdValidationStrategy = IdValidationStrategyLoadKey | IdValidationStrategyMemoryKey

export class IdManager {
    protected readonly host?: string
    protected readonly cacheExpire: number
    protected readonly cacheExpireMemory: number
    protected readonly redisManager: RedisManager
    protected readonly validation?: IdValidationStrategy
    protected cachedVerifyKey: undefined | { ts: number, key: string } = undefined

    constructor(init: {
        host?: string
        redisManager: () => RedisManager
        // seconds how long the verification-key is cached in redis
        cacheExpire?: number
        // seconds how long the verification-key is cached in memory
        cacheExpireMemory?: number
        validation?: IdValidationStrategy
    }) {
        this.host = init.host
        this.cacheExpire = init.cacheExpire || 360
        this.cacheExpireMemory = init.cacheExpireMemory || 180
        this.validation = init.validation
        this.redisManager = init.redisManager()
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

    public apiClient(acceptText?: boolean): SuperAgent<SuperAgentRequest> {
        return superagent
            .agent()
            .set('Accept', acceptText ? 'text/plain' : 'application/json')
            .set('Content-Type', 'application/json')
            .set('User-Agent', 'bemit.id SDK; NodeJS')
    }

    public async getValidationKeyLoadKey(keyUrl: string): Promise<string | undefined> {
        const now = new Date().getTime() / 1000
        if(this.cachedVerifyKey?.ts && this.cachedVerifyKey.ts > (now - this.cacheExpireMemory)) {
            return this.cachedVerifyKey.key
        }
        const key = 'id:' + 'vk:' + Buffer.from(this.getHost()).toString('base64')
        const redis = await this.redisManager.client()
        const verifyKey = await redis.get(key)
        if(verifyKey) {
            this.cachedVerifyKey = {ts: now, key: verifyKey}
            return verifyKey
        }
        const validationKey = await this.apiClient()
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
            await redis.set(key, validationKey, {
                EX: this.cacheExpire,
            })
            this.cachedVerifyKey = {ts: now, key: validationKey}
        }
        return validationKey
    }

    public async getValidationKey(): Promise<string | undefined> {
        const validation = this.validation
        switch(validation?.type) {
            case 'load-key':
                return await this.getValidationKeyLoadKey(validation.keyUrl)
            case 'memory-key':
                return validation.keyMem
            default:
                // @ts-ignore
                throw new Error('IdManager.getValidationKey invalid validation strategy type: ' + validation?.type)
        }
    }

    public async verify(bearer: string) {
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
            }, (error, payload) => {
                if(error) {
                    reject(error)
                    return
                }
                resolve(payload)
            })
        })
    }
}
