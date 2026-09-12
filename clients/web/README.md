# College — Web console

The React client of College ERP: the back office for platform administrators and each
college's administrators, heads of department and coordinators.

- React 19, TypeScript, Vite, Vitest. No component framework.
- Talks to the one backend in `server/`; holds no business rules of its own.
- Students and faculty use the Flutter app at the repository root instead (AD-24).

## Why it lives here

This directory was `web/` until it was moved (AD-54). Flutter treats `<project>/web/` as its own
web target, and the Flutter project is the repository root, so a React app at `web/` was being
built into a Flutter Web bundle with `node_modules` copied into it. There is no Flutter Web client.
Do not move this back to `web/`.

## Commands

Run from this directory.

```
npm install
npm run dev         # development server
npm run typecheck   # tsc
npm test            # vitest
npm run build       # production bundle into dist/
```

The API address comes from `VITE_API_URL`, defaulting to `http://localhost:3000`.
