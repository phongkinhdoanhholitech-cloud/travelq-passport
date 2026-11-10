# TravelQ Passport / Global Travel ID (demo)

ICAO ID-3 sized digital ID card (125×88 mm) + Express/SQLite test server with **AES-256-GCM at-rest encryption**.

## Quick start (test box)

```bash
cd server
cp .env.example .env   # set TRAVELQ_DATA_KEY + TRAVELQ_HMAC_SECRET (64 hex chars each)
npm install
npm start              # http://0.0.0.0:8787
```

- App: http://127.0.0.1:8787/
- Reader: http://127.0.0.1:8787/reader.html

Optional public HTTPS (on a machine with open egress):

```bash
./bin/cloudflared tunnel --url http://127.0.0.1:8787
```

> Note: Cloudflare quick tunnels may fail inside restricted sandboxes (TLS to edge blocked). Run `cloudflared` on Holitech’s VPS or your laptop instead.

## Card design
- Aspect ratio **125:88** (ICAO ID-3 passport data page).
- Dark teal glassy card with guilloche/rosette, TravelQ logo, chip + contactless, holder name, nationality · issue date, passport no, white QR.
- **CCCD never shown on the card** and never encoded in the QR.
- PNG export resampled to **1476×1039 px** (≈300 dpi for 125×88 mm). Print CSS forces `125mm × 88mm`.
- QR rendered as **SVG** (Safari-safe; fixes blank QR issues from canvas/table libs).

## ID & QR
- ID format: `TQ` + 9 digits, displayed `TQ 565 240 199`.
- QR payload: `TQ565240199.<10-char HMAC>` (base64url). Reader verifies signature when present; bare ID still works for lookup.
- Server generates a unique ID on **Lưu hồ sơ**.


## Embedding in the TravelQ app

The passport page is designed to run inside the TravelQ mobile WebView (and also standalone in a browser).

**Pass the signed-in account in** (do not mint a new ID):

- Query string: `https://travelq-passport.onrender.com/?id=017715&name=Dinh%20Dinh`
- JavaScript bridge: `window.TravelQ.setAccount({ id: '017715', name: 'Dinh Dinh' })`
- `postMessage` to the page: `{ type: 'travelq:setAccount', id: '017715', name: 'Dinh Dinh' }`

The host may also read `window.TravelQ.getAccountId()` and `window.TravelQ.getQrPayload()`.

**Close after a successful save.** The result screen shows the digital ID card, a success message, a close (×) control and a **Xong** button. Tapping either dismisses the success chrome and returns to the normal home screen with the updated card still visible. The page also notifies the native host so it can close the WebView if it wants:

- `window.parent.postMessage({ type: 'travelq:close' }, '*')` (and the same payload on `window` itself)
- If present, `window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'travelq:close' }))`
- If the host assigned a hook, `window.TravelQ.onClose()` is called

Example (native / WebView):

```js
window.TravelQ.onClose = () => {
  // close the WebView or pop the screen
};
window.addEventListener('message', (ev) => {
  if (ev.data && ev.data.type === 'travelq:close') {
    // same close action
  }
});
```

## Encryption (server)
- Env `TRAVELQ_DATA_KEY` = 32-byte key (64 hex chars).
- Record JSON (`id,name,cccd,passportNo,nationality,issueDate,photoDataUrl,savedAt`) encrypted with **AES-256-GCM** (random IV).
- Stored in SQLite (`server/data/travelq.sqlite`) as `{id, iv, ciphertext, alg, …}` only — **no plaintext PII in DB**.
- No PIN/password in the UI (in-app profile update + reader software).

## API
| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/health` | liveness |
| POST | `/api/records` | body: name, cccd, passportNo, nationality, issueDate, photoDataUrl? → `{id, displayId, qrPayload}` |
| GET | `/api/records/:idOrPayload` | decrypts; optional `X-API-Key` if `TRAVELQ_API_KEY` set |

## Deploy on Holitech server
1. Copy this folder (or git pull); install Node 20+.
2. Set env (systemd/Docker):
   - `TRAVELQ_DATA_KEY` — generate once (`openssl rand -hex 32`), store in KMS/secrets manager in production.
   - `TRAVELQ_HMAC_SECRET` — separate HMAC secret for QR signatures.
   - `TRAVELQ_API_KEY` — **recommended** for the Reader app so random people with an ID cannot scrape PII.
   - `PORT`, `NODE_ENV=production`
3. Put TLS terminator (nginx/Caddy) in front; serve `/` from this app.
4. Migrate SQLite → Postgres/MySQL when ready: same columns (`id`, `iv`, `ciphertext`, `alg`, timestamps). Keep envelope encryption; optionally wrap DEK with cloud KMS.
5. Reader mobile app: send `X-API-Key`, never log full CCCD, audit reveals.
6. Because there is no user PIN, **anyone who can call GET with a valid ID (and API key) can read the record** — protect the reader channel.

## Scripts
- `server/index.js` — Express app + static `public/`
- `bin/cloudflared` — optional tunnel binary
- Screenshots: `preview-card.png`, `preview-page.png`, `preview-reader.png`

## Limits of this demo
- SQLite via `sql.js` (WASM) persisted to disk — fine for test; use native DB in prod.
- Photo stored inside ciphertext (size-capped) — consider object storage later.
- Public quick-tunnel from the agent sandbox may be unavailable; use Holitech VPS + cloudflared/nginx.


## Deploy on Render (free, permanent URL)

This repo includes `render.yaml` + `Dockerfile` (no signup done from the agent).

1. Push the `travelq-passport` folder to a GitHub repo.
2. In Render: **New → Blueprint** → select the repo (or Web Service from Dockerfile).
3. Render injects `PORT` and can auto-generate `TRAVELQ_DATA_KEY` / `TRAVELQ_HMAC_SECRET`.
4. Free web service URL looks like `https://travelq-passport.onrender.com`.
5. **SQLite on Render free is ephemeral** (lost on restart/redeploy) — OK for demo; use a disk/Postgres later.

Local Docker test:

```bash
docker build -t travelq-passport .
docker run --rm -p 8787:8787 \
  -e TRAVELQ_DATA_KEY=$(openssl rand -hex 32) \
  -e TRAVELQ_HMAC_SECRET=$(openssl rand -hex 32) \
  travelq-passport
```
