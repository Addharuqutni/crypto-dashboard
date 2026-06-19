# VPS Production Deployment

Target: Ubuntu VPS, Node.js 22+, PM2, Nginx reverse proxy, local file storage for screener data.

## 1. Server packages

```bash
sudo apt update
sudo apt install -y git curl nginx ufw python3-venv python3-pip

# Download the NodeSource setup script, inspect it if required, then run it.
sudo bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2. App setup

```bash
cd /var/www
git clone <your-repo-url> crypto-dashboard
cd crypto-dashboard
cp deploy/vps.env.example .env.local
nano .env.local
```

Recommended VPS values:

```env
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1
SCREENER_STORAGE_MODE=file
SCREENER_STORAGE_BACKEND=file
SCREENER_REQUIRE_DATABASE=0
SCREENER_FILE_MODE_STRICT=1
DISABLE_SCREENER_SCHEDULER=1
SCREENER_SYMBOLS=
SCREENER_MAX_SYMBOLS=100
SCREENER_MAX_CONCURRENT_SYMBOLS=3
SCREENER_CANDLE_LIMIT=120
BASIC_AUTH_ENABLED=1
BASIC_AUTH_USER=admin
BASIC_AUTH_PASSWORD=<long-random-password>
```

## 3. Build and start

```bash
chmod +x deploy/deploy-vps.sh
./deploy/deploy-vps.sh
```

Manual equivalent:

```bash
npm ci
npm run check
npm run build
npm run screener -- --once
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup`.

## 4. Nginx reverse proxy

```bash
sudo cp deploy/nginx.crypto-dashboard.conf /etc/nginx/sites-available/crypto-dashboard
sudo nano /etc/nginx/sites-available/crypto-dashboard
sudo ln -sf /etc/nginx/sites-available/crypto-dashboard /etc/nginx/sites-enabled/crypto-dashboard
sudo nginx -t
sudo systemctl reload nginx
```

Replace `example.com` with your domain.

## 5. HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com
```

## 6. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Do not expose port `3000` publicly. Nginx proxies to `127.0.0.1:3000`.

## 7. Operations

```bash
pm2 status
pm2 logs crypto-dashboard-web
pm2 logs crypto-dashboard-screener
pm2 restart crypto-dashboard-web
pm2 restart crypto-dashboard-screener
```

Data files:

```text
data/screener/latest.json
data/screener/history.jsonl
data/screener/alerts.jsonl
data/screener/settings.json
```

## 8. Update deploy

```bash
cd /var/www/crypto-dashboard
git pull
./deploy/deploy-vps.sh
```

## Notes

- `crypto-dashboard-web` serves the Next.js standalone app.
- `crypto-dashboard-screener` runs continuously and writes `data/screener/latest.json`.
- `/api/screener` reads local file storage in production.
- `scripts/start-prod.mjs` copies `.next/static` and `public` into standalone before start, so CSS/JS assets load correctly.
