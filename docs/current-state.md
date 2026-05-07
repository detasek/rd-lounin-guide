# CURRENT STATE – Průvodce stavbou RD Lounín

## Stage
Stage 2 – STRUKTURA

## Hotovo
- Stage 0 – AUDIT VSTUPŮ
- Stage 1 – DATA MODEL + DB
- SQLite DB vytvořena
- migrace 001–004 hotové
- tabulky vytvořeny
- seed hotový:
  - phases: 16
  - rooms: 13
  - house_profile: 1
- docker-compose.yml vytvořen
- frontend container připraven:
  - rd-lounin-web
  - port 8091
- backend container připraven:
  - rd-lounin-api
  - port 3010 → 3000
- Express backend skeleton hotový
- SQLite DB připojena read-only stylem přes API
- API endpointy hotové:
  - GET /api/health
  - GET /api/phases
  - GET /api/rooms
  - GET /api/products
  - GET /api/products/:id

## Ověřený stav API
- /api/phases → 16
- /api/rooms → 13
- /api/products → 0
- /api/products/1 → Product not found

## Rozděláno
- Stage 2 – struktura projektu
- příprava frontend napojení na API

## Blockery
- žádné

## Co se NESMÍ rozbít
- /volume1/docker/rd-lounin-guide/data/db.sqlite
- schema_migrations
- existující data:
  - phases
  - rooms
  - house_profile

## Další krok
- frontend config pro API URL
- první napojení frontend → backend

## Stage 2 doplněno
- frontend skeleton vytvořen:
  - app/index.html
  - app/app.js
- frontend běží na portu 8091
- frontend úspěšně čte API:
  - API: ok
  - Fáze: 16
  - Místnosti: 13
  - Produkty: 0
- opraveny práva app složky:
  - app: 755
  - index.html/app.js: 644

## Stage 2 doplněno – config
- vytvořen app/config.js
- API URL oddělena mimo app.js
- index.html načítá:
  - config.js
  - app.js
- frontend po změně ověřen:
  - API: ok
  - Fáze: 16
  - Místnosti: 13
  - Produkty: 0

## Stage 2 doplněno – status endpoint
- vytvořen backend endpoint:
  - GET /api/status
- endpoint vrací:
  - api: ok
  - db: connected
  - counts.phases: 16
  - counts.rooms: 13
  - counts.products: 0
- frontend přepojen z více API callů na /api/status
- app.js cache bust:
  - app.js?v=3

## Audit 2026-05-06
- OK compose backend command:
  - `sh -c "npm install && node app.js"`
- OK api package entry point:
  - `main: app.js`
  - `start: node app.js`
- OK middleware files exist:
  - `api/middleware/logger.js`
  - `api/middleware/response.js`
  - `api/middleware/errorHandler.js`
- OK `api/app.js` mounts:
  - `/api/status`
  - `/api/phases`
  - `/api/rooms`
  - `/api/products`
  - `/api/documents`
  - `/api/photos`
  - `/api/receipts`
  - `/api/upload`
- MISS drift remained:
  - `api/server.js` still existed as old flat server
  - `api/routes/receipts.js` only had `GET /` and `PUT /:id`
  - frontend called missing `POST /api/receipts/upload`
  - frontend called missing `DELETE /api/receipts/:id`
  - frontend boot called `/api/diary`, but no `api/routes/diary.js` was found
- FIX applied:
  - `api/server.js` is now a shim to `app.js`
  - receipts upload now stores files in `/data/receipts`
  - receipts route now supports:
    - `GET /api/receipts`
    - `POST /api/receipts/upload`
    - `PUT /api/receipts/:id`
    - `DELETE /api/receipts/:id`
  - frontend obvious scope/runtime errors were removed in products, documents, photos, and diary boot
- Open point:
  - diary backend is still not implemented/verified

## Stage 7 audit 2026-05-06
- OK receipts table exists and contains Stage 7 fields:
  - `product_id`
  - `title`
  - `original_name`
  - `mime_type`
  - `file_size`
  - `supplier`
  - `document_number`
  - `purchase_date`
  - `total_amount`
  - `warranty_months`
  - `warranty_until`
  - `warranty_note`
