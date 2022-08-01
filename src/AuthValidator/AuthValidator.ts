export interface RequestAuthPayload {
    authId?: any
}

export class AuthRuleError extends Error {
    public code: number | undefined = undefined

    public setCode(code: number) {
        this.code = code
        return this
    }
}

export const AuthValidator: {
    noAnonym: (req: RequestAuthPayload) => void
    claimMatch: (
        req: RequestAuthPayload,
        claimName: string, claimValue: string | number | boolean,
        customError?: string
    ) => void
} = {
    noAnonym: (req) => {
        if(!req.authId) {
            throw new AuthRuleError('no-anonym-access').setCode(401)
        }

        if(!req.authId.aud) {
            throw new AuthRuleError('authentication-aud-missing').setCode(401)
        }
        if(!req.authId.sub) {
            throw new AuthRuleError('authentication-sub-missing').setCode(401)
        }
    },
    claimMatch: (req, claimName, claimValue, customError) => {
        if(req.authId[claimName] !== claimValue) {
            throw new AuthRuleError(customError || 'access-not-granted').setCode(403)
        }
    },
}
