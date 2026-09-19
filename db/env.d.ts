declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    PORTAL_SHEET_WEBHOOK_URL?: string;
    PORTAL_SHEET_SECRET?: string;
    PORTAL_ADMIN_EMAIL?: string;
    PORTAL_COMMISSIONER_CODE?: string;
    PORTAL_COMMISSIONER_SESSION?: string;
  }
}