- OK runtime endpoints verified on NAS:
  - `GET /api/health`
  - `GET /api/status`
  - `GET /api/receipts`
- FIX applied:
  - `GET /api/receipts` now supports optional `?product_id=...` filter to match frontend behavior
  - legacy compatibility route `POST /api/upload/receipt` now uses the same receipts upload flow as `POST /api/receipts/upload`
  - receipts API now normalizes output fields for frontend:
    - `supplier` falls back to legacy `vendor`
    - `purchase_date` falls back to legacy `date`
    - `total_amount` falls back to legacy `total`
    - `title` falls back to `original_name`
  - receipts update now mirrors values into legacy columns:
    - `supplier -> vendor`
    - `purchase_date -> date`
    - `total_amount -> total`
  - receipts upload accepts only PDF or image mimetypes
  - frontend receipts actions now check HTTP status and show `MISS` alert on failure
- Open point:
  - receipts schema still contains legacy columns (`vendor`, `date`, `total`, `tax`) next to newer Stage 7 fields

## Stage 7 UI cleanup 2026-05-06
- FIX applied:
  - receipts section has toolbar with:
    - selected product label
    - warranty filter buttons
    - receipts count summary
    - inline status message
  - receipts render as clearer cards with:
    - supplier
    - document number
    - purchase date
    - total amount
    - preview / edit / delete actions
  - receipts empty states are explicit instead of blank area
  - frontend file `app/index.html` was rebuilt into a cleaner mobile-first layout
  - frontend file `app/app.js` was rewritten to remove accumulated drift and keep existing flows working

## B-lite minimum 2026-05-06
- FIX applied:
  - backend disables `X-Powered-By`
  - basic security headers added:
    - `X-Content-Type-Options: nosniff`
    - `X-Frame-Options: SAMEORIGIN`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - static file responses add:
    - `X-Content-Type-Options: nosniff`
    - `Cache-Control: no-store`
  - JSON body limit:
    - `express.json({ limit: "1mb" })`
  - upload size limit:
    - documents: 15 MB
    - photos: 15 MB
    - receipts: 15 MB
    - legacy receipt upload route: 15 MB
  - upload errors now return cleaner API responses for:
    - unsupported file type
    - file too large
  - backend container runs with:
    - `NODE_ENV=production`
- Open point:
  - none in current B-lite minimum

## Local QR 2026-05-06
- FIX applied:
  - external QR dependency `api.qrserver.com` removed
  - backend now exposes local endpoint:
    - `GET /api/qr?size=80&data=...`
  - frontend QR images now use local API instead of cloud service
- Note:
  - backend restart will install npm dependency `qrcode`

## Diary minimum 2026-05-06
- FIX applied:
  - backend route added:
    - `GET /api/diary`
    - `POST /api/diary`
  - backend creates table automatically if missing:
    - `diary`
  - migration cleanup:
    - `scripts/migrate-002-core-schema.js` now includes `CREATE TABLE IF NOT EXISTS diary`
  - frontend empty state added for diary list
  - frontend diary UI cleanup:
    - inline diary status message
    - clearer empty state card
    - confirmation after save
    - diary cards show date more clearly
- Diary table fields:
  - `id`
  - `entry_date`
  - `content`
  - `product_id`
  - `phase_id`
  - `created_at`
  - `updated_at`

## Stage 8 automation minimum - receipts auto-fill 2026-05-06
- FIX applied:
  - receipts upload now stores explicit defaults:
    - `type = receipt`
    - `source = manual`
  - if receipt has `purchase_date` and no warranty length is supplied:
    - default `warranty_months = 24`
  - `warranty_until` is auto-calculated from:
    - `purchase_date + warranty_months`
  - receipts update preserves existing values when fields are omitted instead of overwriting blindly
  - frontend receipts card shows a short hint about current auto-fill behavior

## Stage 8 watcher minimum 2026-05-06
- FIX applied:
  - frontend watcher block added
  - backend endpoint added:
    - `GET /api/watcher`
  - frontend watcher now uses backend endpoint
  - watcher shows:
    - warranties ending within 30 days
    - receipts missing `supplier`
    - receipts missing `document_number`
    - receipts missing `purchase_date`

