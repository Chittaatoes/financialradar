# Financial Radar — Deployment Guide

This guide explains how to deploy Financial Radar to production using **Vercel** (frontend), **Render** (backend API), and **Supabase** (database).

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
7. Under **Authorized redirect URIs**, add:
   ```
   https://your-backend-url.onrender.com/api/auth/callback/google
   ```
8. Click **Create** and save the **Client ID** and **Client Secret**

> Important: You also need to configure the **OAuth consent screen** under APIs & Services. Add your email as a test user if the app is in testing mode.

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
   | `APP_URL` | `https://your-service-name.onrender.com` |
   | `FRONTEND_URL` | `https://your-project.vercel.app` |
   | `NODE_ENV` | `production` |
   | `SUPER_ADMIN_EMAIL` | (Optional) Your email for admin access |

6. Click **Deploy**

> Note: Render automatically sets the `PORT` environment variable. Do not set it manually.

> After deployment, note your backend URL (e.g., `https://financial-radar-api.onrender.com`). You will need this for the frontend.

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

5. Add the following **Environment Variables**:

   | Variable | Value |
   |---|---|
   | `VITE_API_URL` | Your Render backend URL (e.g., `https://financial-radar-api.onrender.com`) |
   | `VITE_GOOGLE_CLIENT_ID` | Same Google Client ID used for the backend |

6. Click **Deploy**

> Important: For Vercel to resolve the `@shared` import alias, the `shared/` folder must be at the repository root (sibling to `frontend/`). Vercel will handle this automatically if you deploy from the full repository.

---

## 5. Post-Deployment Checklist

- [ ] Backend is running and accessible at your Render URL
- [ ] Frontend loads correctly at your Vercel URL
- [ ] Guest login works (creates anonymous user)
- [ ] Google login redirects correctly and creates a user
- [ ] Transactions, accounts, and goals can be created
- [ ] Database tables were created successfully

---

## 6. Updating the Google OAuth Redirect URI

After you know your final Render backend URL, go back to Google Cloud Console and update the **Authorized redirect URI** to:

```
https://your-actual-backend-url.onrender.com/api/auth/callback/google
```

---

## Troubleshooting

### "CORS error" in browser console
- Make sure `FRONTEND_URL` on the backend matches your Vercel URL exactly (no trailing slash)

### "401 Unauthorized" on API requests
- Check that `SESSION_SECRET` is set on the backend
- Ensure cookies are configured for cross-origin (`sameSite: "none"`, `secure: true` in production)

### Google login not working
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
- Check that the redirect URI in Google Console matches `APP_URL/api/auth/callback/google`
- Make sure the OAuth consent screen is configured

### Database connection errors
- Verify your Supabase `DATABASE_URL` is correct
- Ensure SSL is enabled for production connections (the backend handles this automatically)
