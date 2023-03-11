import superagent from 'superagent'
import { AuthCacheAdapter, AuthCacheDisabledAdapter } from '@bemit/cloud-id/AuthCache'
import { IdAuthCredentials, IdClientAuth } from '@bemit/cloud-id/IdClientAuth'

/**
 * @deprecated will be removed, internal usage only
 */
export class ResourceClient {
    protected readonly host: string
    protected readonly idClientAuth?: IdClientAuth
    protected readonly credentials?: IdAuthCredentials
    protected readonly cacheExpire: number
    protected readonly cacheAdapter: AuthCacheAdapter

    constructor(init: {
        host: string
        idClientAuth?: IdClientAuth
        credentials?: IdAuthCredentials
        cacheAdapter?: AuthCacheAdapter
        cacheExpire: number
    }) {
        this.host = init.host
        this.credentials = init.credentials
        this.idClientAuth = init.idClientAuth
        this.cacheExpire = init.cacheExpire
        this.cacheAdapter = init.cacheAdapter || new AuthCacheDisabledAdapter()
    }

    public async getResource(project: string, service: string, resource: string): Promise<any | undefined> {
        const key = 'res:' + Buffer.from(project + '/' + service + '/' + resource).toString('base64')
        let resourceData = await this.cacheAdapter.get<string>('resource_client', key)
        if(resourceData) {
            return JSON.parse(resourceData)
        }
        let req = superagent
            .post(this.host + '/service-resource/' + project + '/' + service + '/' + resource)
            .set('Accept', 'application/json')
            .set('Content-Type', 'application/json')
            .set('User-Agent', 'bemit.id ResourceClient; NodeJS')
        if(this.credentials && this.idClientAuth) {
            const clientToken = await this.idClientAuth.auth(this.credentials)
            if(clientToken) {
                req = req.set('Authorization', 'Bearer ' + clientToken.access_token)
            }
            if(this.credentials.type === 'oauth' && this.credentials.aud) {
                req = req.set('Audience', this.credentials.aud)
            }
        }

        resourceData = await req
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
            await this.cacheAdapter.persist(
                'resource_client', key, JSON.stringify(resourceData),
                {
                    expire: this.cacheExpire,
                },
            )
        }
        return resourceData
    }
}
