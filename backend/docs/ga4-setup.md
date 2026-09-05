# Google Analytics 4 setup

The admin analytics dashboards get their traffic / visitor / source / device /
top-of-funnel numbers from GA4. Sales, customers and inventory come from our own
database and work with no setup — this is only needed for the **Visitors** tab
and the funnel widget on **Overview** / **Products**.

Everything here uses the free tier (GA4 + the Data API's 25k requests/day).

## 1. Create the GA4 property

1. <https://analytics.google.com> → **Admin** → **Create** → **Property**.
2. Add a **Web** data stream for the storefront domain.
3. Copy the **Measurement ID** (`G-XXXXXXXXXX`) → set it as
   `NEXT_PUBLIC_GA4_MEASUREMENT_ID` in `frontend/.env`. That alone turns on
   client tracking (page views + the `view_item` / `add_to_cart` / `purchase`
   e-commerce events the storefront already emits).
4. Copy the **numeric property ID** (Admin → **Property Settings**, e.g.
   `123456789`) → `GA4_PROPERTY_ID` in `backend/.env`.

## 2. Create a service account for the Data API

1. <https://console.cloud.google.com> → create (or pick) a project.
2. **APIs & Services** → **Library** → enable **Google Analytics Data API**.
3. **APIs & Services** → **Credentials** → **Create credentials** →
   **Service account**. No roles needed at the project level.
4. Open the service account → **Keys** → **Add key** → **JSON**. A key file
   downloads.

## 3. Grant the service account read access to the property

GA4 **Admin** → **Property access management** → **+** → add the service
account's email (`...@...iam.gserviceaccount.com`) with the **Viewer** role.

## 4. Wire the backend env

From the downloaded JSON key:

```
GA4_PROPERTY_ID=123456789
GA4_SA_CLIENT_EMAIL=<client_email from the JSON>
GA4_SA_PRIVATE_KEY=<private_key from the JSON, with the literal \n sequences kept>
```

`GA4_SA_PRIVATE_KEY` is one line with `\n` escapes — paste it exactly as it
appears in the JSON; `ga.service.ts` unescapes them at runtime. Never commit the
key (`.env` is gitignored).

## 5. Verify

- `curl -H "Authorization: Bearer <admin JWT>" localhost:4000/api/admin/analytics/visitors`
  returns rows (not `{ "configured": false }`).
- Browse the storefront with the frontend measurement ID set and watch GA4
  **Admin → DebugView** (or Realtime) for `page_view`, `view_item`,
  `add_to_cart`, `purchase`.

New GA4 properties take ~24–48h before non-realtime reports fill in, so the
Visitors tab may be sparse on day one.
