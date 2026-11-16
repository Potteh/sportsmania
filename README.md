# SportsMania

Responsive live sports scoreboard for NFL, NBA, MLB, NHL, NCAA Football, NCAA Men's Basketball, WNBA, MLS, Premier League and Champions League.

## Ubuntu install

Requires Node.js 20+.

```bash
git clone https://github.com/Potteh/sportsmania.git
cd sportsmania
npm start
```

Open http://YOUR_SERVER_IP:3100

Run in background with PM2:

```bash
sudo npm install -g pm2
pm2 start server.js --name sportsmania
pm2 save
pm2 startup
```

## Nginx reverse proxy (subdirectory)

To serve at `/sportsmania/` from an existing Nginx server block:

```nginx
location = /sportsmania { return 301 /sportsmania/; }
location /sportsmania/ {
    proxy_pass http://127.0.0.1:3100/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

**Subdirectory support is built in:** the frontend uses relative asset URLs and resolves its API endpoint against the current page URL, so both `/` and `/sportsmania/` work without editing files. Keep the trailing slash redirect shown above. This also preserves `/project1/` and the existing `location /` app.

## Data source and refresh

Server fetches ESPN public scoreboard endpoints and caches for 12 seconds; browser polls every 15 seconds while visible. Scores may be delayed. ESPN's undocumented public endpoints can change or become unavailable, and may not be suitable for commercial/production use. Replace with a licensed data provider for production guarantees. This site is unofficial and not affiliated with ESPN or any league.

## GitHub workflow

This project is committed to `Potteh/sportsmania`. Future changes made through GitHub connector can be committed on request. For local development use `git add . && git commit -m "Describe change" && git push origin main`; scores themselves update from the API without Git commits.

## Updating an existing VPS checkout

If you previously edited `public/app.js` or `public/index.html` locally to hard-code `/sportsmania/` paths, save your changes first and discard **only those two local path edits** before pulling this update. For example, inspect `git diff` and then run `git restore public/app.js public/index.html` **only if the diff contains no other work you want to keep**; otherwise use `git stash push -u`, pull, and selectively restore your unrelated changes. Then run `git pull --ff-only origin main` and `pm2 restart sportsmania`. Do not blindly `git stash pop` old subdirectory path edits, since the repository now handles paths automatically.

## Play-by-play

Expand **Play-by-play** on any game card to fetch the event's ESPN summary feed through `/api/plays?league=NFL&id=EVENT_ID`. The feed shows recent events newest first, game period, clock, scoring plays and score when available. It caches for 12 seconds; click **Refresh plays** to request an updated feed. Availability and completeness vary by sport and event, and the panel clearly reports when no play-by-play is supplied. This endpoint is unofficial and subject to provider changes.

## Expanded features
- **Game Center:** expandable team and player statistics from ESPN game summaries.
- **News:** league-specific ESPN headlines, linked to their sources.
- **Standings:** ESPN standings, where the league provides them.
- **Predictions:** clearly labeled illustrative pregame win percentages from win-loss records, not a calibrated prediction or betting model. Unavailable when records are missing.
- **Game chat:** public, nickname-based, per-event polling chat. Stored in `data/chat.jsonl`; 3-second IP rate limit and 400-character message cap. This is a basic prototype: add authentication, moderation, retention policy, spam protection, and reverse-proxy rate limiting before opening to a large public audience. Chat messages are publicly visible and persist across restarts.
- **Calendar:** downloadable .ics calendar for the selected league and date.
- **Odds:** displays odds only when the ESPN scoreboard provides them. No fabricated lines or historical movement data. Historical line movement requires a separately licensed provider and historical storage.
All features use built-in Node.js APIs with no new npm dependencies. The site's relative URLs remain compatible with `/sportsmania/` behind Nginx.

## Alerts, moderation and player comparison
- **Favorite alerts:** opt-in browser notifications when a followed team's game state or score changes while SportsMania is open and polling. Browser permission and HTTPS required. No background push service.
- **Scoring timeline:** game summary scoring events, when available.
- **Player comparison:** select two reported player stat lines in an expanded Game Center to compare. Comparisons are textual and source data may be incomplete.
- **Chat moderation:** users can report messages. An operator can review reports and ban/unban or mute/unmute nicknames through `POST /api/moderation` with header `X-Admin-Token` matching `SPORTSMANIA_ADMIN_TOKEN`. Set a long random token in your PM2 environment; never commit it. Example JSON: `{"action":"list"}`, `{"action":"ban","name":"nickname"}`, `{"action":"mute","name":"nickname","minutes":60}`. Reports and actions persist in `data/moderation.json`. Public messages disallow links and enforce basic rate limits.
- **Security warning:** nickname-based moderation is easily evaded. For a public community, add account authentication, IP-level abuse controls, administrator UI, moderation audit logs and a retention policy before relying on chat for production use.

## Moderator dashboard and background push
- Open `/sportsmania/admin.html`. Enter the `SPORTSMANIA_ADMIN_TOKEN` set on the server. The token is kept in page memory only, not saved in localStorage. The dashboard supports viewing reports, dismissing/deleting messages, banning and muting nicknames.
- Background notifications use the `web-push` npm package, service worker, and VAPID keys. Run `npm install`, then `npx web-push generate-vapid-keys`. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:YOUR_EMAIL` in the PM2 process environment, and restart with `pm2 restart sportsmania --update-env`. Do not commit the keys.
- Push subscriptions are stored in `data/push.json`. The server checks followed leagues every 30 seconds and sends score/state-change alerts only after it has seen an earlier snapshot. Browser must allow notifications and the site must use HTTPS. Delivery depends on browser push services. The worker scope is `/sportsmania/`.
- Player comparisons now show paired bars for each statistic. Cross-category comparisons are descriptive rather than statistically meaningful.
- This is still a prototype: public chat needs authenticated identities, durable deletion semantics, stronger abuse controls and a retention/privacy policy before large-scale deployment.

## WebSockets and account-based chat
- `ws` serves a same-origin WebSocket endpoint at `/sportsmania/ws` (upstream `/ws`). Scoreboards receive server updates roughly every 12 seconds, with HTTP polling fallback. Chat posts broadcast instantly to connected clients.
- Account creation/login via `/api/auth`, using scrypt password hashes with random salts. Passwords are never stored in plaintext. Accounts persist in `data/accounts.json`. Session bearer tokens are kept in browser sessionStorage and server memory; sessions expire after seven days and reset on process restart.
- Sending chat now requires a registered account. Existing historical nickname messages remain readable. Moderators can ban/unban and mute/unmute accounts from the dashboard; nickname moderation remains for legacy messages.
- Nginx must forward WebSocket upgrade headers for the SportsMania location. Add `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";` to its existing `location /sportsmania/` block. Preserve existing proxy_pass path rewriting.
- Production hardening still needed: stronger per-account and per-IP rate limits, persistent sessions/revocation, email verification, password reset, CSRF and security headers, audit logs, durable moderation deletion and database migrations. Do not treat this as production-grade identity management.
