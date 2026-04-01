import { existsSync, readFileSync } from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf8");

  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['\"]|['\"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}
