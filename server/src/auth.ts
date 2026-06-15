import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { NextFunction, Request, Response } from "express";
import { config } from "./config";

// Application Default Credentials on Cloud Run; project resolved from the env.
// Skipped under DEV_AUTH so local runs need no GCP credentials.
if (!config.devAuth && getApps().length === 0) initializeApp();

export interface AuthUser {
  uid: string;
  email: string;
}

// Express doesn't let us add typed properties cleanly without module augmentation;
// keep the user on a symbol-free field and read it back via getUser().
const USER_KEY = "__authUser";

export function getUser(req: Request): AuthUser {
  const u = (req as Request & Record<string, unknown>)[USER_KEY];
  if (!u) throw new Error("getUser called without requireUser middleware");
  return u as AuthUser;
}

function emailAllowed(email: string): boolean {
  if (config.allowedEmails.includes(email)) return true;
  const domain = email.split("@")[1] ?? "";
  return config.allowedDomains.includes(domain);
}

/** Verify the Firebase ID token and enforce the invite-only allowlist. */
export async function requireUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Local development: trust a header instead of verifying a real token. Never
  // enabled in production (DEV_AUTH defaults to false).
  if (config.devAuth) {
    const email = (req.header("x-dev-email") ?? "dev@example.com").toLowerCase();
    (req as Request & Record<string, unknown>)[USER_KEY] = { uid: `dev:${email}`, email };
    next();
    return;
  }

  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
    return;
  }

  const email = (decoded.email ?? "").toLowerCase();
  if (!email || decoded.email_verified !== true) {
    res.status(403).json({ error: "a verified email is required" });
    return;
  }
  if (!emailAllowed(email)) {
    res.status(403).json({ error: "this account is not on the allowlist" });
    return;
  }

  (req as Request & Record<string, unknown>)[USER_KEY] = { uid: decoded.uid, email };
  next();
}