## OCR receipts minimum 2026-05-06
- FIX applied:
  - backend endpoint added:
    - `POST /api/receipts/:id/ocr-minimum`
  - OCR minimum is filename-based heuristic only
  - current heuristic can suggest / auto-fill:
    - `document_number`
    - `purchase_date`
    - `warranty_months`
    - `warranty_until`
  - OCR result is stored into:
    - `ocr_status`
    - `ocr_raw_json`
  - frontend receipts card now shows:
    - current `ocr_status`
    - `OCR minimum` action button

## Watcher actions minimum 2026-05-06
- FIX applied:
  - watcher endpoint now returns `product_id` for listed receipts
  - watcher frontend can:
    - open a flagged receipt directly
    - auto-select the related product
    - auto-open the receipt editor
    - trigger `OCR minimum` directly from watcher

## Watcher count fix 2026-05-06
- FIX applied:
  - watcher `counts` now use real `COUNT(*)` queries
  - watcher `groups` remain preview lists limited to 5 items
  - this prevents under-reporting when there are more than 5 flagged records

## Watcher OCR review group 2026-05-06
- FIX applied:
  - watcher now includes `review_needed` receipts
  - frontend watcher shows OCR review items as a separate group
  - this makes post-OCR manual review visible in the main dashboard

## OCR approval minimum 2026-05-06
- FIX applied:
  - backend endpoint added:
    - `POST /api/receipts/:id/ocr-approve`
  - frontend can approve OCR:
    - directly from receipt card
    - directly from watcher
  - approved receipt leaves `review_needed` watcher group on next refresh

## Receipt status workflow minimum 2026-05-06
- FIX applied:
  - receipt `status` is now auto-derived from key metadata completeness
  - current workflow statuses:
    - `pending_review`
    - `ready`
  - status becomes `ready` when receipt has:
    - supplier
    - document_number
    - purchase_date
  - upload / update / OCR minimum / OCR approve now keep `status` in sync
  - frontend receipts card shows both:
    - `status`
    - `ocr_status`
  - list/API response normalizes `status` from current fields so older rows do not show stale workflow state

## OCR review UX minimum 2026-05-06
- FIX applied:
  - receipts card now shows a short OCR summary derived from `ocr_raw_json`
  - user can see at a glance what OCR minimum found without opening raw JSON

## Media upload 1 GB + watch folder minimum 2026-05-06
- FIX applied:
  - upload size limit raised to `1 GB` for:
    - documents
    - photos
    - receipts
    - legacy receipt upload route
  - photos route now accepts:
    - images
    - videos
  - frontend photos section now supports:
    - `accept="image/*,video/*"`
    - inline video preview via `<video controls>`
    - upload status message
    - visible media title from original filename
    - common fullscreen viewer for image/video preview
    - viewer close button and `Esc` close
    - media summary for selected product:
      - total count
      - image count
      - video count
      - total size
    - media filter:
      - `all`
      - `image`
      - `video`
    - active media filter button is visually highlighted
    - media cards now show file size and created timestamp
    - media and inbox timestamps are rendered in readable local format in UI
    - media cards and inbox support quick copy actions:
      - filename
      - storage path
    - media title can be edited directly in UI
  - `GET /api/photos` now normalizes old rows too:
    - fallback `title` from filename
    - `media_kind` = `image | video | file`
  - backend watch folder inbox added:
    - `GET /api/watch-folder/media`
    - `POST /api/watch-folder/media/import`
  - current watch folder path inside container:
    - `/data/watch-folder/media`
  - corresponding NAS path from current compose mount:
    - `/volume1/docker/rd-lounin-guide/data/watch-folder/media`
  - watch folder minimum behavior:
    - scans inbox for importable image/video files
    - each inbox file now exposes `media_kind` = `image` or `video`
    - inbox response now includes counts:
      - `total`
      - `image`
      - `video`
    - inbox ignores hidden files and zero-byte files
    - inbox is sorted by newest files first
    - imports selected file into chosen product
    - can import all inbox files into chosen product
    - can delete unwanted inbox file without import
    - moves imported file into `/data/uploads/product_<id>/...`
    - inserts imported file into `photos` table
    - upload/import now validates that target product really exists
    - imported media keeps original filename in `photos.title`
    - single import now also refreshes watcher state immediately
  - watcher integration:
    - `GET /api/watcher` now includes `inbox_media`
    - frontend watcher shows waiting inbox media files
    - inbox file can be deleted directly from watcher

