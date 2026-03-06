# Financial Radar — Deployment Guide

This guide explains how to deploy Financial Radar to production using **Vercel** (frontend), **Render** (backend API), and **Supabase** (database).

## Architecture

```
Browser → Vercel (frontend + API proxy) → Render (backend API) → Supabase (database)
```

All API requests go through Vercel's proxy (configured in `vercel.json`). This ensures cookies work correctly on all browsers including iOS Safari.

---

## 1. Supabase Setup (Database)

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project** and choose a name and password
3. Wait for the project to finish provisioning
4. Go to **Settings → Database** in your Supabase dashboard
5. Under **Connection string**, select **URI** and copy the connection string
6. Replace `[YOUR-PASSWORD]` in the connection string with the password you chose
7. Save this — you will need it as `DATABASE_URL`

### Push the database schema

From the `backend/` folder, run:

```bash
DATABASE_URL="your-connection-string" npx drizzle-kit push
```

This creates all required tables automatically.

---

## 2. Google OAuth Setup (Authentication)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Go to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth Client ID**
5. Select **Web application** as the application type
6. Set the name to "Financial Radar"
7. Under **Authorized JavaScript origins**, add your frontend URL:
   ```
   https://your-project.vercel.app
   ```
8. Under **Authorized redirect URIs**, add your **frontend URL** (not backend):
   ```
   https://your-project.vercel.app/api/auth/callback/google
   ```
9. Click **Create** and save the **Client ID** and **Client Secret**

> Important: The redirect URI must point to your **frontend URL** (Vercel), not the backend URL. Vercel proxies the request to the backend automatically.

> You also need to configure the **OAuth consent screen** under APIs & Services. Add your email as a test user if the app is in testing mode.

---

## 3. Backend Deployment (Render)

1. Go to [render.com](https://render.com) and create an account
2. Click **New → Web Service**
3. Connect your GitHub repository or upload the `backend/` folder
4. Set the following:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (or your preferred tier)

5. Add the following **Environment Variables**:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Your Supabase connection string |
   | `SESSION_SECRET` | A random string (32+ characters) |
   | `GOOGLE_CLIENT_ID` | From Google Cloud Console |
   | `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
   | `APP_URL` | Your **frontend URL** (e.g., `https://your-project.vercel.app`) |
   | `FRONTEND_URL` | Your **frontend URL** (e.g., `https://your-project.vercel.app`) |
   | `NODE_ENV` | `production` |
   | `SUPER_ADMIN_EMAIL` | (Optional) Your email for admin access |

6. Click **Deploy**

> Important: `APP_URL` must be set to your **frontend URL** (Vercel), not the Render URL. This is because API requests go through Vercel's proxy, so the OAuth redirect URI must use the frontend domain.

> Note: Render automatically sets the `PORT` environment variable. Do not set it manually.

---

## 4. Frontend Deployment (Vercel)

1. Go to [vercel.com](https://vercel.com) and create an account
2. Click **Add New → Project**
3. Import your GitHub repository
4. Set the following:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

5. No environment variables needed (API is proxied through `vercel.json`)

6. Click **Deploy**

> Important: The `vercel.json` file contains a rewrite rule that proxies `/api/*` requests to your Render backend. If your Render URL changes, update the destination URL in `frontend/vercel.json`.

> For Vercel to resolve the `@shared` import alias, the `shared/` folder must be at the repository root (sibling to `frontend/`). Vercel will handle this automatically if you deploy from the full repository.

---

## 5. Updating the API Proxy URL

If your Render backend URL changes, update `frontend/vercel.json`:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://YOUR-RENDER-URL.onrender.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

## 6. Post-Deployment Checklist

- [ ] Backend is running and accessible at your Render URL
- [ ] Frontend loads correctly at your Vercel URL
- [ ] Guest login works (creates anonymous user)
- [ ] Google login redirects correctly and creates a user
- [ ] Works on desktop, Android, and iOS Safari
- [ ] Transactions, accounts, and goals can be created
- [ ] Database tables were created successfully

---

## Troubleshooting

### iOS Safari shows loading or connection error
- This is usually caused by cross-origin cookie issues
- Make sure `vercel.json` has the API proxy rewrite configured correctly
- The proxy makes API requests same-origin, which fixes iOS Safari cookie restrictions

### "Page Not Found" after Google login
- Make sure `APP_URL` on the backend is set to your **frontend URL** (Vercel), not the Render URL
- The Google redirect URI in Google Console must also use the **frontend URL**:
  `https://your-project.vercel.app/api/auth/callback/google`

### "401 Unauthorized" on API requests
- Check that `SESSION_SECRET` is set on the backend
- Verify the `vercel.json` proxy is working by visiting `https://your-frontend.vercel.app/api/auth/user` in the browser

### Google login not working
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct on both the backend
- Check that the redirect URI in Google Console matches your frontend URL + `/api/auth/callback/google`
- Make sure the OAuth consent screen is configured and your email is added as a test user

### Database connection errors
- Verify your Supabase `DATABASE_URL` is correct
- Ensure SSL is enabled for production connections (the backend handles this automatically)
