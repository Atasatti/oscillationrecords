import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSendBody, emailConfigured, emailProvider } from "./email";

// The delivery layer is intentionally thin — the campaign system, scheduler,
// subscriber list, tracking and unsubscribe are all in-house — so what needs
// pinning is exactly two things: which provider a given env resolves to, and
// that each provider receives its own payload shape.

const ENV_KEYS = ["SENDGRID_API_KEY", "RESEND_API_KEY", "EMAIL_PROVIDER", "EMAIL_FROM"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("emailProvider", () => {
  it("is null with no keys at all", () => {
    expect(emailProvider()).toBeNull();
  });

  it("resolves from whichever single key is set", () => {
    process.env.SENDGRID_API_KEY = "SG.x";
    expect(emailProvider()).toBe("sendgrid");
    delete process.env.SENDGRID_API_KEY;
    process.env.RESEND_API_KEY = "re_x";
    expect(emailProvider()).toBe("resend");
  });

  it("EMAIL_PROVIDER picks when both keys are present", () => {
    process.env.SENDGRID_API_KEY = "SG.x";
    process.env.RESEND_API_KEY = "re_x";
    process.env.EMAIL_PROVIDER = "resend";
    expect(emailProvider()).toBe("resend");
    process.env.EMAIL_PROVIDER = "sendgrid";
    expect(emailProvider()).toBe("sendgrid");
  });

  it("naming a provider whose key is missing stays OFF, not the other provider", () => {
    // Misconfiguration must not silently send through a provider the operator
    // didn't choose (wrong verified sender, wrong suppression list).
    process.env.RESEND_API_KEY = "re_x";
    process.env.EMAIL_PROVIDER = "sendgrid";
    expect(emailProvider()).toBeNull();
    expect(emailConfigured()).toBe(false);
  });

  it("emailConfigured also requires EMAIL_FROM", () => {
    process.env.SENDGRID_API_KEY = "SG.x";
    expect(emailConfigured()).toBe(false);
    process.env.EMAIL_FROM = "hello@oscillationrecords.com";
    expect(emailConfigured()).toBe(true);
  });
});

describe("buildSendBody", () => {
  const msg = {
    to: "fan@example.com",
    subject: "New release",
    html: "<p>Out now</p>",
    fromName: "Oscillation Records",
    replyTo: "reply@oscillationrecords.com",
  };
  const FROM = "hello@oscillationrecords.com";

  it("builds SendGrid's v3 mail/send shape", () => {
    expect(buildSendBody("sendgrid", msg, FROM)).toEqual({
      personalizations: [{ to: [{ email: "fan@example.com" }] }],
      from: { email: FROM, name: "Oscillation Records" },
      subject: "New release",
      content: [{ type: "text/html", value: "<p>Out now</p>" }],
      reply_to: { email: "reply@oscillationrecords.com" },
    });
  });

  it("builds Resend's shape with a display-name from string", () => {
    expect(buildSendBody("resend", msg, FROM)).toEqual({
      from: `Oscillation Records <${FROM}>`,
      to: ["fan@example.com"],
      subject: "New release",
      html: "<p>Out now</p>",
      reply_to: "reply@oscillationrecords.com",
    });
  });

  it("omits the optional fields when absent", () => {
    const bare = { to: ["a@x.com", "b@x.com"], subject: "s", html: "<p>h</p>" };
    const sg = buildSendBody("sendgrid", bare, FROM);
    expect(sg).not.toHaveProperty("reply_to");
    expect(sg.from).toEqual({ email: FROM });
    expect(sg.personalizations).toEqual([{ to: [{ email: "a@x.com" }, { email: "b@x.com" }] }]);
    const re = buildSendBody("resend", bare, FROM);
    expect(re).not.toHaveProperty("reply_to");
    expect(re.from).toBe(FROM);
    expect(re.to).toEqual(["a@x.com", "b@x.com"]);
  });
});
