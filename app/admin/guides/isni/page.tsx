import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";

export const metadata: Metadata = { title: "How to claim an ISNI" };

// Internal admin guide: how to get an ISNI for an artist who doesn't have one.
// Linked from the ISNI field + the discoverability panel in the artist editor.

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 text-blue-400 underline hover:text-blue-300"
    >
      {children}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-lg font-medium">{title}</h2>
      <div className="mt-3 space-y-3 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

export default function IsniGuidePage() {
  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/catalog/artists"
        className="mb-3 -ml-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to artists
      </Link>

      <PageHeader
        title="How to claim an ISNI"
        description="An ISNI strengthens an artist's entity identity — it feeds their page's sameAs, the Wikidata draft, and both the SEO and Knowledge Panel scores. Here's how to get one if an artist doesn't have it yet."
      />

      <div className="space-y-5">
        <Card title="What an ISNI is">
          <p>
            The <strong className="text-foreground">International Standard Name Identifier</strong>{" "}
            is a 16-digit ISO standard ID for the public identity of a person or group —
            like an ISBN, but for a name. It tells Google, MusicBrainz, Wikidata and
            libraries that “this artist” is one specific real-world entity, even when
            the name is shared by others. That disambiguation is exactly what a
            Knowledge Panel depends on.
          </p>
          <p className="text-xs">
            Format: 16 digits, often shown in groups, e.g.{" "}
            <span className="font-mono text-foreground">0000 0001 2103 2683</span>. Store
            the digits; spaces are optional.
          </p>
        </Card>

        <Card title="First — check they don't already have one">
          <p>
            Most artists are <strong className="text-foreground">auto-assigned an ISNI</strong>{" "}
            once their music is distributed to streaming, so check before requesting a
            new one (duplicates are a headache to merge):
          </p>
          <ul className="ml-4 list-disc space-y-1.5">
            <li>
              In the artist editor, use the <strong className="text-foreground">Find</strong>{" "}
              button next to the ISNI field — it searches the public registry by name.
            </li>
            <li>
              If they’re on MusicBrainz, <strong className="text-foreground">Import from
              MusicBrainz</strong> pulls the ISNI in automatically (no guessing).
            </li>
            <li>
              Or search the registry directly at <Ext href="https://isni.org">isni.org</Ext>.
            </li>
          </ul>
        </Card>

        <Card title="How to claim one (easiest first)">
          <ol className="ml-4 list-decimal space-y-3">
            <li>
              <strong className="text-foreground">Through your distributor / aggregator.</strong>{" "}
              Many register an ISNI for you when they push music to streaming and stores
              (they feed the industry databases ISNI draws on). Ask, or check your
              distribution dashboard — usually the simplest, lowest- or no-cost route.
            </li>
            <li>
              <strong className="text-foreground">Through a PRO / collecting society.</strong>{" "}
              Registering the artist as a performer or songwriter (e.g. PRS/PPL in the UK,
              SoundExchange/ASCAP/BMI in the US) often gets them an ISNI. Since 2024,{" "}
              <Ext href="https://www.wipo.int/">WIPO</Ext> is an ISNI registration agency that
              lets collecting societies worldwide assign ISNIs to their members.
            </li>
            <li>
              <strong className="text-foreground">Via a registration agency directly.</strong>{" "}
              <Ext href="https://isni.org/page/isni-registration-agencies/">Luminate</Ext>{" "}
              runs professional ISNI services for the music industry; national libraries and the
              other agencies listed at <Ext href="https://isni.org">isni.org</Ext> can also
              assign one. A request needs the name, the artist’s role and a couple of references
              (release links, profiles); some agencies charge a small per-ISNI fee.
            </li>
          </ol>
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3 text-xs text-amber-200/80">
            <strong className="text-amber-200">Note:</strong> MusicBrainz does <em>not</em> issue
            ISNIs — it only stores one an artist already has, so adding a MusicBrainz page won’t
            create an ISNI. (There was an old MusicBrainz↔ISNI assignment program, but it’s no
            longer active and MusicBrainz isn’t a current registration agency.) Use MusicBrainz
            and the <strong className="text-foreground">Find</strong> button to <em>locate</em> an
            existing ISNI — not to obtain a new one.
          </p>
        </Card>

        <Card title="After you get the number">
          <p>
            Paste the 16-digit ISNI into the{" "}
            <strong className="text-foreground">ISNI</strong> field (Identity &amp; internal) on
            the artist and save. It immediately flows into the page’s schema.org{" "}
            <code className="rounded bg-white/[0.06] px-1 py-0.5 text-xs">sameAs</code>, the
            Wikidata draft, and lifts both the <strong className="text-foreground">SEO</strong>{" "}
            and <strong className="text-foreground">Knowledge Panel</strong> scores for that artist.
          </p>
        </Card>
      </div>
    </div>
  );
}
