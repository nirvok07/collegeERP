# Web visual check

With the web dev server running, the standing check captures the signed-out
screen:

```sh
npm run visual-check
```

To capture a seeded signed-in session and every reachable navigation section,
provide the seed persona and require the session:

```sh
COLLEGE_CODE=... COLLEGE_IDENTIFIER=... OTP_CODE=123456 \
REQUIRE_SIGNED_IN=1 npm run visual-check
```

Screenshots are written to ignored `clients/web/artifacts/visual-check/`.
The script records browser page errors and console errors as a failing result.
