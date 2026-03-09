import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool, db } from "../db";
import { users } from "../../shared/models/auth";
import { eq } from "drizzle-orm";

async function migrateGuestDataToGoogleUser(guestId: string, googleId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const childTables = [
      "accounts",
      "transactions",
      "goals",
      "liabilities",
      "xp_logs",
      "streak_logs",
      "custom_categories",
      "daily_focus",
      "user_badges",
      "budget_allocations",
      "budget_plans",
    ];
    for (const table of childTables) {
      await client.query(
        `UPDATE ${table} SET user_id = $1 WHERE user_id = $2`,
        [googleId, guestId]
      );
    }

    const guestProfile = await client.query(
      `SELECT * FROM user_profiles WHERE user_id = $1`,
      [guestId]
    );

    if (guestProfile.rows.length > 0) {
      const p = guestProfile.rows[0];
      await client.query(
        `INSERT INTO user_profiles (
          user_id, xp, level, streak_count, streak_last_active,
          revive_remaining, revive_reset_date, unlocked_features,
          is_admin, risk_profile, monthly_income, primary_goal,
          habit_type, focus_areas, score_bonus_today, score_bonus_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (user_id) DO UPDATE SET
          xp = GREATEST(user_profiles.xp, EXCLUDED.xp),
          level = GREATEST(user_profiles.level, EXCLUDED.level),
          streak_count = GREATEST(user_profiles.streak_count, EXCLUDED.streak_count),
          streak_last_active = COALESCE(user_profiles.streak_last_active, EXCLUDED.streak_last_active),
          revive_remaining = GREATEST(user_profiles.revive_remaining, EXCLUDED.revive_remaining),
          unlocked_features = EXCLUDED.unlocked_features,
          monthly_income = COALESCE(EXCLUDED.monthly_income, user_profiles.monthly_income),
          primary_goal = COALESCE(EXCLUDED.primary_goal, user_profiles.primary_goal),
          habit_type = COALESCE(EXCLUDED.habit_type, user_profiles.habit_type),
          focus_areas = EXCLUDED.focus_areas`,
        [
          googleId,
          p.xp, p.level, p.streak_count, p.streak_last_active,
          p.revive_remaining, p.revive_reset_date, p.unlocked_features,
          p.is_admin, p.risk_profile, p.monthly_income, p.primary_goal,
          p.habit_type, p.focus_areas, p.score_bonus_today, p.score_bonus_date,
        ]
      );
      await client.query(`DELETE FROM user_profiles WHERE user_id = $1`, [guestId]);
    }

    await client.query(`DELETE FROM users WHERE id = $1`, [guestId]);

    await client.query("COMMIT");
    console.log(`[auth] Migrated guest ${guestId} → Google user ${googleId}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[auth] Migration failed, rolled back:", err);
    throw err;
  } finally {
    client.release();
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);

  const PgSession = connectPg(session);

  const sessionStore = new PgSession({
    pool,
    tableName: "sessions",
    createTableIfMissing: true,
  });

  const isProduction = process.env.NODE_ENV === "production";
  const isHttps = isProduction || !!process.env.REPLIT_DEV_DOMAIN;

  app.use(
    session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET || "dev-secret-financial-radar",
      resave: false,
      saveUninitialized: false,
      rolling: true,
      proxy: true,
      cookie: {
        secure: isHttps,
        httpOnly: true,
        sameSite: isHttps ? "none" : "lax",
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

    const replitDomain = process.env.REPLIT_DEV_DOMAIN;
    const appUrl = process.env.APP_URL ||
      (replitDomain ? `https://${replitDomain}` : `http://localhost:${process.env.PORT || 5000}`);
    const redirectUri = `${appUrl}/api/auth/callback/google`;

    const sessionUser = (req.session as any)?.user;
    if (sessionUser?.isGuest === true) {
      (req.session as any).guestId = sessionUser.id;
    }

    const googleUrl = new URL(
      "https://accounts.google.com/o/oauth2/v2/auth"
    );
    googleUrl.searchParams.set("client_id", clientId);
    googleUrl.searchParams.set("redirect_uri", redirectUri);
    googleUrl.searchParams.set("response_type", "code");
    googleUrl.searchParams.set("scope", "openid email profile");
    googleUrl.searchParams.set("access_type", "offline");
    googleUrl.searchParams.set("prompt", "consent");

    req.session.save(() => {
      res.redirect(googleUrl.toString());
    });
  });

  app.get("/api/auth/callback/google", async (req, res) => {
    const code = req.query.code as string;
    const replitDomain = process.env.REPLIT_DEV_DOMAIN;
    const frontendUrl = process.env.FRONTEND_URL ||
      (replitDomain ? `https://${replitDomain}` : "http://localhost:5000");
    if (!code) return res.redirect(frontendUrl || "/");

    try {
      const appUrl = process.env.APP_URL ||
        (replitDomain ? `https://${replitDomain}` : `http://localhost:${process.env.PORT || 5000}`);
      const redirectUri = `${appUrl}/api/auth/callback/google`;

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokens = await tokenRes.json();
      if (!tokens.access_token) {
        console.error("Google token exchange failed:", tokens);
        return res.redirect(`${frontendUrl}/?error=auth_failed`);
      }

      const userInfoRes = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const googleUser = await userInfoRes.json();

      const sessionUser = (req.session as any)?.user;
      const isCurrentlyGuest = sessionUser?.isGuest === true;
      const guestId: string | null =
        (req.session as any).guestId ||
        (isCurrentlyGuest ? sessionUser.id : null);

      const existingUsers = await db
        .select()
        .from(users)
        .where(eq(users.id, googleUser.id));
      const isNewGoogleUser = existingUsers.length === 0;

      const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
      const shouldBeAdmin = isNewGoogleUser && superAdminEmail && googleUser.email === superAdminEmail;

      const [user] = await db
        .insert(users)
        .values({
          id: googleUser.id,
          email: googleUser.email,
          firstName: googleUser.given_name,
          lastName: googleUser.family_name,
          profileImageUrl: googleUser.picture,
          isGuest: false,
          role: shouldBeAdmin ? "admin" : "user",
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: googleUser.email,
            firstName: googleUser.given_name,
            lastName: googleUser.family_name,
            profileImageUrl: googleUser.picture,
            isGuest: false,
          },
        })
        .returning();

      if (guestId && isNewGoogleUser) {
        try {
          await migrateGuestDataToGoogleUser(guestId, user.id);
        } catch (migrationErr) {
          console.error("[auth] Guest migration failed (non-fatal):", migrationErr);
        }
      }

      (req.session as any).user = { id: user.id };
      (req.session as any).isGuest = false;
      delete (req.session as any).guestId;

      req.session.save(() => {
        res.redirect(`${frontendUrl || ""}/?login=success`);
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

export const isAuthenticated: RequestHandler = (req, res, next) => {
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
