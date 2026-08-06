This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Supabase Setup

This repository is prepared for Supabase infrastructure, but authentication,
profiles, advertisements, ownership, images, favourites, and messaging still use
the existing demo/localStorage systems in this phase.

1. Create a Supabase project from the Supabase dashboard.
2. Open the project, then use the Connect dialog or Project Settings API section
   to find the Project URL and Publishable key.
3. Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Do not commit `.env.local`; it is ignored by Git. `.env.example` contains only
empty placeholders for the required variable names.

Restart the development server after editing environment variables so Next.js
loads the new values.

To verify local setup during development, call
`verifySupabaseClientsForDevelopment()` from `src/lib/supabase/verify.ts` in a
temporary local-only check. It returns only success/failure metadata and never
returns the project URL, keys, cookies, access tokens, or user data. Remove any
temporary check before production.

Until both public Supabase variables are present, the root `proxy.ts` leaves
application requests unchanged so the existing demo marketplace remains usable.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
