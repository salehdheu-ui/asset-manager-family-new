import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { installProcessErrorHandlers, recordSystemError } from "./monitoring";
import { apiRateLimiter, redactSecrets, securityHeaders } from "./security";
import { createServer } from "http";

installProcessErrorHandlers();

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(securityHeaders);

const keepRawBody = (req: Request, _res: Response, buf: Buffer) => {
  req.rawBody = buf;
};

/**
 * حدّ حجم الجسم بحسب المسار.
 *
 * كان ١٠ ميغابايت على **كل** مسار — ويُفكّ الترميز قبل أي تحقق من هوية أو
 * حدّ معدّل، فأي طلب مجهول يُلزم الخادم بتحليل عشرة ميغابايت من JSON. الحدّ
 * المرتفع لا يحتاجه إلا استيراد نسخة كاملة، والمرفق لا يتجاوز ميغابايت
 * واحداً (يكبر نحو الثلث بترميز base64).
 */
app.use("/api/backups/import", express.json({ limit: "12mb", verify: keepRawBody }));
app.use("/api/attachments", express.json({ limit: "2mb", verify: keepRawBody }));
app.use(express.json({ limit: "256kb", verify: keepRawBody }));

app.use(express.urlencoded({ extended: false, limit: "256kb" }));

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

      // جسم الردّ لا يُكتب في سجل الإنتاج إطلاقاً، وفي التطوير يُكتب محجوب
      // الأسرار. كان يُكتب كما هو لكل مسار عدا /api/auth — ومسار إصدار كود
      // الاستعادة تحت /api/admin، فكان الكود ينسخ نفسه في السجل صالحاً
      // ثلاثين دقيقة، خلافاً لتعليق يقول إنه لا يُخزَّن نصاً في أي مكان.
      if (capturedJsonResponse && process.env.NODE_ENV !== "production") {
        const jsonStr = JSON.stringify(redactSecrets(capturedJsonResponse));
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

  // الحدّ العام قبل تسجيل المسارات — والحدود الأضيق على الدخول والاستعادة
  // وكتابات الوصي تبقى فوقه، فيقع الأشدّ منهما
  app.use("/api", apiRateLimiter);

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
