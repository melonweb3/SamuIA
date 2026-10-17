import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
export default ts.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '.local/**',
      'test-results/**',
      'playwright-report/**',
      'coverage/**',
      'downloads/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
);
