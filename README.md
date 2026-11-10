# College Project Marketplace Frontend

## Run locally

```powershell
npm install
npm run dev
```

The active frontend uses Vite. Its separate Admin Login calls the FastAPI endpoints at `VITE_ADMIN_API_BASE_URL` (default `http://localhost:8000/api/v1`); the authenticated Admin Dashboard shows backend-backed overview counts and marks unsupported metrics unavailable. Student login and signup remain on the existing student flow.

Copy `.env.example` to `.env.local` when the backend runs at a different origin. Do not put credentials or tokens in frontend environment variables. Admin access tokens are held in memory only and are sent only to the backend authentication endpoints.

```powershell
npm run build
```
