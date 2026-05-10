# Setting up Amazon S3

> 🇧🇷 [Versão em português](storage-s3.md)


Use S3 if you already have AWS infrastructure, need enterprise SLA, or want to integrate with other AWS tools. For pure personal use, **R2 is simpler and cheaper** — see [storage-r2.en.md](storage-r2.en.md).

> ⏱️ Estimated time: **10 minutes**.
> 💸 Cost: ~$0.02/GB/month of storage + $0.09/GB egress (1 GB of bookmarks + casual reads ≈ a few cents per month).

---

## 1. Prerequisites

- An [AWS](https://aws.amazon.com/) account with billing enabled
- Permission to create S3 buckets and IAM users (if it's your personal account, you already have it)

---

## 2. Create the bucket

1. AWS Console → search for **S3** → open it.
2. Click **Create bucket**.
3. **Bucket name**: globally unique (e.g. `linkvault-jane-2026`). Lowercase letters, numbers, hyphens only.
4. **AWS Region**: pick the region closest to you. **Note this region.**
   - `us-east-1` (N. Virginia), `sa-east-1` (São Paulo), `eu-west-1` (Ireland), etc.
5. **Object Ownership**: leave **ACLs disabled** (default).
6. **Block Public Access settings**: **leave EVERYTHING blocked** (default). LinkVault never needs public access.
7. **Bucket Versioning**: **Disable** (LinkVault already handles updates via timestamps).
8. **Encryption**: leave **SSE-S3** (default). Free and covers at-rest protection.
9. Click **Create bucket**.

Note down: **bucket name** and **region**.

---

## 3. Create an IAM user with restricted access

> ❌ **Do not use your AWS root access key.** Create a dedicated IAM user with permission only on the LinkVault bucket.

1. AWS Console → search for **IAM** → open it.
2. **Users** → **Create user**.
3. **User name**: `linkvault-app`.
4. **Provide user access to AWS Management Console**: **Do NOT** check (this user is API-only).
5. Click **Next**.
6. **Permissions options**: **Attach policies directly**.
7. Under **Permissions policies**, click **Create policy** (opens new tab).

### Create a custom policy

In the new tab:

1. **JSON** tab, paste this (replace `YOUR-BUCKET` with your real name):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "ListBucket",
         "Effect": "Allow",
         "Action": ["s3:ListBucket"],
         "Resource": "arn:aws:s3:::YOUR-BUCKET"
       },
       {
         "Sid": "ObjectAccess",
         "Effect": "Allow",
         "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::YOUR-BUCKET/*"
       }
     ]
   }
   ```

2. Click **Next**.
3. **Policy name**: `linkvault-bucket-access`.
4. Click **Create policy**.
5. Go back to the user tab, click **Refresh**, find `linkvault-bucket-access`. Check the box.
6. **Next** → **Create user**.

---

## 4. Generate an Access Key

1. **IAM** → **Users** → click `linkvault-app`.
2. **Security credentials** tab.
3. Under **Access keys**, click **Create access key**.
4. **Use case**: pick **Application running outside AWS**.
5. Acknowledge, click **Next**.
6. (Optional) Description tag: `LinkVault desktop app`.
7. **Create access key**.

AWS displays:

```
Access key:           AKIA••••••••••••••••
Secret access key:    ••••••••••••••••••••••••••••••••••••••••
```

> ⚠️ **The Secret access key is shown ONCE.** Copy it now or download the .csv. If you lose it, just delete and create another.

---

## 5. Configure LinkVault

1. Open LinkVault → **Settings**.
2. Under **Storage**, change **Storage type** to **Amazon S3**.
3. Fill in:

| Field                 | Value                                              |
| --------------------- | -------------------------------------------------- |
| Endpoint (optional)   | **leave empty** (AWS resolves from region)         |
| Region                | the bucket region (e.g. `sa-east-1`)               |
| Bucket                | bucket name from step 2                            |
| Access Key ID         | from step 4                                        |
| Force path-style URLs | **Do NOT** check (regular S3 uses virtual-hosted)  |
| Secret Access Key     | from step 4 (shown only once!)                     |

4. **Test connection** → should show **"Connected"** in green.
5. **Save storage**.
6. Save a test bookmark.

---

## Verifying it works

In the S3 console → your bucket → after saving the first bookmark you should see:

```
.index.json
bookmarks/
   bkm_01HXXXXXXX.md
   bkm_01HXXXXXXX.meta.json
```

---

## Common issues

**"InvalidAccessKeyId" / "SignatureDoesNotMatch"**:
- Access key or secret pasted wrong. Delete the access key and create a new one (step 4).

**"AccessDenied" when saving a bookmark**:
- Wrong policy — make sure you have `s3:PutObject` and `s3:DeleteObject` on `arn:aws:s3:::YOUR-BUCKET/*` (with `/*` at the end).

**"PermanentRedirect" or "wrong region"**:
- Configured region doesn't match the bucket. Check the bucket region in the S3 console and update LinkVault.

**"NoSuchBucket"**:
- Bucket name typo, or the IAM user has a policy for a different bucket.

---

## Security best practices

- **Never** use the root account access key.
- The IAM user from this guide has access **only to the LinkVault bucket** — not to other resources in your account.
- To revoke a machine (e.g. stolen laptop), go to IAM → linkvault-app → Security credentials → **Deactivate** or **Delete** the access key. Files in the bucket stay intact; only that credential becomes invalid.
- Consider enabling **MFA delete** on the bucket for extra protection against accidental deletion (S3 → bucket → Properties → Bucket Versioning → enable Versioning + MFA Delete).

---

## Realistic cost

For typical personal use (~1 GB of bookmarks, casual reads):

| Item               | Approx cost/month       |
| ------------------ | ----------------------- |
| Storage            | $0.02 (1 GB × $0.023)   |
| Requests (PUT/GET) | $0.01                   |
| Egress             | $0.01                   |
| **Total**          | **~ $0.04/month**       |

At personal scale the cost is dominated by rounding. R2 is still cheaper (zero egress), but if you're already AWS-first, S3 is a solid choice.
