export interface IAuthConstraintError {
    rule: string
    message: string
}

export class AuthConstraintError extends Error implements IAuthConstraintError {
    public readonly rule: string

    constructor(message: string, error: Omit<IAuthConstraintError, 'message'>) {
        super(message)
        this.rule = error.rule
    }
}

/**
 * Authentication error intended for user-viewing,
 * all messages and data must be insensitive data, for viewing by end user.
 */
export class AuthRuleError extends Error {
    public code: number | undefined = undefined
    public constraints: AuthConstraintError[] = []

    public setCode(code: number) {
        this.code = code
        return this
    }

    public addConstraints(...constraints: AuthConstraintError[]) {
        this.constraints.push(...constraints)
        return this
    }

    public withConstraint({message, ...error}: IAuthConstraintError) {
        this.constraints.push(new AuthConstraintError(message, error))
        return this
    }
}
