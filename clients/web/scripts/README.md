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

The signed-in probe can exercise bounded UI states against a local seeded API:

```sh
VISUAL_STATE=loading REQUIRE_SIGNED_IN=1 npm run visual-check
VISUAL_STATE=empty REQUIRE_SIGNED_IN=1 npm run visual-check
VISUAL_STATE=error REQUIRE_SIGNED_IN=1 npm run visual-check
```

`loading` delays module requests, `error` returns forced 503 responses for
module requests, and `empty` returns empty arrays for the known collection
endpoints. Authentication, permissions, and object-shaped responses remain
real. These modes are bounded visual probes; they do not replace a complete
screen-by-screen empty-state review. Use a seeded persona and local API when
running them, and keep `REQUIRE_SIGNED_IN=1` enabled so an authentication
failure cannot be mistaken for a captured module state.

Screenshots are written to ignored `clients/web/artifacts/visual-check/`.
The script records browser page errors and console errors as a failing result.
