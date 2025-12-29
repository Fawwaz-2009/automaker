/**
 * Authentication middleware for API security
 *
 * Supports two authentication methods:
 * 1. Header-based (X-API-Key) - Used by Electron mode
 * 2. Cookie-based (HTTP-only session cookie) - Used by web mode
 *
 * Auto-generates an API key on first run if none is configured.
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';
const API_KEY_FILE = path.join(DATA_DIR, '.api-key');
const SESSIONS_FILE = path.join(DATA_DIR, '.sessions');
const SESSION_COOKIE_NAME = 'automaker_session';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Session store - persisted to file for survival across server restarts
const validSessions = new Map<string, { createdAt: number; expiresAt: number }>();

/**
 * Load sessions from file on startup
 */
function loadSessions(): void {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      const sessions = JSON.parse(data) as Array<
        [string, { createdAt: number; expiresAt: number }]
      >;
      const now = Date.now();
      let loadedCount = 0;
      let expiredCount = 0;

      for (const [token, session] of sessions) {
        // Only load non-expired sessions
        if (session.expiresAt > now) {
          validSessions.set(token, session);
          loadedCount++;
        } else {
          expiredCount++;
        }
      }

      if (loadedCount > 0 || expiredCount > 0) {
        console.log(`[Auth] Loaded ${loadedCount} sessions (${expiredCount} expired)`);
      }
    }
  } catch (error) {
    console.warn('[Auth] Error loading sessions:', error);
  }
}

/**
 * Save sessions to file
 */
function saveSessions(): void {
  try {
    fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
    const sessions = Array.from(validSessions.entries());
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions), { encoding: 'utf-8', mode: 0o600 });
  } catch (error) {
    console.error('[Auth] Failed to save sessions:', error);
  }
}

// Load existing sessions on startup
loadSessions();

/**
 * Ensure an API key exists - either from env var, file, or generate new one.
 * This provides CSRF protection by requiring a secret key for all API requests.
 */
function ensureApiKey(): string {
  // First check environment variable (Electron passes it this way)
  if (process.env.AUTOMAKER_API_KEY) {
    console.log('[Auth] Using API key from environment variable');
    return process.env.AUTOMAKER_API_KEY;
  }

  // Try to read from file
  try {
    if (fs.existsSync(API_KEY_FILE)) {
      const key = fs.readFileSync(API_KEY_FILE, 'utf-8').trim();
      if (key) {
        console.log('[Auth] Loaded API key from file');
        return key;
      }
    }
  } catch (error) {
    console.warn('[Auth] Error reading API key file:', error);
  }

  // Generate new key
  const newKey = crypto.randomUUID();
  try {
    fs.mkdirSync(path.dirname(API_KEY_FILE), { recursive: true });
    fs.writeFileSync(API_KEY_FILE, newKey, { encoding: 'utf-8', mode: 0o600 });
    console.log('[Auth] Generated new API key');
  } catch (error) {
    console.error('[Auth] Failed to save API key:', error);
  }
  return newKey;
}

// API key - always generated/loaded on startup for CSRF protection
const API_KEY = ensureApiKey();

// Print API key to console for web mode users
console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║  🔐 API Key for Web Mode Authentication                               ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  When accessing via browser, you'll be prompted to enter this key:    ║
║                                                                       ║
║    ${API_KEY}
║                                                                       ║
║  In Electron mode, authentication is handled automatically.          ║
╚═══════════════════════════════════════════════════════════════════════╝
`);

/**
 * Generate a cryptographically secure session token
 */
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a new session and return the token
 */
export function createSession(): string {
  const token = generateSessionToken();
  const now = Date.now();
  validSessions.set(token, {
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE_MS,
  });
  saveSessions(); // Persist to file
  return token;
}

/**
 * Validate a session token
 */
export function validateSession(token: string): boolean {
  const session = validSessions.get(token);
  if (!session) return false;

  if (Date.now() > session.expiresAt) {
    validSessions.delete(token);
    saveSessions(); // Persist removal
    return false;
  }

  return true;
}

/**
 * Invalidate a session token
 */
export function invalidateSession(token: string): void {
  validSessions.delete(token);
  saveSessions(); // Persist removal
}

/**
 * Validate the API key
 */
export function validateApiKey(key: string): boolean {
  return key === API_KEY;
}

/**
 * Get session cookie options
 */
export function getSessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true, // JavaScript cannot access this cookie
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict', // Only sent for same-site requests (CSRF protection)
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  };
}

/**
 * Get the session cookie name
 */
export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

/**
 * Authentication middleware
 *
 * Accepts either:
 * 1. X-API-Key header (for Electron mode)
 * 2. X-Session-Token header (for web mode with explicit token)
 * 3. apiKey query parameter (fallback for cases where headers can't be set)
 * 4. Session cookie (for web mode)
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check for API key in header (Electron mode)
  const headerKey = req.headers['x-api-key'] as string | undefined;
  if (headerKey) {
    if (headerKey === API_KEY) {
      next();
      return;
    }
    res.status(403).json({
      success: false,
      error: 'Invalid API key.',
    });
    return;
  }

  // Check for session token in header (web mode with explicit token)
  const sessionTokenHeader = req.headers['x-session-token'] as string | undefined;
  if (sessionTokenHeader) {
    if (validateSession(sessionTokenHeader)) {
      next();
      return;
    }
    res.status(403).json({
      success: false,
      error: 'Invalid or expired session token.',
    });
    return;
  }

  // Check for API key in query parameter (fallback)
  const queryKey = req.query.apiKey as string | undefined;
  if (queryKey) {
    if (queryKey === API_KEY) {
      next();
      return;
    }
    res.status(403).json({
      success: false,
      error: 'Invalid API key.',
    });
    return;
  }

  // Check for session cookie (web mode)
  const sessionToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (sessionToken && validateSession(sessionToken)) {
    next();
    return;
  }

  // No valid authentication
  res.status(401).json({
    success: false,
    error: 'Authentication required.',
  });
}

/**
 * Check if authentication is enabled (always true now)
 */
export function isAuthEnabled(): boolean {
  return true;
}

/**
 * Get authentication status for health endpoint
 */
export function getAuthStatus(): { enabled: boolean; method: string } {
  return {
    enabled: true,
    method: 'api_key_or_session',
  };
}

/**
 * Check if a request is authenticated (for status endpoint)
 */
export function isRequestAuthenticated(req: Request): boolean {
  // Check API key header
  const headerKey = req.headers['x-api-key'] as string | undefined;
  if (headerKey && headerKey === API_KEY) {
    return true;
  }

  // Check session token header
  const sessionTokenHeader = req.headers['x-session-token'] as string | undefined;
  if (sessionTokenHeader && validateSession(sessionTokenHeader)) {
    return true;
  }

  // Check query parameter
  const queryKey = req.query.apiKey as string | undefined;
  if (queryKey && queryKey === API_KEY) {
    return true;
  }

  // Check cookie
  const sessionToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (sessionToken && validateSession(sessionToken)) {
    return true;
  }

  return false;
}
