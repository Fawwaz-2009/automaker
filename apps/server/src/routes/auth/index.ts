/**
 * Auth routes - Login, logout, and status endpoints
 *
 * Security model:
 * - Web mode: User enters API key (shown on server console) to get HTTP-only session cookie
 * - Electron mode: Uses X-API-Key header (handled automatically via IPC)
 *
 * The session cookie is:
 * - HTTP-only: JavaScript cannot read it (protects against XSS)
 * - SameSite=Strict: Only sent for same-site requests (protects against CSRF)
 *
 * Mounted at /api/auth in the main server (BEFORE auth middleware).
 */

import { Router } from 'express';
import {
  validateApiKey,
  createSession,
  invalidateSession,
  getSessionCookieOptions,
  getSessionCookieName,
  isRequestAuthenticated,
} from '../../lib/auth.js';

/**
 * Create auth routes
 *
 * @returns Express Router with auth endpoints
 */
export function createAuthRoutes(): Router {
  const router = Router();

  /**
   * GET /api/auth/status
   *
   * Returns whether the current request is authenticated.
   * Used by the UI to determine if login is needed.
   */
  router.get('/status', (req, res) => {
    const authenticated = isRequestAuthenticated(req);
    res.json({
      success: true,
      authenticated,
      required: true,
    });
  });

  /**
   * POST /api/auth/login
   *
   * Validates the API key and sets a session cookie.
   * Body: { apiKey: string }
   */
  router.post('/login', (req, res) => {
    const { apiKey } = req.body as { apiKey?: string };

    if (!apiKey) {
      res.status(400).json({
        success: false,
        error: 'API key is required.',
      });
      return;
    }

    if (!validateApiKey(apiKey)) {
      res.status(401).json({
        success: false,
        error: 'Invalid API key.',
      });
      return;
    }

    // Create session and set cookie
    const sessionToken = createSession();
    const cookieOptions = getSessionCookieOptions();
    const cookieName = getSessionCookieName();

    res.cookie(cookieName, sessionToken, cookieOptions);
    res.json({
      success: true,
      message: 'Logged in successfully.',
      // Return token for explicit header-based auth (works around cross-origin cookie issues)
      token: sessionToken,
    });
  });

  /**
   * GET /api/auth/token
   *
   * Returns the session token if the user has a valid session cookie.
   * This allows the UI to get a token for explicit header-based auth
   * after a page refresh (when the token in memory is lost).
   */
  router.get('/token', (req, res) => {
    const cookieName = getSessionCookieName();
    const sessionToken = req.cookies?.[cookieName] as string | undefined;

    if (!sessionToken) {
      res.status(401).json({
        success: false,
        error: 'No session cookie found.',
      });
      return;
    }

    // Validate the session is still valid
    if (!isRequestAuthenticated(req)) {
      res.status(401).json({
        success: false,
        error: 'Session expired.',
      });
      return;
    }

    // Return the existing session token for header-based auth
    res.json({
      success: true,
      token: sessionToken,
    });
  });

  /**
   * POST /api/auth/logout
   *
   * Clears the session cookie and invalidates the session.
   */
  router.post('/logout', (req, res) => {
    const cookieName = getSessionCookieName();
    const sessionToken = req.cookies?.[cookieName] as string | undefined;

    if (sessionToken) {
      invalidateSession(sessionToken);
    }

    // Clear the cookie
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });

    res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  });

  return router;
}
