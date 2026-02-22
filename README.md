# EveGridScout (Server)

A simple server to listen for EveGridScout data and report on pilots and ships seen so far

## Discord Web Authentication

GridScout web log views now require Discord OAuth login.

### Required environment variables

- `SECRET_TOKEN`: Discord bot token (required for shared-guild access checks)
- `DISCORD_CLIENT_ID`: Discord OAuth2 application client ID
- `DISCORD_CLIENT_SECRET`: Discord OAuth2 application client secret
- `DISCORD_OAUTH_REDIRECT_URI`: OAuth callback URL, for local development:
  - `http://localhost:3000/auth/discord/callback`
- `DISCORD_TOKEN_CACHE_TTL_SECONDS`: TTL for cached hashed ingest tokens (default `900`)
- `TRUST_PROXY`: Set to `true` when running behind reverse proxy/TLS termination (e.g. Nginx) so secure cookies use forwarded HTTPS protocol.

### OAuth scopes

- `identify`
- `guilds`
- `guilds.members.read`

### Protected routes

- `/`
- `/errors`
- `DELETE /key/:key`
- `POST /api/errors/clear`

Users must be authenticated with Discord and share at least one guild with the running GridScout bot to access protected routes.

## Discord event configuration commands

Guild admins can configure notifications with:

- `/set-event-channel` - Set the target Discord channel for notifications
- `/enable-event` - Enable a GridScout event notification type
- `/disable-event` - Disable a GridScout event notification type
- `/show-config` - Show current GridScout guild config

## Report ingest identity

GridScout report requests must include `Authorization: Bearer <DiscordToken>`.
The server hashes the bearer token and resolves reporter identity by calling Discord `/users/@me` on cache miss.

## Report ingest authentication

- The server receives a bearer token from the `Authorization` header.
- It computes a SHA-256 hash of the token and checks an in-memory cache.
- On cache miss, it validates token against Discord and resolves `DiscordUserId`.
- Cache entries store only `tokenHash -> discordUserId` with expiry.
- Invalid/expired tokens are rejected with HTTP `401`.

## Diagnostics

- `GET /admin/diagnostics` - Protected diagnostics view with recent audit activity
- `POST /api/diagnostics/audit/clear` - Protected endpoint to clear audit logs

## Discord API resilience

- Authorization and notification Discord API calls use retry with exponential backoff for transient failures.
- Viewer role authorization can temporarily fall back to recent cached results when Discord APIs are unavailable.
- In-memory caches are bounded and pruned to avoid unbounded growth during sustained traffic.
