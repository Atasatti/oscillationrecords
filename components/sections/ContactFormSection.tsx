"use client";

import React, { useState } from "react";
import IconButton from "../local-ui/IconButton";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

const ContactFormSection = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Point inputs at the status message only when one is shown, so screen
  // readers associate the error/success with the fields.
  const describedBy =
    status.kind === "error" || status.kind === "success" ? "contact-status" : undefined;

  const submit = async () => {
    if (status.kind === "submitting") return;

    if (!name.trim() || !email.trim() || !message.trim()) {
      setStatus({ kind: "error", message: "Please fill in your name, email, and message." });
      return;
    }

    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Something went wrong. Please try again.");
      }
      setStatus({ kind: "success" });
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    }
  };

  return (
    <div className=" py-24">
      <p className="font-light text-5xl tracking-tighter">
        Let’s get your music heard.
      </p>
      <p className="text-muted-foreground text-lg mt-3 font-light">
        Artist, visionary, or just someone with big ideas? We’re here to listen.
        Let’s talk.
      </p>
      <form
        className="mt-14 space-y-5 max-w-[360px]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="contact-name" className="sr-only">
          Your name
        </label>
        <Input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-required="true"
          aria-invalid={status.kind === "error" && !name.trim() ? true : undefined}
          aria-describedby={describedBy}
          className="placeholder:font-light rounded-full !py-5"
        />

        <label htmlFor="contact-email" className="sr-only">
          Your email
        </label>
        <Input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-required="true"
          aria-invalid={status.kind === "error" && !email.trim() ? true : undefined}
          aria-describedby={describedBy}
          className="placeholder:font-light rounded-full !py-5"
        />

        <label htmlFor="contact-message" className="sr-only">
          Your message
        </label>
        <Textarea
          id="contact-message"
          name="message"
          placeholder="Enter your message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-required="true"
          aria-invalid={status.kind === "error" && !message.trim() ? true : undefined}
          aria-describedby={describedBy}
          className="placeholder:font-light min-h-[120px] max-h-[200px] resize-none no-scrollbar rounded-3xl !py-5"
          rows={5}
        />
      </form>

      {status.kind === "success" ? (
        <p
          id="contact-status"
          role="status"
          aria-live="polite"
          className="mt-4 text-sm text-green-500/90 font-light"
        >
          Thanks — your message has been sent. We’ll be in touch.
        </p>
      ) : status.kind === "error" ? (
        <p
          id="contact-status"
          role="alert"
          aria-live="assertive"
          className="mt-4 text-sm text-red-400/90 font-light"
        >
          {status.message}
        </p>
      ) : null}

      <IconButton
        text={status.kind === "submitting" ? "Sending…" : "Get In Touch"}
        onClick={submit}
        disabled={status.kind === "submitting"}
        aria-label="Send your message"
        className="w-fit mt-10"
      />
    </div>
  );
};

export default ContactFormSection;
