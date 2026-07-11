# Authentication Access and Session Persistence Design

**Date:** 2026-07-11  
**Status:** Approved

## Objective

Make sign-in easy to find for returning users and prevent valid users from being logged out when they close and reopen Alpha Nova in either a browser or the installed app.

## Login Access

Guests receive separate, clearly labelled actions for returning and new users:

- The marketing homepage header shows **Log in** and **Open Terminal**.
- The in-app guest banner shows **Log in** alongside **Create free account**.
- The desktop/mobile sidebar footer shows **Log in** alongside **Create free account**.
- The Settings account panel shows both actions when signed out.

All login links use `/login`; signup links retain `/login?mode=signup`. Existing authenticated-user UI remains unchanged.

## Session Restoration

- Successful login and signup continue storing the opaque session token and cached public user in persistent `localStorage`.
- After successful authentication, the client requests persistent browser storage when the Storage API supports it. Failure or denial is harmless.
- App startup renders a cached user immediately when a token and cached user are present.
- Background validation calls `/api/auth/me` using the stored token.
- Network failures, timeouts, and server errors never clear a locally cached session.
- A definitive `401` or `403` is retried with short backoff before the client removes the token and cached user. This protects users from transient serverless/blob synchronization races while still rejecting genuinely invalid or expired sessions.
- A missing token continues to mean signed out. Explicit logout immediately clears local credentials after the best-effort server revocation call.

## Backend Contract

The existing backend contract remains unchanged:

- Sessions expire after 30 days.
- `/api/auth/login` and `/api/auth/signup` return `{ token, user }`.
- `/api/auth/me` returns the current user or `401`.
- `/api/auth/logout` revokes the server session.

No password format, user record, or stored account data changes are required.

## Error Handling

- Authentication-form errors remain visible on the login page.
- Session validation retries only definitive authorization failures; it does not loop indefinitely.
- Storage API and `localStorage` exceptions are handled without crashing the app.
- When all validation attempts return `401/403`, the user is signed out and can use the newly visible login action.

## Testing

- Verify every guest surface exposes a returning-user login link.
- Verify login and signup persist token and user data.
- Verify remount/reopen restores the cached session.
- Verify network and `5xx` validation failures retain the session.
- Verify an initial `401/403` followed by success retains the session.
- Verify repeated `401/403` responses clear the session.
- Verify explicit logout clears the session.
- Run targeted frontend linting, authentication backend tests, and the production build before deployment.

## Out of Scope

- Replacing SQLite/Vercel Blob with a new authentication database.
- Migrating to cookies, OAuth, or stateless JWT authentication.
- Password reset and email verification flows.
