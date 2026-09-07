# Supabase database CA

`supabase-prod-ca-2021.crt` is the public Supabase Root 2021 CA, downloaded from `https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`. The URL was verified against Supabase's official dashboard source, `apps/studio/hooks/custom-content/custom-content.json`, on September 7, 2026.

Staging PostgreSQL URLs use `sslmode=verify-full&sslrootcert=certs/supabase-prod-ca-2021.crt`. Next.js explicitly includes this file in server traces because the runtime path comes from an environment variable. No private key is present. Certificate and hostname verification remain enabled. The certificate expires April 26, 2031; replace it through a reviewed deployment before expiry or when Supabase rotates its CA.
