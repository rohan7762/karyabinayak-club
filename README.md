# Karyabinayak Sanskriti Yuba Club — Vercel deployment

This is the Vercel-ready Next.js version of the club website and simple admin system. It uses Supabase for Google authentication, persistent records, audit history, and private photo storage.

## 1. Create the Supabase data layer

In the Supabase project SQL Editor, run the complete file `supabase/schema.sql`.

The script creates the tables, row-level security rules, safe server-side write functions, audit log, and private `club-photos` storage bucket. Run it once; it is written to be safe to run again.

In Supabase Authentication → Providers → Google, keep Google enabled. The Google provider callback remains:

`https://blsivjdudrqtjsjqhtji.supabase.co/auth/v1/callback`

## 2. Configure Google and the owner

Set the initial owner's exact Google email in Vercel as `CLUB_OWNER_EMAIL`. The owner is allowed into the admin panel immediately after signing in. Later, the owner can add the Secretary, Treasurer, or other admins from Website Settings using their exact Google email addresses.

In Supabase Authentication → URL Configuration, set:

- Site URL: your final Vercel URL (or the custom `.com.np` domain)
- Redirect URL: `https://YOUR-VERCEL-DOMAIN/auth/callback`

## 3. Deploy to Vercel

Import this folder into a GitHub repository, then select that repository in Vercel. The project is already configured for the Next.js framework; leave the build command and output settings at their defaults.

Add these Environment Variables in Vercel for Production, Preview, and Development:

```text
NEXT_PUBLIC_SUPABASE_URL=https://blsivjdudrqtjsjqhtji.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_private_supabase_service_role_key
CLUB_OWNER_EMAIL=your-owner-google-email
APP_URL=https://your-final-vercel-domain
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never commit it, put it in a browser variable, or share it publicly. The `.env.example` file intentionally leaves it blank.

## 4. First production login

Open `/login` on the deployed site and continue with Google using the email in `CLUB_OWNER_EMAIL`. After login, open Website Settings and add the other administrators. Public visitors can use the homepage without signing in.

## Local checks

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

The project intentionally starts with the club settings record only. Add real members, meetings, notices, activities, gallery images, and transactions from the admin panel. The earlier ChatGPT Sites/Cloudflare version remains a separate live site; this Vercel version does not automatically copy those records.
