import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

const config = [
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      // Standalone packages and fixture scripts with their own tooling.
      'tools/**',
      'test/fixtures/**',
    ],
  },
  {
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // CLI scripts and test harness report progress on stdout.
    files: ['scripts/**', 'test/**', 'e2e/**'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
