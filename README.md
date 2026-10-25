# Pasar Keripik: Product Admin (Phase 1)

Admin web page for the Pasar Keripik store: products, categories, variations, wholesale tiers, scheduled discounts, photos, units, stock and audit history. One SQLite file is the source of truth (later shared by POS and e-commerce). All times are WIB (Asia/Jakarta). Money is whole Rupiah.

See [SPEC.md](SPEC.md), [docs/DESIGN.md](docs/DESIGN.md) and [server/API.md](server/API.md).

## Requirements
- Node.js 24 or newer
- Git
- Windows, Linux or macOS (better-sqlite3 and sharp ship prebuilt binaries)

## Install
```bash
git clone https://github.com/pucetau-source/Pasar-Keripik.git
cd Pasar-Keripik
npm install
cd client && npm install && npm run build && cd ..
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
```
Edit `.env` if needed (port, DB path, upload path, shop name, default language).

## Run
```bash
npm start
```
Open http://localhost:3000. The first start creates `data/` (database and uploads), runs the migrations and seeds the dummy user `admin1` ("admin pasar keripik") plus default units (g, kg, mg).

Load demo products (optional):
```bash
npm run seed:demo -- --products=60
```

## Development
```bash
npm run dev               # API with auto-reload on :3000
cd client && npm run dev  # Vite dev server, proxies /api to :3000
npm test                  # backend tests
```

## Notes
- `data/` and `.env` are git-ignored. Back up `data/` (database + uploads) regularly.
- Images are stored in folders that mirror the category tree.
- Phase 1 has no login. Phase 2 adds username/password login and user management.
- Deployment (Docker + Cloudflare Tunnel) is planned, not included yet.
