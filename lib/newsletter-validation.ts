import { promises as dns } from "dns";

/**
 * Server-side newsletter email validation. Layers, strongest-practical first:
 *   1. Strict syntax + length.
 *   2. Reserved / disposable / obviously-fake domains (blocklist).
 *   3. `name@name.com`-style fake pattern (local part === domain label).
 *   4. DNS: the domain must actually be able to receive mail (MX, or an A/AAAA
 *      record per RFC 5321 implicit-MX). Fails OPEN on DNS errors/timeouts so a
 *      transient resolver hiccup never blocks a real subscriber.
 *
 * NOTE: this cannot prove a *mailbox* exists or is owned by the submitter — a
 * real domain like bsk.com / satti.com passes the DNS check. The only way to
 * guarantee that is double opt-in (a confirmation email), which needs an email
 * provider. This is the strongest validation possible without sending mail.
 */

// HTML5/WHATWG-style: valid labels + a dotted domain.
export const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Reserved / example / placeholder domains (RFC 2606 + common fakes).
const BLOCKED_DOMAINS = new Set([
  "example.com", "example.org", "example.net", "example.edu",
  "test.com", "test.net", "test.org", "test.test", "test",
  "domain.com", "email.com", "mail.com", "yourdomain.com",
  "localhost", "invalid", "none.com", "nourl.com", "fake.com",
]);

// Common disposable / throwaway providers.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "10minutemail.com",
  "tempmail.com", "temp-mail.org", "throwawaymail.com", "yopmail.com", "getnada.com",
  "dispostable.com", "trashmail.com", "sharklasers.com", "maildrop.cc", "fakeinbox.com",
  "mailnesia.com", "mintemail.com", "spam4.me", "tempinbox.com", "mohmal.com",
  "discard.email", "emailondeck.com", "moakt.com", "trbvm.com", "tmpmail.org",
]);

// Obvious junk local parts (low false-positive set).
const JUNK_LOCAL_PARTS = new Set([
  "test", "tests", "test123", "asdf", "asdfasdf", "qwerty", "qwertyuiop",
  "aaaa", "aaaaa", "xxxx", "xxxxx", "fake", "fakeemail", "notreal", "noemail",
]);

export type EmailCheck = { ok: true; email: string } | { ok: false; reason: string };

const GENERIC_INVALID = "Please enter a valid email address.";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("dns-timeout")), ms)),
  ]);
}

/** "ok" = can receive mail, "reject" = domain can't, "unknown" = DNS failed (fail open). */
async function domainCanReceiveMail(domain: string): Promise<"ok" | "reject" | "unknown"> {
  try {
    const mx = await withTimeout(dns.resolveMx(domain), 3000);
    if (Array.isArray(mx) && mx.some((r) => r.exchange && r.exchange.trim() !== "")) {
      return "ok";
    }
    // No usable MX → fall through to the A/AAAA (implicit-MX) check below.
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    // ENOTFOUND/ENODATA just mean "no MX" — try A records. Anything else
    // (timeout, SERVFAIL) is a resolver problem → don't penalize the user.
    if (code !== "ENOTFOUND" && code !== "ENODATA") return "unknown";
  }
  try {
    const a = await withTimeout(dns.resolve(domain), 3000);
    if (Array.isArray(a) && a.length > 0) return "ok";
    return "reject";
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOTFOUND" || code === "ENODATA") return "reject";
    return "unknown";
  }
}

export async function validateNewsletterEmail(raw: unknown): Promise<EmailCheck> {
  if (typeof raw !== "string") return { ok: false, reason: GENERIC_INVALID };
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, reason: GENERIC_INVALID };
  }

  const atIdx = email.lastIndexOf("@");
  const localPart = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  const sld = domain.split(".").slice(-2, -1)[0] || ""; // second-level label, e.g. "bsk" in bsk.com

  if (BLOCKED_DOMAINS.has(domain) || DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, reason: "Please use a permanent, non-disposable email address." };
  }
  if (JUNK_LOCAL_PARTS.has(localPart) || (sld && localPart === sld)) {
    // e.g. test@…, asdf@…, or the classic bsk@bsk.com / name@name.com pattern.
    return { ok: false, reason: "Please enter your real email address." };
  }

  const dnsResult = await domainCanReceiveMail(domain);
  if (dnsResult === "reject") {
    return { ok: false, reason: "That email domain can't receive mail. Please check your address." };
  }

  return { ok: true, email };
}
