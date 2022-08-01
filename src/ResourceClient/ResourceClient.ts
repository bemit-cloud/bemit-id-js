import superagent from 'superagent'
import { RedisManager } from '@bemit/redis/RedisManager'

export class ResourceClient {
    protected readonly host: string
    protected readonly cacheExpire: number
    protected readonly redisManager: RedisManager

    constructor(init: {
        host: string
        redisManager: () => RedisManager
        cacheExpire: number
    }) {
        this.host = init.host
        this.cacheExpire = init.cacheExpire
        this.redisManager = init.redisManager()
    }

    public async getResource(project: string, service: string, resource: string): Promise<any | undefined> {
        const key = 'rc:' + 'res:' + Buffer.from(project + '/' + service + '/' + resource).toString('base64')
        const redis = await this.redisManager.client()
        let resourceData = await redis.get(key)
        if(resourceData) {
            return JSON.parse(resourceData)
        }
        resourceData = await superagent
            .post(this.host + '/service-resource/' + project + '/' + service + '/' + resource)
            .set('Accept', 'application/json')
            .set('Content-Type', 'application/json')
            .set('Audience', 'https://id.bemit.io')
            //.set('Authorization', 'Bearer ' + this.auth.auth(project))
            .set('User-Agent', 'bemit.id ResourceClient; NodeJS')
            .then((r) => {
                if(r.statusCode === 200) {
                    return JSON.parse(r.text)
                }
                return undefined
            })
            .catch(e => {
                console.error('ResourceClient.getResource failed', e)
                return undefined
            })
        if(typeof resourceData !== 'undefined') {
            await redis.set(key, JSON.stringify(resourceData), {
                EX: this.cacheExpire,
            })
        }
        return resourceData
    }
}
