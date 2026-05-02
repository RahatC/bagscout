# BagScout — Product Architecture & UX Plan

> **One job-to-be-done:** "I want to know the moment my desired luxury bag appears at the right price from a trusted resale source."

Every screen, every interaction, every alert is in service of this single sentence. If a feature does not advance it, it does not ship in V1.

---

## 1. User Personas

**The Collector — "Margot"**
- 38, finance executive. Owns 6 luxury bags, hunting her grail (Hermès Birkin 30 in Etoupe).
- Refreshes FASHIONPHILE three times a day. Has missed two in the last six months.
- Wants: precision, speed, no noise. Will pay for confidence.

**The Smart Spender — "Lena"**
- 29, brand strategist. Wants a Chanel Classic Flap under $7,500 in good or better condition.
- Patient, price-sensitive, brand-loyal. Will wait months for the right one.
- Wants: a watchful eye that respects her budget.

**The Reseller — "James"**
- 34, runs a small consignment business. Tracks 40+ specific models for arbitrage.
- Wants: high signal, source attribution, the ability to act in minutes.

All three share one trait: **they already know what they want.** BagScout is not for browsing. It is for being told.

---

## 2. Core User Journey

```
Land → Sign up → Onboarding (define first dream bag)
     → Dashboard (your radar)
     → Alert fires → Review match (with reasons) → Open on source marketplace
     → Save / dismiss / refine watchlist
```

The journey is a loop. The user defines criteria once, then receives a stream of vetted opportunities. The app's job is to keep that stream signal-rich and noise-free.

---

## 3. Information Architecture

```
/                    Landing (public)
/sign-in, /sign-up   Auth
/onboarding          First watchlist setup
/dashboard           Radar — stats, recent matches, price drops
/watchlists          My criteria — list
/watchlists/new      Create dream bag profile
/watchlists/:id      Watchlist detail + its matches
/listings            Network browser (filtered by criteria-relevant facets)
/listings/:id        Listing detail with source CTA
/alerts              Alert feed (read/unread)
/saved               Saved listings
/admin               Source health + manual ingest (internal)
```

**Primary nav (signed-in):** Dashboard · Watchlists · Alerts · Saved
**Secondary:** Listings (network browse), Admin

The mental model is **"my criteria → my matches → my alerts"** — not "browse the catalog."

---

## 4. Main Screens

| Screen | Purpose | Hero element |
|---|---|---|
| **Landing** | Earn trust in 5 seconds | Editorial headline + live featured matches preview |
| **Dashboard** | Today's radar at a glance | Stat tiles + recent matches feed + price drops |
| **Watchlists** | The user's criteria portfolio | Card list with match counts and active state |
| **Watchlist detail** | All matches for one dream bag | Matches feed with reasons + edit/pause |
| **Listing detail** | Decide and act | Image, source badge, match reasons, external CTA |
| **Alerts** | Inbox of opportunities | Chronological feed, mark read, filter unread |
| **Saved** | Shortlist for later | Saved listings with notes |
| **Admin** | Operational health | Source status table + ingest trigger |

---

## 5. Onboarding Flow

A single, unhurried multi-step form — feels like a concierge intake, not a tech setup.

1. **Brand** — required. Curated list of houses, free-text fallback.
2. **Model** — Birkin, Kelly, Classic Flap, Speedy, etc. Optional but encouraged.
3. **Style / Size** — Birkin 30 vs 35; Medium vs Jumbo. Optional.
4. **Color** — exact (Etoupe) or family (Neutrals). Optional.
5. **Condition** — minimum acceptable: Excellent, Very Good, Good.
6. **Price range** — min/max in USD.
7. **Match strictness** — "Exact" or "Close" (controls scoring threshold).
8. **Confirm** — preview of how this watchlist will behave.

Then: straight to dashboard with a friendly empty state until the first match lands.

---

## 6. Matching Logic

Each listing is scored against each active watchlist. Score range 0.0 – 1.0.

| Signal | Weight | Rule |
|---|---|---|
| Brand match | 0.30 | Exact (case-insensitive) |
| Model match | 0.20 | Exact or known alias |
| Style match | 0.10 | Exact or substring |
| Color match | 0.15 | Exact = full; family = half |
| Condition meets minimum | 0.10 | Boolean |
| Price within range | 0.15 | Boolean |

**Thresholds:**
- `matchType: "exact"` → record match if score ≥ 0.85
- `matchType: "close"` → record match if score ≥ 0.65

A `matchReasons[]` array is stored alongside the score so every match card can explain itself in plain language.

---

## 7. Alert Logic

Three alert types, all surfaced in the same feed:

| Type | Trigger |
|---|---|
| `new_match` | A listing crosses the score threshold for an active watchlist |
| `price_drop` | A previously-matched listing drops in price |
| `back_in_stock` | A listing previously marked unavailable becomes available again |

**Rules of restraint:**
- One alert per (user, listing, type) — no duplicates.
- Paused watchlists generate no alerts.
- Alert cards always carry the originating watchlist name and source badge — the user always knows *why* and *where from*.

V1 surfaces alerts in-app only. Email / push are V2.

---

## 8. Data Ingestion

V1 uses a **pluggable adapter pattern** with mock data — same interface that a real adapter (RSS, sitemap, API, email) will implement later.

```
sources table → adapter type (mock | rss | sitemap | api | email)
  ↓
runMockIngest(sourceSlug) → upsert listings → update lastIngestAt + status
  ↓
match engine (post-ingest) → create matches + alerts for active watchlists
```

Sources tracked: **FASHIONPHILE, Rebag, The RealReal, Yoogi's Closet** — all named, all attributed on every card.

Ingestion is triggered manually from `/admin` in V1; a scheduler is a V2 concern.

---

## 9. Premium Differentiators

What makes BagScout feel unlike anything else in this space:

1. **Editorial design** — Playfair Display, generous whitespace, dusty rose accent. Feels like a magazine, not a tracker.
2. **Match transparency** — every card explains *why* it matched. Trust is earned, not asserted.
3. **Source attribution** — every listing carries its marketplace badge prominently. No mystery, no markup.
4. **Calm by default** — strict thresholds, paused-watchlist respect, no notification spam.
5. **"My criteria" framing** — the entire UI orbits the user's intent, not the catalog.
6. **Concierge onboarding** — multi-step intake that respects how serious buyers think.

---

## 10. Non-Goals for V1

Explicitly out of scope, to keep the focus sharp:

- **No browsing-first experience.** Network browse exists but is a secondary tab.
- **No checkout / in-app purchase.** Always hand off to the source marketplace.
- **No social features.** No follows, comments, sharing.
- **No price prediction or "deal score" beyond match score.**
- **No email/SMS/push alerts.** In-app only.
- **No watches, shoes, jewelry, or RTW.** Bags only.
- **No marketplace negotiation, offers, or messaging.**
- **No multi-currency.** USD only.
- **No mobile native app.** Responsive web only.

---

## Implementation Status

The codebase already follows this plan:
- Schema covers all six core entities
- Routes mirror the IA above
- The frontend ships every screen listed in Section 4
- Match cards display reason chips and a confidence score
- Source badges appear on every listing card

Next reasonable iterations: a real match engine that generates rows in the `matches` and `alerts` tables on ingest, then richer admin observability.
