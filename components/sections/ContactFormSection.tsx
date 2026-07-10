"use client";

import React, { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Paperclip, X } from "lucide-react";
import IconButton from "../local-ui/IconButton";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  CONTACT_MESSAGE_MAX,
  MAX_CONTACT_ATTACHMENTS,
  MAX_CONTACT_ATTACHMENT_BYTES,
  CONTACT_ATTACHMENT_ACCEPT,
  CONTACT_ATTACHMENT_EXT_RE,
  isAllowedContactAttachmentType,
} from "@/lib/contact-input";

type Status =
  | { kind: "idle" }
  | { kind: "submitting"; phase: "uploading" | "sending" }
  | { kind: "success" }
  | { kind: "error"; message: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Some browsers report an empty MIME type (notably for WAV). Fall back to the
// extension so the type check, presign, and PUT Content-Type all agree.
function inferType(file: File): string {
  if (isAllowedContactAttachmentType(file.type)) return file.type;
  const ext = file.name.toLowerCase().match(CONTACT_ATTACHMENT_EXT_RE)?.[1];
  switch (ext) {
    case "wav":
      return "audio/wav";
    case "mp3":
      return "audio/mpeg";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return file.type || "application/octet-stream";
  }
}

const ContactFormSection = () => {
  const { data: session, status: authStatus } = useSession();
  const authed = authStatus === "authenticated";
  const sessionName = session?.user?.name || "";
  const sessionEmail = session?.user?.email || "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  // Honeypot — stays empty for real users; a bot that fills every field trips it.
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitting = status.kind === "submitting";

  // Point inputs at the status message only when one is shown, so screen readers
  // associate the error/success with the fields.
  const describedBy =
    status.kind === "error" || status.kind === "success" ? "contact-status" : undefined;

  const addFiles = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files];
    for (const f of Array.from(picked)) {
      if (next.length >= MAX_CONTACT_ATTACHMENTS) {
        setStatus({ kind: "error", message: `You can attach up to ${MAX_CONTACT_ATTACHMENTS} files.` });
        break;
      }
      if (!isAllowedContactAttachmentType(inferType(f))) {
        setStatus({ kind: "error", message: `"${f.name}" isn't a supported type (WAV, MP3, PNG, JPG).` });
        continue;
      }
      if (f.size > MAX_CONTACT_ATTACHMENT_BYTES) {
        setStatus({ kind: "error", message: `"${f.name}" is larger than the 100 MB limit.` });
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      next.push(f);
    }
    setFiles(next);
  };

  const removeFile = (index: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== index));

  const submit = async () => {
    if (submitting) return;

    if (!authed && (!name.trim() || !email.trim())) {
      setStatus({ kind: "error", message: "Please fill in your name, email, and message." });
      return;
    }
    if (!message.trim()) {
      setStatus({ kind: "error", message: "Please enter a message." });
      return;
    }

    setStatus({ kind: "submitting", phase: files.length ? "uploading" : "sending" });
    try {
      // 1) Upload each attachment straight to S3 via a presigned URL.
      const attachments: { name: string; url: string; size: number; type: string }[] = [];
      for (const file of files) {
        const type = inferType(file);
        const presign = await fetch("/api/contact/attachment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, fileType: type }),
        });
        const pdata = await presign.json().catch(() => ({}));
        if (!presign.ok) throw new Error(pdata?.error || "Couldn't upload an attachment.");
        const put = await fetch(pdata.uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": type },
        });
        if (!put.ok) throw new Error(`Couldn't upload "${file.name}". Please try again.`);
        attachments.push({ name: file.name, url: pdata.fileURL, size: file.size, type });
      }

      // 2) Submit the message. A signed-in sender's name/email are set server-side
      // from their session; the values we send are ignored for them.
      setStatus({ kind: "submitting", phase: "sending" });
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: authed ? sessionName : name,
          email: authed ? sessionEmail : email,
          message,
          company,
          attachments,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Something went wrong. Please try again.");

      setStatus({ kind: "success" });
      setName("");
      setEmail("");
      setMessage("");
      setFiles([]);
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    }
  };

  return (
    <div className=" py-24">
      <h1 className="font-light text-5xl tracking-tighter">
        Let’s get your music heard.
      </h1>
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
        {authed ? (
          // Signed in: use the account name/email (no manual entry, no fakes).
          <div className="rounded-3xl border border-border bg-card px-5 py-4 text-sm">
            <p className="text-muted-foreground font-light">Sending as</p>
            <p className="mt-0.5 truncate font-medium text-foreground">
              {sessionName || sessionEmail}
            </p>
            {sessionName ? (
              <p className="truncate text-xs text-muted-foreground">{sessionEmail}</p>
            ) : null}
          </div>
        ) : (
          <>
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
          </>
        )}

        <label htmlFor="contact-message" className="sr-only">
          Your message
        </label>
        <Textarea
          id="contact-message"
          name="message"
          placeholder="Enter your message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={CONTACT_MESSAGE_MAX}
          aria-required="true"
          aria-invalid={status.kind === "error" && !message.trim() ? true : undefined}
          aria-describedby={describedBy}
          className="placeholder:font-light min-h-[120px] max-h-[200px] resize-none no-scrollbar rounded-3xl !py-5"
          rows={5}
        />
        <p className="-mt-3 text-right text-xs font-light text-muted-foreground">
          {message.length.toLocaleString()}/{CONTACT_MESSAGE_MAX.toLocaleString()}
        </p>

        {/* Attachments */}
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={CONTACT_ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_CONTACT_ATTACHMENTS}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-light text-foreground transition-colors hover:bg-white/[0.04] disabled:opacity-50"
          >
            <Paperclip className="h-4 w-4" /> Attach files
          </button>
          <p className="text-xs font-light text-muted-foreground">
            WAV, MP3, PNG, JPG — up to {MAX_CONTACT_ATTACHMENTS} files, 100 MB each (optional).
          </p>

          {files.length > 0 ? (
            <ul className="space-y-1.5">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${f.size}-${i}`}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate text-foreground">{f.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    aria-label={`Remove ${f.name}`}
                    disabled={submitting}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* Honeypot: off-screen and hidden from assistive tech; only bots fill it.
            A submission with this set is silently dropped server-side. */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
          <label htmlFor="contact-company">Company</label>
          <input
            id="contact-company"
            name="company"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>
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
        text={
          submitting
            ? status.phase === "uploading"
              ? "Uploading…"
              : "Sending…"
            : "Get In Touch"
        }
        onClick={submit}
        disabled={submitting}
        className="w-fit mt-10"
      />
    </div>
  );
};

export default ContactFormSection;
