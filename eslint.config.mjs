import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // チェック対象外のファイル・ディレクトリ
    ignores: ['node_modules/**', 'cdk.out/**', '**/*.d.ts', '**/*.js', 'jest.config.js'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // TypeScriptファイルに対するルール設定
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
);
