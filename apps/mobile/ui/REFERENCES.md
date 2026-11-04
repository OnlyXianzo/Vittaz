# UI preview references

Verified while building this package on 2026-11-04. Dependency versions are
pinned in `package.json` and `package-lock.json`.

## Visual specification

- Supplied mock: `Khataclaw app UI.html` (13 screens, 390×844 device frame).
- Extracted screen markup used as the visual source of truth during
  implementation.
- Plus Jakarta Sans font files and SIL Open Font License text were extracted
  from the supplied mock bundle into `public/fonts/`.

## Official documentation

- Vite guide — https://vite.dev/guide/ — Vite 8, Node 20.19+/22.12+ baseline.
- Vite server options — https://vite.dev/config/server-options — `host`,
  `allowedHosts`, `strictPort`.
- React `createRoot` — https://react.dev/reference/react-dom/client#createRoot —
  single root + StrictMode.
- Lucide React — https://lucide.dev/guide/react/ — tree-shakable typed SVG icons.
- Vitest guide — https://vitest.dev/guide/ — Vitest 5, Vite peer range,
  coverage-v8 usage.
- Testing Library React intro —
  https://testing-library.com/docs/react-testing-library/intro — role/label
  queries and `@testing-library/dom` peer.
- Playwright browsers — https://playwright.dev/docs/browsers — Chromium install
  and `--with-deps`.
- Playwright web server — https://playwright.dev/docs/test-webserver —
  `webServer`, `baseURL`, `reuseExistingServer`.
- ESLint flat config —
  https://eslint.org/docs/latest/use/configure/configuration-files — flat config
  arrays, `files`, `ignores`.
- typescript-eslint getting started — https://typescript-eslint.io/getting-started/
  — `tseslint.configs.recommended` with flat config.

## Pinned toolchain highlights

- react / react-dom 19.3.1
- vite 8.3.5, @vitejs/plugin-react 6.2.1
- typescript 5.9.3
- vitest / @vitest/coverage-v8 5.1.0
- @playwright/test 1.64.1
- eslint 10.14.0, typescript-eslint 8.72.1
- prettier 3.9.10
- lucide-react 1.68.0

`overrides.minimatch` is pinned to 11.0.1 to keep `npm audit` clean without
downgrading ESLint.
