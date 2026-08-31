# AutoDigitalPublisher

Production-oriented starter for automating digital-product publishing across Etsy, Gumroad and Payhip.

## What is included

- Product Truth Gate before any publish plan is created
- Multi-channel publish planner
- Next.js dashboard
- POST /api/publish API
- GET /api/health API
- Single active authority manifest
- GitHub Actions build/typecheck workflow
- Environment-variable template with no secrets committed

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Publish API

POST `/api/publish`

Example:

```json
{
  "productId": "PDT-001",
  "title": "Cafe Operations Toolkit",
  "description": "Editable operations toolkit for cafe owners.",
  "priceUsd": 14.9,
  "files": ["Cafe_Operations_Toolkit.zip"],
  "channels": ["etsy", "gumroad", "payhip"],
  "productTruthVerified": true
}
```

The API returns a publish plan. It does **not** push to marketplaces yet. Real marketplace writes stay disabled until credentials and per-channel adapters are connected.

## Production rules

1. Product truth is required before publishing.
2. Unknown claims/specs are omitted.
3. Each channel receives its own adapter payload.
4. No marketplace secret is committed to Git.
5. `AUTODIGITALPUBLISHER_ACTIVE_MANIFEST.md` is the single executable project authority.

## Next integration stage

Connect marketplace credentials through environment variables, then implement authenticated adapters under `lib/adapters/`.

See `.env.example` and `AUTODIGITALPUBLISHER_ACTIVE_MANIFEST.md`.
