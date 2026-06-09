# Deploy Guide — Convention Platform

Target: a fresh **Ubuntu 22.04/24.04** VPS with a sudo user and a **domain** whose
DNS you control. Everything below is copy-paste. Replace `YOUR_DOMAIN` and the
`STRONG_*` placeholders as you go.

---

## 0. DNS (do this first so TLS works later)
Point your domain at the server's public IP:
```
A     @     <SERVER_PUBLIC_IP>
A     www   <SERVER_PUBLIC_IP>
```
(If you'll proxy through Cloudflare, you can do that after step 6 instead.)

## 1. Get the code on the server
```bash
sudo mkdir -p /opt/convention && sudo chown "$USER" /opt/convention
git clone <YOUR_REPO_URL> /opt/convention
cd /opt/convention
git checkout claude/optimistic-euler-jesbze   # or main once merged
```

## 2. Provision (Node 26, PM2, nginx, Postgres 18, build)
```bash
sudo bash infra/deploy/setup.sh
```

## 3. Create the database
```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE convention LOGIN PASSWORD 'STRONG_DB_PASSWORD';
CREATE DATABASE convention OWNER convention;
SQL
```

## 4. Configure the environment
```bash
sudo cp infra/deploy/convention.env.example /etc/convention.env
sudo nano /etc/convention.env     # set YOUR_DOMAIN, the DB password, and:
#   JWT_SECRET           -> run: openssl rand -hex 48
#   SETTINGS_MASTER_KEY  -> run: openssl rand -hex 32
sudo chmod 600 /etc/convention.env
```

## 5. Schema, seed, and superusers
```bash
cd /opt/convention
set -a; source /etc/convention.env; set +a   # load DB creds for these one-off commands
npm run db:migrate -w server                 # create tables
npm run db:seed    -w server                 # default theme/nav/tickets/etc.
SUPERUSER_PASSWORD='4rfv$RFV' npm run db:seed:superusers -w server
```

## 6. Start the app under PM2
```bash
cd /opt/convention
pm2 start ecosystem.config.cjs    # reads /etc/convention.env automatically
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME"   # run the printed command if it asks
curl -s localhost:4000/api/v1/health          # -> {"ok":true,...}
```

## 7. nginx reverse proxy + HTTPS
```bash
sudo cp infra/deploy/nginx.conf /etc/nginx/sites-available/convention
sudo sed -i "s/YOUR_DOMAIN/your-real-domain.com/g" /etc/nginx/sites-available/convention
sudo ln -sf /etc/nginx/sites-available/convention /etc/nginx/sites-enabled/convention
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d your-real-domain.com -d www.your-real-domain.com
```
Visit `https://your-real-domain.com` — the site loads, dark mode by default.

## 8. Firewall (BotBlock watcher + ufw)
```bash
# Allow web + SSH, enable the firewall:
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw --force enable

# BotBlock iptables watcher (instant blocking) + reconcile cron:
sudo cp infra/botblock-firewall/botblock-watcher.sh /usr/local/bin/botblock-watcher
sudo cp infra/botblock-firewall/botblock-sync.sh    /usr/local/bin/botblock-sync
sudo cp infra/botblock-firewall/botblock-manual.sh  /usr/local/bin/botblock-manual
sudo chmod +x /usr/local/bin/botblock-*
sudo cp infra/botblock-firewall/botblock-watcher.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now botblock-watcher

cat <<CRON | sudo tee /etc/cron.d/botblock
*/5 * * * * root PGHOST=localhost PGUSER=convention PGPASSWORD=STRONG_DB_PASSWORD PGDATABASE=convention /usr/local/bin/botblock-sync >> /var/log/botblock.log 2>&1
CRON
```

## 9. Enter the third-party keys (in the live admin)
Log in at `https://your-real-domain.com/admin/login` as `forthefansfest@gmail.com`,
go to **Settings**, and fill in:
- **Stripe:** publishable key, secret key, currency. Then in the Stripe dashboard add a
  webhook to `https://your-real-domain.com/api/v1/webhooks/stripe` and paste the
  signing secret (`whsec_…`) back into Settings.
- **SendGrid:** API key, verified from-address/name. Complete domain authentication
  (SPF/DKIM DNS records SendGrid gives you). For the inbox, point an MX subdomain at
  SendGrid Inbound Parse → POST URL
  `https://your-real-domain.com/api/v1/webhooks/sendgrid-inbound?token=<inbound secret>`
  and set the same secret in Settings.
- **Cloudflare Stream:** account id + Stream API token. Then **Admin → Livestream →
  Create live input** to get the RTMPS URL + key for your encoder.
- **Optional:** reCAPTCHA site key + secret (turns on form spam protection).
Then **Theme & Branding**: upload logos/favicon/OG image; **Show Info / Page Builder /
Guests / Floor Plan / Products**: enter real event content.

## 10. Backups
```bash
echo 'BACKUP_KEY=STRONG_BACKUP_PASSPHRASE' | sudo tee /etc/botblock-backup.env >/dev/null
cat <<CRON | sudo tee /etc/cron.d/convention-backup
0 * * * * root BACKUP_KEY=STRONG_BACKUP_PASSPHRASE BACKUP_DIR=/var/backups/convention DATABASE_URL='postgresql://convention:STRONG_DB_PASSWORD@localhost:5432/convention' /opt/convention/infra/backup.sh >> /var/log/convention-backup.log 2>&1
CRON
# test a restore into a scratch DB monthly (see infra/restore.sh)
```

---

## Redeploys (new code)
```bash
cd /opt/convention && git pull
npm ci && npm run build -w client
npm run db:migrate -w server        # schema is idempotent
pm2 reload ecosystem.config.cjs     # zero-downtime
```

## Quick checks
```bash
pm2 status && pm2 logs convention-api --lines 50
sudo systemctl status botblock-watcher
sudo botblock-manual count
curl -sI https://your-real-domain.com | grep -i strict-transport-security
```

## Notes
- The Node app serves the SPA **and** injects per-route OG/Twitter meta, so social
  previews work without a separate prerenderer.
- PM2 runs **one** instance on purpose (in-process singletons: hold-release job,
  BotBlock cache, chat fan-out). To scale out, move those to Redis/pg-boss and
  switch the ecosystem to cluster mode.
- Rotate the seeded superuser password after first login (Admin → Users & Roles).