## Documents rename minimum 2026-05-06
- FIX applied:
  - backend endpoint added:
    - `PUT /api/documents/:id`
  - frontend documents cards now support:
    - inline `Upravit nazev`
    - save renamed document title into `documents.name`
    - quick copy actions:
      - filename
      - storage path
    - documents summary and filter:
      - `all`
      - `pdf`
      - `image`
      - `other`
    - documents summary now shows possible duplicates count
    - document cards now show:
      - mime type
      - created timestamp
      - storage path
      - possible duplicate hint
  - compatibility note:
    - update path does not require `documents.updated_at`
    - current NAS schema for `documents` does not contain that column

## Selected product summary minimum 2026-05-06
- FIX applied:
  - frontend summary block added for currently selected product
  - shows counts for:
    - documents
    - receipts
    - media
    - diary entries
  - media count is split into:
    - images
    - videos
  - documents count is split into:
    - pdf
    - images
    - other
  - receipts count is split into:
    - ready
    - pending_review
  - summary also shows active diary filter
  - summary now refreshes after document rename/delete
  - summary now refreshes after receipt save / OCR minimum / OCR approve
  - summary includes quick navigation buttons to:
    - documents
    - receipts
    - media
    - diary
  - summary navigation now also applies section-relevant filters:
    - receipts -> `all`
    - media -> `all`
    - documents -> `all`
    - diary -> `product`

## Diary filter minimum 2026-05-06
- FIX applied:
  - frontend diary filter added:
    - `all`
    - `product`
  - diary list can now show only entries for currently selected product
  - diary form product select now follows current selected product

## Watcher batch actions minimum 2026-05-06
- FIX applied:
  - frontend watcher now includes batch action:
    - `Schvalit vse review_needed`
  - action calls existing backend endpoint:
    - `POST /api/receipts/ocr-approve-all-review-needed`
  - after batch action frontend refreshes:
    - receipts
    - watcher
    - selected product summary

## Receipts UX bundle minimum 2026-05-06
- FIX applied:
  - receipts summary now shows:
    - total
    - ready
    - pending
    - OCR review_needed
  - watcher summary now shows quick breakdown:
    - inbox
    - review
    - warranty
  - receipt cards now show:
    - created timestamp
    - storage path
  - receipt cards now support quick copy actions:
    - title
    - document number
    - storage path

## Selected product actions bundle minimum 2026-05-06
- FIX applied:
  - selected product block now shows issue summary:
    - pending receipts
    - OCR review needed
    - missing document number
    - missing supplier
    - missing purchase date
    - warranty ending within 30 days
    - inbox media count
  - selected product block now includes quick actions to open first matching receipt for:
    - pending
    - review
    - missing document number
    - missing supplier
    - missing purchase date
  - selected product block now includes direct inbox shortcut
  - watcher block now also includes quick action row for:
    - receipts
    - OCR review
    - inbox
  - selected product block now also shows:
    - product health label
    - problem count
    - suggested next step
    - completion percentage
    - simple product checklist with OK/MISS markers

## Documents multi-upload + folder upload minimum 2026-05-06
- FIX applied:
  - documents upload now supports:
    - multiple files in one submit
    - folder selection from browser
  - single upload remains backward compatible
  - custom document name is only used when exactly one file is uploaded
  - backend now stores uploaded document files under unique disk names to avoid overwrite collisions
  - documents section now shows inline upload status

## Product starter templates minimum 2026-05-06
- FIX applied:
  - new product section now includes quick-start actions:
    - create first 8 recommended products
    - create all 16 recommended products
  - templates are based on product okruhy derived from real project documents
  - duplicate product names are skipped safely
  - quick-start status is shown inline in product section
  - known starter products are now sorted by recommended build sequence
  - product list now shows:
    - order number
    - product group
    - quick hint what to upload
  - selected product block now also shows:
    - recommended order
    - product group
    - upload hint

