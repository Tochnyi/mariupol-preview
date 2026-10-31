# наш.дом.рф — Mariupol new-construction data (OSINT capture)

**Source:** https://наш.дом.рф/новостройки/мариуполь/?type=map
(punycode host `xn--80az8a.xn--d1aqf.xn--p1ai`)
**Place code:** `0-1158` (Mariupol)
**Captured:** 2026-10-31, from a browser HAR export (Firefox 159).
**Note:** Russian state housing portal (ДОМ.РФ). Site blocks non-RU IPs (HTTP 403),
so data must be pulled from an in-region/authenticated browser session.

## Status

- [x] Developers (25) + parent groups (4) + sales IDs (637)
- [x] Building locations (98 in Mariupol) + status — `mariupol_objects.geojson/.csv`
- [x] Raw source preserved — `object_map.national.raw.json.gz`, `object_map.mariupol.raw.json`
- [x] **Full detail for all 98** (address, name, developer+INN, floors, apartments,
      completion date, area, price, photo) — `mariupol_detailed.geojson/.csv`
      Raw: `object_catalog.page1.raw.json` (50) + `object_catalog.page2.raw.json` (48).

## Where the per-building data lives (data tracking)

| File | Role |
|---|---|
| `object_catalog.page1/2.raw.json` | raw catalog (all 98, ~29 fields each) — source of truth for the list |
| **`object_details.json`** | **canonical per-building FULL detail, keyed by objId** — accumulates across capture rounds (dedupe by objId). **19 / 98 so far.** |
| `object_details.from_har.json` | raw details extracted from the first HAR (19) |
| `mariupol_detailed.csv/.geojson` | flattened table/map, 98 rows × 31 cols; detail fields (OGRN/KPP, legal addr, director, contractor, rpdPdfLink, class, parking, elevators) fill in as `object_details.json` grows. `hasDetail` flags which rows have them. |
| `../../construction-vs-damage.html` | combined web map: construction (by status, rich popups) + 1,358 damage pins. Serve repo root, open the page. |
| `object_map.*` | raw map coords (national + Mariupol subset) |
| `developers.*`, `dev_groups.json`, `sales_object_ids.json` | supporting lists |

Detail capture is **resumable**: each round fetches only objIds missing from `object_details.json`,
merges in, and the missing count shrinks. Detail endpoint: `/сервисы/api/object/{objId}`.

## Shareable output

- `mariupol_construction_vs_damage.kmz` (10.6 MB) — Google Earth file: 98 construction
  placemarks (green=completed, orange=under construction, render photo in each balloon)
  + 1,358 damage pins. Open in Google Earth / Google Earth Pro.
- `images/` — original render photos (95, full-res ~246 MB).
- `images_kmz/` — downscaled copies (900px) embedded in the KMZ.

## Summary (98 residential buildings)

- Status: **71 under construction (Строящиеся), 27 completed (Сданные)**
- Completion years: 2023→2031, peak **2026 (35)** and **2027 (30)**
- Total apartments: **14,184**
- Top developers: СЗ-1 ПОРФИР (20), СЗ СУ-2007 (15), СЗ ГСА ДЕВЕЛОПМЕНТ (10),
  СЗ ЭВОДОМ-5 (6), СЗ КОРПОРАЦИЯ СМУ-5 (6), СЗ СОЛНЕЧНАЯ (5)

## Status code mapping (confirmed from siteStatus)

- `objStatus = 2` → **Сданные** (completed / handed over)
- `objStatus = 0` → **Строящиеся** (under construction)
- Across all 98: **71 under construction, 27 completed**

## Raw source files (provenance)

| File | Contents |
|---|---|
| `object_map.national.raw.json.gz` | full nationwide `object/map` response (52,104 objects), as captured |
| `object_map.mariupol.raw.json` | the 98 objects filtered to the Mariupol bbox (unmodified fields) |

## Files extracted from the HAR (response bodies that were saved)

| File | Contents | Source endpoint |
|---|---|---|
| `developers.json/.csv` | 25 застройщики (developers) with INN tax IDs + names | `/сервисы/api/kn/developers?place=0-1158` |
| `dev_groups.json` | 4 parent development groups | `/сервисы/api/kn/devGk?place=0-1158` |
| `sales_object_ids.json` | 637 object IDs with free/booked flats | `/portal-kn/api/sales/portal` |
| `next_data.json` | server-rendered page state (dictionaries, filters) | page HTML |

## Buildings with coordinates — DONE

`object/map` response captured (nationwide: 52,104 objects). Filtered to the Mariupol
bounding box (lat 46.95–47.25, lon 37.30–37.80) → **98 construction objects**.

| File | Contents |
|---|---|
| `mariupol_objects.geojson` | 98 points (objId, status, minPrice, coords) |
| `mariupol_objects.csv` | same, tabular |

Status counts: **71 objStatus=0**, **27 objStatus=2**.
Status mapping is **inferred** (2 ≈ under construction / Строящиеся, 0 ≈ commissioned);
confirm against the site before publishing.

### Enrichment still possible
`object/map` only returns objId + status + coords + minPrice. Address, building name,
developer, floor count, and completion date require per-object detail calls:

    https://наш.дом.рф/сервисы/api/kn/object/{objId}

(or the catalog list `/сервисы/api/kn/object?place=0-1158`). Not yet captured.
