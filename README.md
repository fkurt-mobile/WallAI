# Murra — Room Reimagined Preview

Premium wallpaper visualization app built with React, TanStack Router/Start, Vite, Tailwind CSS, Supabase, and Lovable cloud auth.

## Requirements

- Node.js `22.12.0` or newer is recommended.
- npm `10+` or newer.
- Supabase project URL and publishable key.

> The app can install on Node `20.19.1`, but TanStack Start packages warn that they require Node `>=22.12.0`. Use Node 22+ to avoid runtime/build issues.

## Project Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create your local environment file:

   ```bash
   cp .env.example .env
   ```

3. Fill `.env` with your Supabase values:

   ```bash
   SUPABASE_PROJECT_ID=coucvckvedgzbdqhysqv
   SUPABASE_URL=https://coucvckvedgzbdqhysqv.supabase.co
   SUPABASE_PUBLISHABLE_KEY=your-publishable-key

   VITE_SUPABASE_PROJECT_ID=coucvckvedgzbdqhysqv
   VITE_SUPABASE_URL=https://coucvckvedgzbdqhysqv.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

   `VITE_*` values are exposed to the browser. Do not put service-role keys or private secrets in any `VITE_*` variable.

## Run Locally

Start the development server:

```bash
npm run dev
```

Open the printed local URL in your browser, usually:

```text
http://localhost:5173
```

The authenticated app requires Supabase auth. After signing in, you can access:

- `/dashboard` — dashboard
- `/wallpapers` — wallpaper catalog
- `/visualizer` — wallpaper visualizer flow
- `/visualizations` — saved/generated visualization gallery
- `/tools/image-crop` — image crop tool

The sidebar Tools section also contains a direct `Wallpaper Visualizer` entry for quick access to `/visualizer`.

## Preview a Production Build

Build the app:

```bash
npm run build
```

Preview the built output:

```bash
npm run preview
```

Open the URL printed by Vite, usually:

```text
http://localhost:4173
```

## Quality Checks

Run lint:

```bash
npm run lint
```

Format files:

```bash
npm run format
```

## Supabase Setup

This project is configured for Supabase project ref `coucvckvedgzbdqhysqv` in `supabase/config.toml`.

Apply database tables and RLS policies:

```bash
npx supabase login
npx supabase link --project-ref coucvckvedgzbdqhysqv
npx supabase db push
```

If you are running in a non-interactive terminal, create a Supabase access token and run:

```bash
SUPABASE_ACCESS_TOKEN=your-token npx supabase link --project-ref coucvckvedgzbdqhysqv
SUPABASE_ACCESS_TOKEN=your-token npx supabase db push
```

Enable Google login in Supabase:

1. Open Supabase Dashboard → Authentication → Providers → Google.
2. Enable Google and add your Google OAuth client ID/secret.
3. In Authentication → URL Configuration, add these redirect URLs for local dev:
   - `http://localhost:8080/auth`
   - `http://127.0.0.1:8080/auth`
   - `http://localhost:5173/auth`
   - `http://127.0.0.1:5173/auth`

The Google button uses Supabase OAuth directly. It should navigate to a Supabase `/auth/v1/authorize` URL, not Lovable's `/~auth/initiate` route.

If Google login returns this response:

```json
{
  "code": 400,
  "error_code": "validation_failed",
  "msg": "Unsupported provider: missing OAuth secret"
}
```

the Supabase project receiving the request does not have a Google OAuth client secret configured. Check both:

- `.env` points to `https://coucvckvedgzbdqhysqv.supabase.co`, not an older Supabase project.
- Supabase Dashboard → Authentication → Providers → Google has both Client ID and Client Secret saved.

## Useful Scripts

| Command             | Purpose                          |
| ------------------- | -------------------------------- |
| `npm run dev`       | Start local development server   |
| `npm run build`     | Create production build          |
| `npm run build:dev` | Create development-mode build    |
| `npm run preview`   | Preview production build locally |
| `npm run lint`      | Run ESLint                       |
| `npm run format`    | Format project with Prettier     |

## Notes

- `node_modules`, build output, and local environment files are ignored by Git.
- Static demo wallpaper/mockup data lives in `src/lib/wallpapers/data.ts`.
- App navigation is configured in `src/components/site/app-shell.tsx`.
- TanStack file routes live under `src/routes`.
