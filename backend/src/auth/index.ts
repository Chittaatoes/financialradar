import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool, db } from "../db";
import { users } from "../../shared/models/auth";
import { eq } from "drizzle-orm";

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  const PgSession = connectPg(session);

  const sessionStore = new PgSession({
    pool,
    tableName: "sessions",
    createTableIfMissing: true,
  });

  const isProduction = process.env.NODE_ENV === "production";

  app.use(
    session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET || "dev-secret-financial-radar",
      resave: false,
      saveUninitialized: false,
      rolling: true,
      proxy: true,
      cookie: {
        secure: isProduction,
        httpOnly: true,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  app.get("/api/login", (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res
        .status(500)
        .json({ message: "Google Auth not configured. Set GOOGLE_CLIENT_ID." });
    }

    const appUrl =
      process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
    const redirectUri = `${appUrl}/api/auth/callback/google`;

    const googleUrl = new URL(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    googleUrl.searchParams.set("client_id", clientId);
    googleUrl.searchParams.set("redirect_uri", redirectUri);
    googleUrl.searchParams.set("response_type", "code");
    googleUrl.searchParams.set("scope", "openid email profile");
    googleUrl.searchParams.set("access_type", "offline");
    googleUrl.searchParams.set("prompt", "consent");

    res.redirect(googleUrl.toString());
  });

  app.get("/api/auth/callback/google", async (req, res) => {
    const code = req.query.code as string;
const frontendUrl =
  process.env.FRONTEND_URL || "https://financialradar.vercel.app";
  if (!code) return res.redirect(frontendUrl || "/");

    try {
      const appUrl =
        process.env.APP_URL || `http://localhost:${process.env.PORT || 5000}`;
      const redirectUri = `${appUrl}/api/auth/callback/google`;

      const tokenRes = await fetch(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            redirect_uri: redirectUri,
            grant_type: "authorization_code",
          }),
        }
      );

      const tokens = await tokenRes.json();

      if (!tokens.access_token) {
        console.error("Google token exchange failed:", tokens);
        return res.redirect(`${frontendUrl}/?error=auth_failed`);
      }

      const userInfoRes = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        }
      );

      const googleUser = await userInfoRes.json();

      const existingUsers = await db
        .select()
        .from(users)
        .where(eq(users.id, googleUser.id));

      const isNewUser = existingUsers.length === 0;

      const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
      const shouldBeAdmin =
        isNewUser &&
        superAdminEmail &&
        googleUser.email === superAdminEmail;

      const [user] = await db
        .insert(users)
        .values({
          id: googleUser.id,
          email: googleUser.email,
          firstName: googleUser.given_name,
          lastName: googleUser.family_name,
          profileImageUrl: googleUser.picture,
          role: shouldBeAdmin ? "admin" : "user",
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: googleUser.email,
            firstName: googleUser.given_name,
            lastName: googleUser.family_name,
            profileImageUrl: googleUser.picture,
          },
        })
        .returning();

      (req.session as any).user = {
  id: user.id,
};

(req.session as any).isGuest = false;

req.session.save(() => {
  res.redirect(frontendUrl || "/");
});
} catch (error) {
  console.error("Google auth callback error:", error);
  res.redirect(`${frontendUrl}/?error=auth_failed`);
}

});

  app.get("/api/auth/user", async (req, res) => {
  const sessionUser = (req.session as any)?.user;

  if (!sessionUser) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, sessionUser.id));

  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }

  res.json(user);
});

  app.get("/api/logout", (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || "";
    req.session.destroy(() => {
      res.redirect(frontendUrl || "/");
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
};

export const isAuthenticated: RequestHandler = (
  req,
  res,
  next
) => {
  const user = (req.session as any)?.user;
  if (!user)
    return res.status(401).json({ message: "Unauthorized" });
  next();
};

export const isAdmin: RequestHandler = (req, res, next) => {
  const user = (req.session as any)?.user;

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  next();
};
