## Quick Project Overview
- **Type**: Node.js + Express REST API (single-file service: `index.js`).
- **DB**: MongoDB (MongoDB Atlas via `MONGODB_URI`).
- **Auth**: Firebase Auth verified with `firebase-admin` (JWT verification through `verifyJWT`).
- **Payments**: Stripe Checkout used for membership payments (`STRIPE_SECRET_KEY`).

## Key Collections
- `users` — stores users with `email`, `role` (`member`, `clubManager`, `admin`) and timestamps.
- `clubs` — club documents, include `managerEmail`, `status` (`pending`, `approved`, `rejected`), `createdAt`, `updateAt`.
- `memberships` — membership records linking `memberEmail` to `clubId`, `status` `active` or `expired`.
- `events` — events with `clubId`, `clubName`, timestamps and `date` fields.
- `event_registrations` — registrations with `eventId`, `userEmail`, `status` `registered`.
- `payments` — stripe payments stored after success.

## Major Patterns & Conventions
- Single entrypoint: `index.js` contains routes, DB setup, middleware, and business logic — prefer clear, minimal changes here.
- JWT verification: Always use `verifyJWT` middleware for authenticated endpoints. It expects an `Authorization: Bearer <idToken>` header issued by Firebase Auth.
- Role checks: `verifyADMIN` and `verifyClubManager` inspect `users` collection by token email. For new roles, add the middleware pattern and check `req.tokenEmail`.
- Prevent updating `_id`: Patch routes sanitize `_id` fields before `$set` to avoid accidental ObjectId changes.
- Dates: store timestamps as ISO string: `new Date().toISOString()`.

## Environment / Secrets
- `.env` keys used: `CLIENT_DOMAIN`, `MONGODB_URI`, `STRIPE_SECRET_KEY`, `FB_SERVICE_KEY` (base64 serialized JSON), `PORT`.
- `FB_SERVICE_KEY` expects a base64 encoded `serviceAccountKey.json` (helper script: `serviceKeyConverter.js`). To create it locally:
```
node serviceKeyConverter.js  # prints base64 string for env; manual step
```
- Do not commit raw JSON service account or credential keys.

## Running and Debugging
- Install: `npm ci` or `npm install`.
- Dev mode (automatic restarts): `npm run dev` (nodemon watches `index.js`).
- Start production: `npm start`.
- Tools: Use Postman/HTTP client; all routes are RESTful with JSON payloads.

## Common Endpoints & Examples
- Auth: attach Firebase ID token as HTTP header — `Authorization: Bearer <idToken>`.
- Create club (clubManager): `POST /clubs` with body `name`, `location`, etc.; requires `verifyJWT` + `verifyClubManager`.
- Get member's events: `GET /member/my-events?email=user@example.com`.
- Payment flow: `POST /create-checkout-session` returns `url` to stripe checkout; after frontend redirect, call `POST /payment-success` with `{ sessionId }`.

## Coding Agent Guidance
- Touch only `index.js` by default — this is a compact project, so keep changes localized and minimal.
- Always follow the established middleware patterns (`verifyJWT` + role middleware) when protecting endpoints.
- Re-use collection variables (`usersCollection`, `clubsCollection`, etc.) declared in `run()` scope to avoid repeated `db.collection()` calls.
- Use `ObjectId` conversion when building `_id` queries (e.g., `new ObjectId(id)`) and never try to write raw ObjectId values as plain strings.
- When adding DB writes, use timestamps (`createdAt`, `updatedAt`) and `status` fields as used elsewhere.
- Avoid leaking credentials; use `.env` and set `FB_SERVICE_KEY` to a base64-encoded value instead of committing JSON.

## Testing and Validation
- No test harness included — use integration testing via Postman or external scripts.
- For Stripe flow, use Stripe test keys and ensure `STRIPE_SECRET_KEY` is set.
- Verify Firebase tokens with the real `FB_SERVICE_KEY` base64 value in `.env`.

## Files to Reference
- `index.js` (main API, routes, middleware)
- `package.json` (scripts and dependencies)
- `serviceKeyConverter.js` (base64 helper for `FB_SERVICE_KEY`)
- `.env` (environment configuration — do not commit secrets)

If anything here looks incomplete or confusing, tell me what you want clarified and I will iterate.

## Gotchas & Known Oddities
- Some endpoints use query string parameters instead of path params (`member/my-events?email=`).
- A few code paths log values and don't always return a response (search for `console.log()` + routes). Confirm response consistency when adding endpoints.
- The code is a compact single-file API — prefer minimal, focused edits and avoid large refactors unless requested.
