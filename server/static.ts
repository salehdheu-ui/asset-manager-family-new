import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(
    express.static(distPath, {
      setHeaders: (res, filePath) => {
        const name = path.basename(filePath);

        // عامل الخدمة يجب أن يُطلب من الشبكة كل مرة، وإلا بقي المستخدم على
        // نسخة قديمة منه لا تعرف كيف تجلب البناء الجديد. والبيان مثله.
        if (name === "sw.js" || name === "manifest.webmanifest") {
          res.setHeader("Cache-Control", "no-cache");
          return;
        }

        // ملفات البناء تحمل بصمة محتواها في اسمها، فتخزينها الطويل آمن
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    // الصفحة نفسها لا تُخزَّن: هي التي تشير إلى بصمات الملفات الجديدة
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
