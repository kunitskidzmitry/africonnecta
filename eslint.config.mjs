import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// eslint-config-next 16 отдаёт готовый flat-конфиг, прослойка FlatCompat не нужна.
const eslintConfig = [
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Локализованные маршруты обязаны идти через обёртки из @/i18n/navigation,
      // иначе ссылки потеряют префикс локали.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/link',
              message: 'Используй Link из @/i18n/navigation.',
            },
            {
              name: 'next/navigation',
              importNames: ['redirect', 'usePathname', 'useRouter'],
              message: 'Используй обёртки из @/i18n/navigation.',
            },
          ],
        },
      ],
    },
  },
  {
    // Сами обёртки и layout обязаны импортировать исходники напрямую.
    files: ['src/i18n/**', 'src/proxy.ts', 'src/app/**/layout.tsx'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];

export default eslintConfig;
