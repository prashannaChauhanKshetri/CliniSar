// ESLint finds likely mistakes; Prettier (separate tool) handles formatting.
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettier, // must be last: switches off rules that fight with Prettier
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Route tables and test helpers are not components; fast refresh does not apply.
    files: ['src/routes/router.tsx', 'src/test/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
)
