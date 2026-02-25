import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

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
    plugins: {
      sonarjs,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      // 認知的複雑度が15を超えた場合に警告
      'sonarjs/cognitive-complexity': ['warn', 15],
      // 重複文字列リテラルを警告
      'sonarjs/no-duplicate-string': 'warn',
    },
  },
);
