import bcrypt from "bcryptjs";
import session from "express-session";
import connectPg from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET environment variable is required in production");
  }

  return session({
    secret: sessionSecret || "dev-only-secret-" + Math.random().toString(36),
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "اسم المستخدم وكلمة المرور مطلوبان" });
      }

      const [user] = await db.select().from(users).where(eq(users.username, username));

      if (!user) {
        return res.status(401).json({ message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      }

      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        return res.status(401).json({ message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      }

      req.session.userId = user.id;
      
      res.json({
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        memberId: user.memberId,
        profileImageUrl: user.profileImageUrl,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "حدث خطأ أثناء تسجيل الدخول" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "حدث خطأ أثناء تسجيل الخروج" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "تم تسجيل الخروج بنجاح" });
    });
  });

  // Get current user
  app.get("/api/auth/user", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "غير مصرح" });
    }

    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));

      if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "غير مصرح" });
      }

      res.json({
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        memberId: user.memberId,
        profileImageUrl: user.profileImageUrl,
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "حدث خطأ" });
    }
  });

  // Admin: Create user
  app.post("/api/admin/users", isAdmin, async (req, res) => {
    try {
      const { username, password, firstName, lastName, email, role, memberId } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "اسم المستخدم وكلمة المرور مطلوبان" });
      }

      const existingUser = await db.select().from(users).where(eq(users.username, username));
      if (existingUser.length > 0) {
        return res.status(400).json({ message: "اسم المستخدم موجود مسبقاً" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const [newUser] = await db.insert(users).values({
        username,
        password: hashedPassword,
        firstName,
        lastName,
        email,
        role: role || "user",
        memberId,
      }).returning();

      res.json({
        id: newUser.id,
        username: newUser.username,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        role: newUser.role,
        memberId: newUser.memberId,
      });
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ message: "حدث خطأ أثناء إنشاء المستخدم" });
    }
  });

  // Admin: Update user password
  app.put("/api/admin/users/:id/password", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ message: "كلمة المرور مطلوبة" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await db.update(users).set({ password: hashedPassword, updatedAt: new Date() }).where(eq(users.id, id));

      res.json({ message: "تم تحديث كلمة المرور بنجاح" });
    } catch (error) {
      console.error("Update password error:", error);
      res.status(500).json({ message: "حدث خطأ أثناء تحديث كلمة المرور" });
    }
  });

  // Admin: Update user
  app.put("/api/admin/users/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { username, firstName, lastName, email, role, memberId } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (username) updateData.username = username;
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (email !== undefined) updateData.email = email;
      if (role) updateData.role = role;
      if (memberId !== undefined) updateData.memberId = memberId;

      const [updatedUser] = await db.update(users).set(updateData).where(eq(users.id, id)).returning();

      res.json({
        id: updatedUser.id,
        username: updatedUser.username,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        role: updatedUser.role,
        memberId: updatedUser.memberId,
      });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ message: "حدث خطأ أثناء تحديث المستخدم" });
    }
  });

  // Admin: Delete user
  app.delete("/api/admin/users/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await db.delete(users).where(eq(users.id, id));
      res.json({ message: "تم حذف المستخدم بنجاح" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ message: "حدث خطأ أثناء حذف المستخدم" });
    }
  });

  // Admin: Get all users
  app.get("/api/admin/users", isAdmin, async (req, res) => {
    try {
      const allUsers = await db.select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        memberId: users.memberId,
        createdAt: users.createdAt,
      }).from(users);
      res.json(allUsers);
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ message: "حدث خطأ" });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "غير مصرح" });
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
    if (!user) {
      return res.status(401).json({ message: "غير مصرح" });
    }
    (req as any).user = user;
    next();
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ" });
  }
};

export const isAdmin: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "غير مصرح" });
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "غير مسموح - صلاحيات المدير مطلوبة" });
    }
    (req as any).user = user;
    next();
  } catch (error) {
    res.status(500).json({ message: "حدث خطأ" });
  }
};

// Create default admin user if not exists
export async function createDefaultAdmin() {
  try {
    const existingAdmin = await db.select().from(users).where(eq(users.username, "admin"));
    if (existingAdmin.length === 0) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await db.insert(users).values({
        username: "admin",
        password: hashedPassword,
        firstName: "المدير",
        lastName: "العام",
        role: "admin",
      });
      console.log("Default admin user created: admin / admin123");
    }
  } catch (error) {
    console.error("Error creating default admin:", error);
  }
}
