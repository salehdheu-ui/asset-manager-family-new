import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { installProcessErrorHandlers, recordSystemError } from "./monitoring";
import { createServer } from "http";

installProcessErrorHandlers();

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    // حد مرتفع ليسمح باستيراد ملفات النسخ الاحتياطية الكاملة
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && !path.startsWith("/api/auth")) {
        const jsonStr = JSON.stringify(capturedJsonResponse);
        logLine += ` :: ${jsonStr.length > 200 ? jsonStr.substring(0, 200) + '...' : jsonStr}`;
      }

      log(logLine);
    }
  });

  next();
});

// فحص الصحة — يُجيب قبل تسجيل بقية المسارات حتى يبقى صالحاً
// حتى لو تعثّر شيء بعده. منصّات النشر (Coolify وغيرها) تعتمد عليه
// لتقرّر هل نجح النشر أم تُبقي الحاوية القديمة.
app.get("/api/health", async (_req, res) => {
  try {
    const { pool } = await import("./db");
    // هل قاعدة البيانات متصلة، وهل جرى ترحيل المخطط بعد آخر تحديث؟
    const { rows } = await pool.query(
      "select to_regclass('public.contribution_rates') is not null as ready",
    );
    const schemaReady = Boolean(rows[0]?.ready);
    res.status(schemaReady ? 200 : 503).json({
      status: schemaReady ? "ok" : "degraded",
      database: "connected",
      schemaReady,
      // المزامنة التلقائية تنشئ الناقص عند الإقلاع؛ بقاء الجداول ناقصة يعني
      // أنها عُطّلت بـ SCHEMA_SYNC=off أو تعثّرت — والحلّ حينها بيد صاحبها
      ...(schemaReady ? {} : { hint: "الجداول ناقصة — راجع سجل الإقلاع أو شغّل npm run db:push" }),
    });
  } catch (error) {
    res.status(503).json({ status: "error", database: "unreachable" });
  }
});

(async () => {
  // إلحاق الجداول الناقصة قبل أي شيء يقرأ منها — إنشاء محض لا يمسّ قائماً،
  // وفشله لا يمنع الإقلاع (انظر schema-sync.ts)
  try {
    const { syncSchema } = await import("./schema-sync");
    await syncSchema();
  } catch (error) {
    console.error("تعذّرت مزامنة المخطط — الخادم يكمل الإقلاع:", error);
  }

  await registerRoutes(httpServer, app);

  // الإشعارات: تُقرأ المفاتيح أو تُولَّد وتُحفظ، ثم تبدأ الجدولة
  const { initPush, startNotificationScheduler } = await import("./services/push");
  await initPush();
  startNotificationScheduler();

  // التذكيرات التلقائية بالأقساط والمساهمات — تصمت بلا مفاتيح VAPID
  const { startReminderScheduler } = await import("./services/reminders");
  startReminderScheduler();

  /**
   * مسار `/api` لم يطابق شيئاً ⇒ ٤٠٤ بصيغة JSON.
   *
   * بلا هذا يبتلعه احتياطي الواجهة أدناه فيردّ `index.html` برمز ٢٠٠: العميل
   * يظن الطلب نجح ثم ينهار وهو يفكّ صفحة HTML على أنها JSON، والرسالة التي
   * تصل المستخدم لا تدل على شيء. وطلبٌ إلى مسار محذوف يبدو حياً في المراقبة.
   */
  app.use("/api/{*path}", (req: Request, res: Response) => {
    // originalUrl لا path: داخل app.use يُقتطع مسار التركيب فيصير «/» وحده
    res.status(404).json({ message: `لا يوجد مسار ${req.method} ${req.originalUrl}` });
  });

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);
    recordSystemError(err, `${req.method} ${req.path}`);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const listenOptions: Parameters<typeof httpServer.listen>[0] = {
    port,
    host: "0.0.0.0",
  };

  if (process.platform !== "win32") {
    listenOptions.reusePort = true;
  }

  httpServer.listen(listenOptions, () => {
    log(`serving on port ${port}`);
  });
})();
