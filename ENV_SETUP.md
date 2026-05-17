# Environment Setup

Create this file:

```text
MTL writing lab/classroom-writer/.env
```

Paste this template into `.env`, then replace the placeholder values with your real keys:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
APP_URL=http://localhost:3000
TEACHER_SHARED_PASSWORD=Password1
```

Where to find the Supabase values:

- `VITE_SUPABASE_URL` and `SUPABASE_URL`: Supabase Project Settings > API > Project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase Project Settings > API > anon public key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Project Settings > API > service_role key

Rules:

- Do not put real keys in `.env.example`.
- Do not put real keys in `README.md`.
- Do not put real keys into Supabase database tables.
- Never use `SUPABASE_SERVICE_ROLE_KEY` in a variable that starts with `VITE_`.
- Restart the dev server after changing `.env`.

Teacher login currently uses Supabase email/password auth. Any email ending in `@ri.edu.sg` can log in with the shared password:

```text
Password1
```

The app creates the Supabase Auth teacher user automatically on first login.

After creating `.env`, run:

```bash
npm run dev
```
