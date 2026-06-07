import type { PublicUser } from "@shared/models/auth";

declare module "express-serve-static-core" {
  interface Request {
    user?: PublicUser;
  }
}

export {};
