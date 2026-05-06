module.exports = {
  root: true,
  ignorePatterns: [],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.json'],
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended'
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.test.ts', '*.test.tsx'],
      parserOptions: {
        project: ['./tsconfig.json']
      }
    }
  ]
};