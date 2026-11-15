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

**Note:** The default frontend uses root-relative `/app.js`, `/styles.css`, and `/api/scores`. For a subdirectory deployment, either host SportsMania on a dedicated subdomain or add corresponding Nginx routes for those three paths (and adjust the asset paths if those paths are already used). A dedicated subdomain is recommended to avoid collisions.

## Data source and refresh

Server fetches ESPN public scoreboard endpoints and caches for 12 seconds; browser polls every 15 seconds while visible. Scores may be delayed. ESPN's undocumented public endpoints can change or become unavailable, and may not be suitable for commercial/production use. Replace with a licensed data provider for production guarantees. This site is unofficial and not affiliated with ESPN or any league.

## GitHub workflow

This project is committed to `Potteh/sportsmania`. Future changes made through GitHub connector can be committed on request. For local development use `git add . && git commit -m "Describe change" && git push origin main`; scores themselves update from the API without Git commits.
