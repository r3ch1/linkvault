# Setting up Cloudflare R2

> 🇧🇷 [Versão em português](storage-r2.md)


R2 is the **recommended** storage backend for LinkVault. It has a generous free tier (10 GB of storage and 1M Class A operations per month), zero egress fees, and is the simplest option for syncing across devices without self-hosting.

> ⏱️ Estimated time: **5 minutes**.
> 💸 Cost: **$0.00** within the free tier (more than enough for personal/family use).

---

## 1. Prerequisites

- A [Cloudflare](https://dash.cloudflare.com/sign-up) account (free tier is fine)
- A credit card on file (not charged within the free tier, but required to enable R2)

---

## 2. Enable R2 (one-time per account)

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com).
2. In the left sidebar, click **R2 Object Storage**.
3. If this is your first time, you'll see **"Get started with R2"** asking you to add a payment method. Add your card.
4. Accept the terms.

Done — you now have R2 access.

---

## 3. Create a bucket

1. In **R2 Object Storage**, click **Create bucket**.
2. **Bucket name**: pick a unique name (only matters to you — suggestion: `linkvault-<your-name>`, e.g. `linkvault-jane`).
   - Lowercase letters, numbers, and hyphens only. No dots.
3. **Location**: leave it on **Automatic** (or pick the region closest to you — `EEUR` for Europe, `WNAM` for North America, etc).
4. **Default storage class**: leave **Standard**.
5. Click **Create bucket**.

> 🔒 The bucket is **private by default** — perfect. Never enable public access for LinkVault.

Note down the **bucket name** — you'll need it shortly.

---

## 4. Get the Account ID

1. Go back to the R2 home (**R2 Object Storage** in the sidebar).
2. In the top-right corner (or the side panel), you'll see the **Account ID** — a string like `a1b2c3d4e5f67890abcdef1234567890`.
3. **Copy that value.** It forms part of the endpoint.

The final endpoint is:

```
https://<accountid>.r2.cloudflarestorage.com
```

Example: `https://a1b2c3d4e5f67890abcdef1234567890.r2.cloudflarestorage.com`

---

## 5. Create an API Token (Access Key + Secret)

1. Still in **R2 Object Storage**, look for **API** or **Manage API Tokens** in the sidebar.
   - On some layouts: **R2** → **Overview** → **Manage R2 API Tokens** (right side).
2. Click **Create API Token**.
3. **Token name**: something like `LinkVault-Desktop`.
4. **Permissions**: **Object Read & Write** (no need for Admin).
5. **Specify bucket(s)**: select **Apply to specific buckets only** and pick the bucket you just created. (Safer than account-wide access.)
6. **TTL**: leave **Forever** (or a long period — you can revoke it later by deleting the token).
7. Click **Create API Token**.

Cloudflare will show:

```
Access Key ID:        ••••••••••••••••••••••••
Secret Access Key:    ••••••••••••••••••••••••••••••••••••••••••••
Endpoint:             https://<accountid>.r2.cloudflarestorage.com
```

> ⚠️ **The Secret Access Key is shown ONCE.** If you close the dialog without copying it, you'll need to create a new token. Copy it now.

---

## 6. Configure LinkVault

1. Open LinkVault → **Settings** icon in the top-right.
2. Under **Storage**, change **Storage type** to **Cloudflare R2**.
3. Fill in:

| Field                 | Value                                                   |
| --------------------- | ------------------------------------------------------- |
| Endpoint (R2)         | `https://<accountid>.r2.cloudflarestorage.com`          |
| Region                | `auto`                                                  |
| Bucket                | the bucket name from step 3                             |
| Access Key ID         | from step 5                                             |
| Force path-style URLs | already checked for R2 — leave it on                    |
| Secret Access Key     | from step 5 (shown only once!)                          |

4. Click **Test connection**. You should see **"Connected"** in green.
5. Click **Save storage**.
6. Go back home and save a test bookmark.

That's it. From now on, every saved bookmark lands in your R2 bucket.

---

## Verifying it works

In the Cloudflare dashboard → R2 → your bucket → **Objects** tab, after saving the first bookmark you should see:

```
.index.json
bookmarks/
   bkm_01HXXXXXXX.md
   bkm_01HXXXXXXX.meta.json
```

You can download any file directly from the dashboard to inspect it.

---

## Switching machines / using on another device

Since data lives in R2 (not in the app), just install LinkVault on another machine and configure it with **the same credentials**. Your bookmarks appear automatically.

---

## Common issues

**"InvalidAccessKeyId" or "SignatureDoesNotMatch"** when testing:
- Wrong Access Key ID or Secret. Create a new token (step 5) and try again.
- Make sure there are no spaces at the start/end of what you pasted.

**"NoSuchBucket"**:
- Bucket name typo, or the token has permission for a different bucket.

**"403 Forbidden"**:
- The token doesn't have **Object Read & Write** on the bucket. Re-create with the right permissions.

**Wrong endpoint / connection timeout**:
- Double-check the `<accountid>` in the endpoint. It's the Cloudflare Account ID, not any bucket ID.
- Don't forget the `https://`.

**Everything looks configured but the app doesn't list bookmarks**:
- Go to Settings → Storage → confirm "saved in keychain" appears next to the secret. If not, paste it again and click Save.

---

## Revoking access

If you lose a machine, or want to stop using an old one:

1. Cloudflare Dashboard → R2 → Manage API Tokens.
2. Find your token (the name you set, e.g. "LinkVault-Desktop").
3. Click **Revoke**.

Next time that machine tries to access, it'll fail with 403. Files in R2 are untouched.

---

## Realistic cost

For typical personal use (a few hundred bookmarks per month), you stay **well within the free tier**:

| R2 free tier limit  | What that covers                                              |
| ------------------- | ------------------------------------------------------------- |
| 10 GB storage       | ~10k bookmarks with AI summary + YouTube transcripts          |
| 1M Class A ops/mo   | ~1M bookmark saves (writes)                                   |
| 10M Class B ops/mo  | ~10M reads (open bookmark, list)                              |
| Unlimited egress    | Never pay to download your own files                          |

Above that: $0.015/GB/month of storage. In practice, personal use never exceeds the free tier.
