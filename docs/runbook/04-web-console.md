# 4. Web console

The browser console in `clients/web/` (React, Vite). It uses the same API as the apps.

## Start it

```bash
cd clients/web
npm install          # once
npm run dev          # http://localhost:5173
```

It calls the API at `http://localhost:3000` unless told otherwise. To point it elsewhere:

```bash
VITE_API_URL=http://192.168.1.20:3000 npm run dev
```

The API only accepts browser calls from the origins in `CORS_ORIGINS` (`server/.env`). The default
covers `http://localhost:5173` and `http://localhost:4173`; add any other address you open the
console on, then restart the server.

## Signing in

- **College accounts** (administrators, teachers): the sign-in page asks for the college code,
  email and password.
- **Invitations**: `/accept-invite`, with the college code and the invitation (or password reset)
  code from the message the person was sent.
- **Platform accounts** (Owner, Support): behind the "platform sign-in" link, with a password and an
  authenticator code. Everything the platform console does is also in the Super Admin app; retiring
  the web platform console is an open decision (OD-AD72-1).

## Other commands

```bash
npm run build        # production bundle in dist/
npm run preview      # serves dist/ on http://localhost:4173
npm test             # unit tests (Vitest)
npm run typecheck
npm run lint
```
