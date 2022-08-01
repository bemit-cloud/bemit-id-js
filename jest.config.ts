import type { Config } from '@jest/types'

const base: Partial<Config.InitialOptions> = {
    /*transformIgnorePatterns: [
        'node_modules/?!(@ui-schema)',
    ],*/
    transform: {
        // '^.+\\.ts$': 'babel-jest',
        '^.+\\.ts$': 'ts-jest',
    },
    /*extensionsToTreatAsEsm: ['.ts'],
    globals: {
        'ts-jest': {
            useESM: true,
        },
    },*/
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',// todo: validate ESM testing (and JSDom/react compat.), somehow this mapper was all needed - no further ts-jest/babel adjustments
        '^@bemit/cloud-id(.*)$': '<rootDir>/src$1',
    },
    moduleFileExtensions: [
        'ts',
        'tsx',
        'js',
        'jsx',
        'json',
        'node',
    ],
    collectCoverage: true,
    coveragePathIgnorePatterns: [
        '(tests/.*.mock).(jsx?|tsx?|ts?|js?)$',
    ],
    verbose: true,
}

const config: Config.InitialOptions = {
    ...base,
    projects: [{
        displayName: 'test',
        ...base,
        moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
        testMatch: [
            '<rootDir>/src/**/*.(test|spec).(js|ts)',
            '<rootDir>/tests/**/*.(test|spec).(js|ts)',
        ],
    },
        {
            displayName: 'lint',
            runner: 'jest-runner-eslint',
            ...base,
            testMatch: [
                '<rootDir>/src/**/*.(js|ts)',
                '<rootDir>/tests/**/*.(test|spec|d).(js|ts)',
            ],
        },
    ],
    coverageDirectory: '<rootDir>/coverage',
}

export default config