## Document move between products minimum 2026-05-06
- FIX applied:
  - documents backend update now supports changing `product_id`
  - target `product_id` is validated before save
  - document card editor now includes:
    - product select
    - action to move document to currently selected product
  - after document move frontend refreshes:
    - documents list
    - products list
    - selected product summary

## Document suggested target minimum 2026-05-06
- FIX applied:
  - document UI now computes suggested target product from:
    - document name
    - original name
    - file path
  - suggestion is heuristic only, not automatic
  - if suggestion differs from current product, card now shows:
    - suggested target product label
    - quick action to move document to suggested product
  - documents section now also supports:
    - `Doporucene` filter
    - bulk action to move all suggested documents in current scope
    - grouped suggestion summary by target product
    - bulk move into one specific suggested target product
  - document card now also shows:
    - current assigned product
    - suggested target product side by side in visible triage flow
  - documents section now supports scope:
    - selected product only
    - all products
  - suggested target actions now also support:
    - open suggested product from document card
    - open target product from grouped suggestion summary
  - document triage now also supports:
    - `Bez navrhu` filter
    - unsorted count in document summary
    - visible `Doporuceni: zadne` hint on cards without matched target
    - quick manual assignment directly on unsorted document cards
    - batch manual assignment of all `Bez navrhu` documents into one selected product
  - `Projektova dokumentace RD` is now highlighted in UI as:
    - `staging/workbench`
    - temporary intake product for project docs triage
  - workbench triage now also supports:
    - visible counts in staging product
    - `Otevrit dalsi doporuceny`
    - `Otevrit dalsi bez navrhu`
    - auto-continue to next triage item after move
    - visible progress `hotovo X/Y (%)`
    - quick workbench views:
      - `Vse ve stagingu`
      - `Jen doporucene`
      - `Jen bez navrhu`
    - visible triage labels on cards
    - remembers last manual target product for repeated `Bez navrhu` assignment
    - visible `DONE` state when staging no longer contains actionable documents
    - fast actions:
      - `Presunout dalsi doporuceny`
      - `Zaradit dalsi bez navrhu do posledniho cile`
    - fulltext search in documents by:
      - current name
      - original name
      - file path
    - document sorting modes:
      - newest
      - oldest
      - name A-Z
      - suggested first
      - unsorted first
    - copy export of currently visible document list
    - visible triage distribution summary:
      - top current product buckets
      - top target move buckets
      - unsorted count
    - batch move of currently visible documents into one selected product
    - batch move of currently visible suggested documents to their suggested targets
    - triage filter `K reseni` = suggested + unsorted
    - triage preferences persist in browser:
      - selected product
      - filter
      - scope
      - search
      - sort
      - last manual target
    - local deferred triage queue:
      - `Odlozene` filter
      - per-document `Odlozit`
      - per-document `Vratit do fronty`
      - workbench count of deferred documents
      - `Jen odlozene` view in workbench
      - `Odlozit dalsi k reseni` fast action
      - deferred document ids persist in browser local storage

---

## WATCH-FOLDER MEDIA CHECKPOINT (2026-05-06)

Ověřeno na NAS:

- watch-folder scan funguje
- inbox counts fungují
- image detection funguje
- video detection funguje
- import-all funguje
- image import funguje
- video import mechanika funguje
- files se přesouvají do:
  - data/uploads/product_X
- photos DB rows se vytváří správně
- vazba na product_id funguje
- API vrací:
  - media_kind=image
  - media_kind=video

Důležité:

- DB schema photos aktuálně nemá:
  - media_kind
  - updated_at
- backend media_kind normalizuje runtime logikou

Ověřené testy:

Image:
- dax_final.png
- imported row id=7

Video:
- test-video.mp4
- imported row id=8

Opraveno:
- watch-folder permissions
- uploads permissions

Aktuální doporučené další kroky:
1. watcher batch actions minimum
2. OCR provider integration minimum
3. stabilization review
