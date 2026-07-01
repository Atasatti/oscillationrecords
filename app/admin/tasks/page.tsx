"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import {
  Plus, Loader2, Trash2, ChevronDown, ChevronUp, Sparkles,
  AlertCircle, Music2, Radio, CheckCircle2, ExternalLink, Pencil, Check,
  List, CalendarDays, ChevronLeft, ChevronRight, UserRound,
} from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import InfoHint from "@/components/admin/InfoHint";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/local-ui/Toast";
import type { AttentionItem } from "@/app/api/tasks/needs-attention/route";
import { getCached, setCached } from "@/lib/admin-cache";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = ["pitching", "research", "admin", "social", "sync", "radio", "catalog"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const PRIORITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
// Lower rank = more urgent → sorts to the top of the list.
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_DOT: Record<string, string> = { urgent: "bg-red-500", high: "bg-amber-400", medium: "bg-sky-400", low: "bg-zinc-500" };

// Status colour system — gives each task row an at-a-glance state: a coloured
// left accent on the row + a matching status pill on the right.
const STATUS_ACCENT: Record<string, string> = {
  todo: "border-l-zinc-600",
  in_progress: "border-l-sky-500",
  done: "border-l-emerald-500",
};
const STATUS_PILL: Record<string, string> = {
  todo: "border-zinc-600/60 bg-zinc-500/10 text-zinc-200",
  in_progress: "border-sky-500/50 bg-sky-500/10 text-sky-200",
  done: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
};

const pad = (n: number) => String(n).padStart(2, "0");
const shiftMonth = (c: { y: number; m: number }, delta: number) => {
  const d = new Date(c.y, c.m + delta, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
};

const STATUSES = ["todo", "in_progress", "done"] as const;
const STATUS_LABELS: Record<string, string> = { todo: "To Do", in_progress: "In Progress", done: "Done" };
const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];
type Tab = "attention" | StatusFilter;

const ATTENTION_HELP =
  "Issues we found automatically in your live catalog — releases or settings that need fixing (e.g. missing artwork, streaming links or metadata). Click any to jump straight to it. These aren't tasks you create; they clear once fixed.";

type PriorityVariant = "muted" | "default" | "warning" | "destructive";
function priorityVariant(p: string): PriorityVariant {
  if (p === "urgent") return "destructive";
  if (p === "high") return "warning";
  if (p === "medium") return "default";
  return "muted";
}

type AttentionPriorityVariant = "destructive" | "warning" | "muted";
function attentionPriorityVariant(p: string): AttentionPriorityVariant {
  if (p === "high") return "destructive";
  if (p === "medium") return "warning";
  return "muted";
}

const SUGGESTIONS = [
  // Playlist & DSP pitching (37)
  { title: "Follow up on pitches sent 7+ days ago", category: "pitching", priority: "high", description: "Check Outreach → Pitches for any with status 'Sent' and a follow-up date that's passed." },
  { title: "Submit to SubmitHub curators", category: "pitching", priority: "medium", description: "Upload the latest single to SubmitHub and target 10–15 playlist curators in genre." },
  { title: "Submit to Groover for blog coverage", category: "pitching", priority: "medium", description: "Use Groover to reach French and European blogs. Budget roughly €50–100 per campaign." },
  { title: "Build a Spotify curator shortlist for next release", category: "pitching", priority: "high", description: "Research independent playlist curators on Spotify. Aim for 20+ contacts before release day." },
  { title: "Apply for Spotify Marquee for next release", category: "pitching", priority: "high", description: "Marquee is a Spotify-direct promotional push to listeners. Apply via Spotify for Artists 7+ days before release." },
  { title: "Apply for Apple Music Essentials placement", category: "pitching", priority: "medium", description: "Contact your distributor about editorial consideration for Apple Music genre playlists." },
  { title: "Submit new releases to Hype Machine blogs", category: "pitching", priority: "medium", description: "Hype Machine aggregates music blogs. Getting covered by tracked blogs surfaces you on the chart." },
  { title: "Pitch next single to Spotify editorial via Spotify for Artists", category: "pitching", priority: "high", description: "Submit at least 7 days before release date in the Spotify for Artists pitch tool, tagging genre, mood and instruments. Good pitches lead with a one-line story and name the exact playlists (e.g. mint, Housewerk, Chill Beats) you're targeting." },
  { title: "Pitch releases to Apple Music editorial via Apple Music for Artists", category: "pitching", priority: "high", description: "Use the pitch form in Apple Music for Artists (or via your distributor's Apple pitch field) 1-2 weeks ahead, flagging dubstep/DnB playlists like New in Dance. Include a concise artist story and any UK press or radio support." },
  { title: "Submit tracks to Amazon Music playlist consideration via Amazon Music for Artists", category: "pitching", priority: "medium", description: "Use the pitch feature in Amazon Music for Artists ahead of release to target Fresh Dance / Fresh Electronic. Alexa voice-request growth makes this an underused channel for small electronic labels." },
  { title: "Pitch to Deezer editorial team via Deezer for Creators", category: "pitching", priority: "medium", description: "Submit new releases through Deezer for Creators (Deezer Backstage) for their electronic and dance flow playlists. Deezer is strong in France/EU, so tag EU-relevant moods and lead with your best track." },
  { title: "Pitch dubstep & bass tracks to independent Spotify curators via Groover", category: "pitching", priority: "medium", description: "Spend roughly 2-4 Groover Grooviz per release targeting genre-matched independent playlisters, not just blogs. Expect guaranteed feedback within 7 days; a 25%+ add rate is a good result for a niche bass single." },
  { title: "Build and maintain a vetted independent playlist curator database", category: "pitching", priority: "high", description: "Keep a spreadsheet or Notion base of curators with contact, genre, follower count, last-pitched date and add/reject history. Vet each on Chartmetric or Soundcharts to filter out bot/fake-follower playlists before pitching." },
  { title: "Screen target playlists for bot activity before pitching", category: "pitching", priority: "high", description: "Run each shortlisted playlist through Chartmetric or Artist.Tools / SpotOnTrack to check listener-to-follower ratio and stream authenticity. Never pay for or pitch playlists showing sudden bot spikes, as they risk your Spotify account." },
  { title: "Pitch tracks to Hyperfollow / SubmitHub electronic curators", category: "pitching", priority: "medium", description: "Use SubmitHub credits (roughly 1-2 per curator) to target electronic and dance Spotify playlisters with the release. Filter by 80%+ approval rate and read curator notes so you only spend credits where the genre truly fits." },
  { title: "Refresh Spotify artist profiles: Artist Pick, canvas & clips before pitch", category: "pitching", priority: "medium", description: "Set an Artist's Pick and add Canvas + Clips in Spotify for Artists ahead of any editorial pitch, since a complete profile signals investment to the editorial team. Do this for every active artist in the release cycle." },
  { title: "Pitch to YouTube Music / Topsify & Filtr-style electronic playlists", category: "pitching", priority: "low", description: "Reach out to major-network dance playlist brands (Filtr, Topsify, Digster) and independent YouTube electronic channels with a private link. Offer a clean WAV and artwork so adds are frictionless." },
  { title: "Pitch to Tidal editorial via your distributor's Tidal pitch field", category: "pitching", priority: "low", description: "Where your distributor (e.g. DistroKid, Believe, TuneCore) offers a Tidal pitch, submit for their Rising and electronic playlists. Tidal skews audiophile, so highlight high-quality masters and any hi-res delivery." },
  { title: "Pitch to Beatport curated playlists & DJ chart placements", category: "pitching", priority: "high", description: "Email your Beatport-facing distributor or label manager to push new house/DnB releases into Beatport genre playlists and Hype charts. Ask supportive DJs to add the track to their public Beatport charts around release day." },
  { title: "Follow up with curators who added previous releases", category: "pitching", priority: "medium", description: "Maintain a warm-relationship list of curators who added past tracks and pitch them each new single directly, referencing the prior support. Repeat adders convert far higher than cold outreach; contact them 1-2 weeks pre-release." },
  { title: "Pitch playlist adds to top listener cities via geo-targeted outreach", category: "pitching", priority: "low", description: "Use Spotify for Artists audience data to identify strong cities (e.g. London, Berlin, Amsterdam) and pitch local/regional electronic playlists there. Local curators often add UK bass and house acts their algorithms already favour." },
  { title: "Prepare a pre-save + editorial pitch bundle 4 weeks before release", category: "pitching", priority: "high", description: "Set up a Hyperfollow/Feature.fm pre-save link and align it with your Spotify editorial pitch timing, as pre-save momentum strengthens editorial consideration. Aim to have artwork, pitch copy and links locked 4 weeks out." },
  { title: "Audit which playlists drove streams and re-pitch top performers", category: "pitching", priority: "medium", description: "Monthly, review Spotify for Artists 'Playlists' and 'Discovered on' data to see which editorial and independent lists actually converted. Prioritise re-pitching those curators and drop dead lists from your target database." },
  { title: "Line up an exclusive premiere for next single with a genre blog", category: "pitching", priority: "high", description: "Offer one outlet (e.g. Data Transmission, UKF for D&B/dubstep, or Mixmag Weekender) a 2-week-ahead exclusive premiere; pitch one blog at a time so the exclusivity holds and confirm embed assets (SoundCloud private link) before release week." },
  { title: "Draft a tight press release for the upcoming release", category: "pitching", priority: "high", description: "Write a one-page release with hook in the first line, artist bio, tracklist, release date and streaming/download links; keep it under 300 words and paste it in the email body plus attach a PDF." },
  { title: "Pitch artist for an interview or Q&A feature", category: "pitching", priority: "medium", description: "Approach mid-tier electronic outlets (Data Transmission, When We Dip, Notion) with a 3-question sample angle tied to the release story; personalise the subject line and reference a recent piece they ran." },
  { title: "Submit release to Hype Machine-tracked electronic blogs", category: "pitching", priority: "medium", description: "Identify 8-10 Hypem-monitored blogs that post your subgenre, then email each a private stream and short pitch so any coverage feeds the Hype Machine chart during release week." },
  { title: "Pitch to electronic music Substack newsletters", category: "pitching", priority: "medium", description: "Find 5-8 independent Substack/newsletter curators covering underground electronic and pitch a premiere or feature; newsletters convert well and are far less crowded than big blogs." },
  { title: "Pitch a mix or guest playlist to a music blog series", category: "pitching", priority: "low", description: "Offer artists for a blog's recurring mix/guest-selection feature (e.g. Data Transmission or When We Dip mix series); provide a 30-45 min mix and 100-word intro to earn editorial without needing a new release." },
  { title: "Pitch local Manchester press and city culture outlets", category: "pitching", priority: "medium", description: "Approach Manchester-focused outlets (Skiddle editorial, local culture blogs, community radio show notes) with the label's hometown angle; local-interest hooks land coverage national blogs skip." },
  { title: "Send a personalised press pitch email to top 10 contacts", category: "pitching", priority: "high", description: "After the list is built, send individual (not BCC) pitches with a private stream link, one-line hook and release date; keep each under 120 words and put the artist and release in the subject line." },
  { title: "Pitch a behind-the-release story angle to a features editor", category: "pitching", priority: "low", description: "Develop a narrative hook (studio process, sample story, artist journey) and pitch it as a longer feature to editors who commission think-pieces; angles beat 'here's my new track' cold pitches." },
  { title: "Pitch a label-vs-label split EP or V/A track swap", category: "pitching", priority: "medium", description: "Identify 3 similarly-sized UK/EU electronic labels and propose a two-track exchange or joint V/A comp; good outcome is shared audiences and cross-posting to both fanbases with a coordinated release date." },
  { title: "Set up an Instagram/Reels 'takeover' swap with a peer act", category: "pitching", priority: "low", description: "Arrange a mutual account or Stories takeover with an artist of similar reach for release week; each seeds the other's track to a fresh audience at zero cost." },
  { title: "Open a remix contest via LabelRadar or Metapop", category: "pitching", priority: "low", description: "Post stems for a flagship track with a prize (feature release, gear, cash) to source fresh talent and content; screen entries and offer the winner a full label remix slot." },
  { title: "Pitch tracks to influential DJs for radio/set support", category: "pitching", priority: "high", description: "Send private promo (Label Engine or a clean WeTransfer + one-line pitch) to 15 relevant DJs/curators ahead of release so it gets played in mixes, festival sets and reposted." },
  { title: "Arrange a Bandcamp/DSP playlist cross-promo swap", category: "pitching", priority: "medium", description: "Trade playlist placements and 'label picks' features with 5 friendly artists/labels; add each other's tracks to your public Spotify/Bandcamp lists and cross-tag for reciprocal reach." },
  // Radio, podcasts & broadcast (20)
  { title: "Submit latest release to BBC Introducing", category: "radio", priority: "high", description: "Upload via the BBC Introducing submission portal. Include a short bio and press photo." },
  { title: "Contact Amazing Radio for playlist add", category: "radio", priority: "medium", description: "Email Amazing Radio's music@ inbox with a short pitch and streaming link." },
  { title: "Check NTS Radio for open submissions", category: "radio", priority: "low", description: "NTS occasionally accepts guest mixes and new artist submissions — worth a monthly check." },
  { title: "Submit to Reprezent Radio", category: "radio", priority: "low", description: "UK community radio focused on emerging artists. Good for urban and electronic genres." },
  { title: "Submit new single to BBC Radio 1 Dance / Danny Howard's team", category: "radio", priority: "high", description: "Send WAV, one-line pitch and DSP links to Radio 1 dance specialists (Danny Howard, Sarah Story) 3-4 weeks pre-release via their known submission emails or a plugger. Good = a name-check even without a full spin." },
  { title: "Pitch dubstep/DnB releases to Rinse FM specialist shows", category: "radio", priority: "high", description: "Target Rinse FM host inboxes/SoundCloud for bass, DnB and dubstep slots with a 320kbps promo and a short blurb 2-3 weeks ahead. Rinse is a key London tastemaker for our core genres." },
  { title: "Send promos to Radio 1 Introducing Dance & specialist mix slots", category: "radio", priority: "medium", description: "Beyond regional BBC Introducing, flag standout tracks to the national Radio 1 dance/Future Sounds Introducing strand via the Introducing Uploader tagged to genre. Cadence: every release." },
  { title: "Build & maintain a UK specialist-radio promo list (30+ shows)", category: "radio", priority: "high", description: "Spreadsheet of BBC 6 Music, 1Xtra, Rinse, NTS, Kiss, Worldwide FM, Reprezent contacts with genre, deadline and format prefs. Refresh quarterly so pitches land with the right host." },
  { title: "Set up a Mixcloud channel and upload monthly label mixes", category: "radio", priority: "medium", description: "Publish a 60-min label showcase mix monthly on Mixcloud (Pro if you exceed limits, ~£8/mo) with correct tracklist for royalties. Repurpose as a radio-style show to grow subscribers." },
  { title: "Pitch a guest mix to established SoundCloud/Mixcloud radio shows", category: "radio", priority: "medium", description: "Offer an artist guest mix to genre shows (e.g. UKF, Liquicity-adjacent, local bass residencies) 4 weeks out, exclusive and unreleased-track-loaded. A guest mix drives more discovery than a single spin." },
  { title: "Submit tracks to Data Transmission / We Rave You radio & mix series", category: "radio", priority: "low", description: "Send house/EDM promos to electronic media outlets that run podcast/mix series and radio shows via their promo forms. Free coverage that suits our EDM/house catalog." },
  { title: "Register the label on a promo pool (Le Visiteur / Music-Radio-Promotions)", category: "radio", priority: "low", description: "Use a DJ/radio promo pool or plugger to push select 12-inch-style tracks to hundreds of DJs and radio hosts (budget ~£50-150 per campaign). Best reserved for flagship dancefloor releases." },
  { title: "Pitch drum & bass cuts to BBC 1Xtra specialist shows", category: "radio", priority: "high", description: "Send DnB, jungle and bass tracks to 1Xtra specialists (e.g. the DnB/dubstep slots) with a tight promo pack 2-3 weeks pre-release. 1Xtra plays translate to strong genre credibility." },
  { title: "Launch a fortnightly Oscillation Records podcast on Spotify/Apple", category: "radio", priority: "medium", description: "Distribute a short DJ-mix or label-news podcast via Spotify for Podcasters/RSS to Apple Podcasts, releasing every two weeks. Keep episodes music-licence-safe by using label catalog + cleared guest mixes." },
  { title: "Submit to Data / community station specialist shows (e.g. Reform Radio Manchester)", category: "radio", priority: "medium", description: "As a Manchester label, pitch local community/online stations (Reform Radio, Melodic Distraction, Balamii) for specialist plays and potential residencies. Local ties often lead to repeat support." },
  { title: "Apply for an artist residency show on an online radio station", category: "radio", priority: "low", description: "Pitch a monthly resident slot for a flagship artist on NTS-style or local online stations, sending a demo mix and show concept. A residency is recurring exposure and a content engine." },
  { title: "Pitch tracks to Kiss FM / Capital Dance new-music teams", category: "radio", priority: "medium", description: "For the most radio-friendly, vocal-led house/EDM cuts, email Kiss and Capital Dance music schedulers with a clean edit and radio-length version. Only pitch genuinely commercial records here." },
  { title: "Create radio edits & clean versions for every A-side", category: "radio", priority: "high", description: "Prepare a 3-3.5 min radio edit plus a profanity-clean version and deliver as tagged WAVs, since many shows won't play 6-min club mixes. Have these ready before any radio pitch goes out." },
  { title: "Track and log all radio plays via a monitoring workflow", category: "radio", priority: "low", description: "Log confirmed spins from host replies, BBC Sounds tracklists and DJ shout-outs in a sheet (or a tool like DJ Monitor/Radiomonitor if budget allows) to prove traction and support neighbouring-rights claims." },
  { title: "Send a monthly promo mailer to your specialist-radio contact list", category: "radio", priority: "medium", description: "Use a promo platform (e.g. LabelWorx/Proton-style promo pages) to send DJs and radio hosts a branded, streamable promo pool monthly with download-gated WAVs. Consistency keeps the label top-of-inbox." },
  // Research, press lists & A&R (31)
  { title: "Find 10 new blog contacts in your genre", category: "research", priority: "medium", description: "Search music blogs covering your genre, find the editor's contact and add them to Contacts." },
  { title: "Build a targeted UK/EU electronic press contact list of 25", category: "research", priority: "high", description: "Research writers/editors at UKF, Mixmag, DJ Mag, Data Transmission and relevant Substacks; log name, beat, email and last article in a spreadsheet and tag by subgenre (dubstep/DnB/house) for accurate pitching." },
  { title: "Research each writer's recent pieces before pitching", category: "research", priority: "medium", description: "For your top 10 press contacts, read their last 2-3 articles and note angle preferences so pitches reference their work; good looks like a one-line personalisation per contact saved beside their email." },
  { title: "Time all press pitches 2-3 weeks before release date", category: "research", priority: "high", description: "Work backwards from the release date to set a pitch calendar: premieres and features need 2-3 weeks lead, so map deadlines per outlet in the CRM to avoid pitching after their schedule closes." },
  { title: "Compile a quotes-and-coverage sheet for the EPK", category: "research", priority: "low", description: "Collect existing reviews, blog mentions and DJ support quotes into one document with source and date; this makes future press pitches and the EPK stronger and takes 30 minutes to maintain per release." },
  { title: "Research premiere/feature submission policies before emailing", category: "research", priority: "medium", description: "Check each target outlet's site for a submissions page or preferred contact (many list 'no attachments' or Groover-only rules); logging this prevents pitches bouncing to the wrong inbox." },
  { title: "Research and pitch year-end / roundup list inclusions", category: "research", priority: "low", description: "Identify blogs and newsletters that run 'ones to watch' or best-of-month roundups, note their submission windows, and pitch label tracks for inclusion ahead of those deadlines." },
  { title: "Prepare press assets pack (hi-res photos, logo, artwork)", category: "research", priority: "medium", description: "Assemble a shareable folder (Google Drive/Dropbox) with 300dpi press photos, credited artwork, logo files and short/long bios so any journalist who says yes gets everything in one link." },
  { title: "Scout unsigned electronic artists on Bandcamp new-arrivals by tag", category: "research", priority: "high", description: "Browse Bandcamp's genre tags (dubstep, drum-and-bass, deep-house) filtered by 'new arrivals' weekly, shortlisting 5 unsigned acts with 200-2k followers. Good scouting = artists with a distinct sound and consistent release cadence but no label home yet." },
  { title: "Mine SoundCloud reposts/likes of your current roster for similar acts", category: "research", priority: "medium", description: "Use SoundCloud to check who your signed artists repost and who reposts them, building a 'sounds-like' scouting list. Their network is your best free A&R funnel for adjacent, on-brand talent." },
  { title: "Run a monthly Beatport Hype / DJ chart sweep for rising producers", category: "research", priority: "medium", description: "Check Beatport's Hype charts (bass, house, DnB) and DJ-support charts monthly to spot producers gaining traction on other small labels. Note who's still unsigned to a home label for outreach." },
  { title: "Scout local Manchester talent via GMDST, gig listings and open decks", category: "research", priority: "medium", description: "Track Manchester nights (Hidden, White Hotel, Soup) and Greater Manchester music support schemes for hometown electronic acts. Local signings are cheaper to develop and build a regional scene identity." },
  { title: "Track shortlisted prospects' momentum monthly before committing", category: "research", priority: "medium", description: "For A-rank scouted acts, log monthly follower/stream/repost deltas in the CRM over a 60-90 day window. Signing on a clear upward trend de-risks a small label's limited signing slots." },
  { title: "Scout collaborators and vocalists to develop instrumental producers", category: "research", priority: "low", description: "Build a shortlist of topliners and vocalists (via Vocalizr, SoundBetter, SoundCloud) suited to your bass/house producers. Pairing instrumentalists with the right voice unlocks playlist-ready singles." },
  { title: "Review Reddit and Discord producer communities for raw talent", category: "research", priority: "low", description: "Scan r/edmproduction feedback threads and relevant genre Discords for producers whose demos consistently stand out. These pre-audience talents are cheap to sign and develop from the ground up." },
  { title: "Reconnect with 5 near-miss prospects passed on last year", category: "research", priority: "low", description: "Revisit CRM 'not-yet' contacts and check if any have leveled up in sound or audience since. Re-scouting known acts is faster than cold discovery and shows genuine long-term interest." },
  { title: "Set up a weekly Spotify for Artists stats review ritual", category: "research", priority: "high", description: "Every Monday check Spotify for Artists for streams, saves, playlist adds and listener sources; log week-on-week changes in a simple sheet so you catch momentum spikes within the release window." },
  { title: "Analyse top listener cities across DSPs to plan touring & ads", category: "research", priority: "medium", description: "Pull city-level data from Spotify for Artists and Apple Music for Artists, list your top 15 cities, and flag UK/EU clusters to inform where to book shows and geo-target paid ads." },
  { title: "Compare per-track save rate to find your strongest hooks", category: "research", priority: "medium", description: "In Spotify for Artists, calculate saves-per-stream for each catalog track; tracks above ~8-10% are keepers worth re-pitching and reworking as your sonic template." },
  { title: "Build a single label KPI dashboard in Google Looker Studio", category: "research", priority: "high", description: "Connect a Google Sheet of monthly streams, saves, followers and revenue into a free Looker Studio dashboard so the whole team sees trends at a glance instead of logging into 6 portals." },
  { title: "Audit Apple Music for Artists Shazam & search data for demand", category: "research", priority: "medium", description: "Check Shazams and search insights in Apple Music for Artists to spot tracks gaining organic pull; rising Shazams often signal radio or sync traction worth chasing." },
  { title: "Set up Chartmetric free account to benchmark against 3 peer labels", category: "research", priority: "medium", description: "Create a Chartmetric account, track 3 comparable UK electronic labels/artists, and note their playlist and follower growth monthly to sense-check your own pace." },
  { title: "Reconcile distributor analytics vs DSP dashboards monthly", category: "research", priority: "medium", description: "Cross-check stream counts in your distributor (e.g. DistroKid/Believe/AWAL) against Spotify/Apple dashboards each month to catch under-reporting or missing stores before payout." },
  { title: "Track playlist adds and removals with a Soundcharts watch", category: "research", priority: "high", description: "Monitor which editorial and user playlists add or drop each release; a sudden removal explaining a stream cliff tells you when to re-pitch or push paid support." },
  { title: "Segment mailing list engagement data in your ESP", category: "research", priority: "low", description: "Export open and click rates from Mailchimp/Buttondown, identify your most-engaged 20% of subscribers, and tag them so future superfan campaigns target proven openers." },
  { title: "Analyse YouTube Analytics traffic sources per music video", category: "research", priority: "medium", description: "In YouTube Studio check traffic sources and audience retention per video; high suggested-video traffic means the algorithm likes it, so prioritise those for ad spend." },
  { title: "Map Bandcamp buyer data to find top-spending fans by region", category: "research", priority: "medium", description: "Export Bandcamp sales reports, group by country and buyer, and identify repeat purchasers to inform merch drops and where physical/vinyl demand is strongest." },
  { title: "Set up Meta Pixel and TikTok Pixel on the label site", category: "research", priority: "high", description: "Install the Meta and TikTok pixels on your website/store to capture visitor and conversion data now, so retargeting audiences are warm before the next release campaign." },
  { title: "Run a quarterly audience demographics report across platforms", category: "research", priority: "low", description: "Once a quarter compile age, gender and country splits from Spotify, Meta and YouTube into one summary to check whether your actual audience matches your target scene." },
  { title: "Track UTM-tagged smart links to see which channels convert", category: "research", priority: "medium", description: "Add UTM parameters to your Linkfire/Feature.fm smart links per channel (IG, email, TikTok), then review click-to-stream data to double down on your best-converting source." },
  { title: "Investigate stream-per-follower ratio to gauge fan quality", category: "research", priority: "low", description: "Divide monthly listeners by followers per artist in Spotify for Artists; a low ratio suggests passive playlist listeners rather than real fans, flagging a need for D2F focus." },
  // Social, content, fan & community (33)
  { title: "Find TikTok / Reels creators to seed", category: "social", priority: "high", description: "Identify 5–10 micro-influencers in your genre and offer them early access to the next release." },
  { title: "Set up Bandcamp store", category: "social", priority: "low", description: "Bandcamp is great for direct-to-fan sales, name-your-price releases and superfan engagement." },
  { title: "Post new release on relevant Reddit communities", category: "social", priority: "medium", description: "r/ThisIsOurMusic, r/Listentothis and genre-specific subreddits are good for organic reach." },
  { title: "Build a 4-week content calendar in Notion for the next release", category: "social", priority: "high", description: "Map daily posts across TikTok, Instagram Reels and YouTube Shorts from announcement to release week in a free Notion or Trello board. Good looks like 3-4 posts/week per artist with clear hooks, not just 'link in bio' drops." },
  { title: "Film 5 vertical teaser clips per single (waveform + drop moments)", category: "social", priority: "high", description: "Batch-record short 9:16 clips highlighting the biggest drop or hook, using CapCut with animated captions and the waveform. Aim to bank 5 variants so you can test different opening 3-second hooks." },
  { title: "Set up and pre-load a TikTok pre-save/pre-release sound", category: "social", priority: "urgent", description: "Upload the track to TikTok's Commercial Music Library / SoundOn ahead of release so creators can use the official sound. Seed it in your own posts 1-2 weeks early so the sound has momentum on release day." },
  { title: "Post a weekly studio/behind-the-scenes Reel for each active artist", category: "social", priority: "medium", description: "Capture beat-making, sound design or plugin walkthroughs as raw phone footage — electronic fans love process content. Batch-film monthly and schedule via Meta Business Suite to keep a steady cadence." },
  { title: "Create a recurring label 'New Music Friday' round-up post format", category: "social", priority: "medium", description: "Design a reusable Canva template carousel/Reel showcasing the week's Oscillation releases and picks. Post every Friday to build a predictable habit for followers across Instagram and Threads." },
  { title: "Schedule two weeks of posts via Meta Business Suite and Later", category: "social", priority: "medium", description: "Batch-schedule Reels and Stories so posting doesn't stall on busy weeks; free Meta Business Suite covers IG/FB, Later's free tier covers TikTok. Leave gaps for reactive/trend content." },
  { title: "Run a lip-sync/dance challenge prompt for the lead single on TikTok", category: "social", priority: "high", description: "Define a simple repeatable action tied to the drop and post a clear 'do this' example video with a branded hashtag. Duet/stitch the best fan attempts to reward participation and fuel the algorithm." },
  { title: "Repurpose the top-performing Reel into a YouTube Short and Pin", category: "social", priority: "low", description: "Cross-post your best clip to YouTube Shorts, Pinterest and Snapchat Spotlight with platform-native captions. Costs nothing and squeezes more reach from proven content instead of making new assets." },
  { title: "Write 15 reusable hook lines for teaser captions and on-screen text", category: "social", priority: "medium", description: "Draft punchy first-line hooks ('POV: the bassline that broke the set', 'this drop wasn't supposed to leak') in a swipe file. Strong opening text drives the 3-second retention that short-form ranks on." },
  { title: "Post a real-time reaction Story sequence on release day", category: "social", priority: "high", description: "Plan a countdown sticker, a 'it's out' Reel, and 3-4 Story frames (streams, quotes, link stickers) mapped to release-day hour by hour. Add the Spotify/link sticker so taps convert to streams." },
  { title: "Engage 20 minutes daily in genre comment sections and duets", category: "social", priority: "medium", description: "Comment on and stitch bigger dubstep/DnB/house creators and label pages to earn algorithmic and human attention. Consistency beats volume — block 20 mins each weekday rather than one big burst." },
  { title: "Design branded Reels cover/end-card templates in Canva", category: "social", priority: "low", description: "Make reusable intro/outro cards and cover thumbnails with Oscillation's logo, colours and font so the grid looks cohesive. Saves time per post and strengthens visual brand recognition in-feed." },
  { title: "Track a monthly trending-audio watchlist for Reels and TikTok", category: "social", priority: "medium", description: "Save 5-10 rising sounds/trends each month from TikTok Creative Center and IG's audio charts that suit the label's vibe. Jump on relevant ones fast — trends decay within days." },
  { title: "Test 3 posting times and log a simple analytics review weekly", category: "social", priority: "low", description: "Compare morning/evening/late-night slots using native TikTok and Instagram Insights, logging reach and watch-time in a sheet. After 2-3 weeks, lock the best windows into the content calendar." },
  { title: "Produce a 60-sec 'meet the artist' vertical intro for new signings", category: "social", priority: "medium", description: "Film a quick face-to-camera or voiceover clip covering sound, influences and what's coming, pinned to the artist's profile. Great first-impression asset to reuse when seeding to press and fans." },
  { title: "Pin the release announcement and add a link-in-bio hub", category: "social", priority: "high", description: "Set up a free Linktree or Koji hub with pre-save, streaming, Bandcamp and merch links, and pin the announcement post across profiles during release week. Keep the top link updated per release cycle." },
  { title: "Set up a Mailchimp free-tier list with a signup form", category: "social", priority: "high", description: "Create a Mailchimp (free up to 500 contacts) or MailerLite account and embed a branded signup form on the label site and each artist's linktree. Capture email at every touchpoint before spending on ads." },
  { title: "Offer an unreleased track as a mailing-list signup incentive", category: "social", priority: "high", description: "Gate a free download of a demo, dub or edit behind email signup using a Mailchimp landing page or a Bandcamp download code. A tangible reward converts 3-5x better than 'join our newsletter'." },
  { title: "Send a monthly label newsletter to the mailing list", category: "social", priority: "medium", description: "Schedule a consistent monthly send in Mailchimp/MailerLite covering new releases, gigs and one personal story. Keep it under 300 words with a single clear call-to-action." },
  { title: "Launch a Discord server for the label community", category: "social", priority: "medium", description: "Create a free Discord with channels for releases, feedback and production chat, linked from Bandcamp and socials. Seed it by personally inviting your 20 most engaged fans first so it isn't empty." },
  { title: "Set up Bandcamp fan-following and new-release alerts", category: "social", priority: "high", description: "Ensure every artist follows the label on Bandcamp and enable release notifications so followers get an email each Bandcamp Friday. This is the best D2C sales moment for indie electronic labels." },
  { title: "Run a Bandcamp Friday campaign for the next release", category: "social", priority: "high", description: "Time a release or limited digital drop for the next fee-free Bandcamp Friday and email the list 48h before. Add a name-your-price or exclusive alt version to spike day-one direct sales and Wishlist adds." },
  { title: "Create a limited vinyl or merch pre-order for superfans", category: "social", priority: "medium", description: "Offer a small batch (e.g. 100 units) of vinyl, cassette or a tee via Bandcamp or print-on-demand, teased to the mailing list first. Use pre-orders to gauge demand and fund the pressing before committing budget." },
  { title: "Add a WhatsApp or Telegram broadcast channel for drops", category: "social", priority: "low", description: "Set up a free WhatsApp Channel or Telegram broadcast for instant, low-friction release and gig alerts to opted-in fans. Good for younger UK/EU fans who ignore email; post only 1-2x weekly to avoid mutes." },
  { title: "Enable Spotify fan messaging via Spotify for Artists", category: "social", priority: "low", description: "Turn on messaging and Fan Study features in Spotify for Artists to notify followers of new drops. Encourage fans to hit follow so new releases surface in their Release Radar." },
  { title: "Set up a Patreon or Bandcamp subscription tier for recurring D2C income", category: "social", priority: "medium", description: "Launch a low-cost (£3-5/mo) tier on Patreon or Bandcamp Subscriptions offering early tracks, stems or DJ mixes. Even 30 subscribers gives reliable monthly revenue; keep perks realistically deliverable." },
  { title: "Segment the mailing list by location for gig announcements", category: "social", priority: "low", description: "Tag subscribers by city/region in Mailchimp so Manchester/UK show announcements only hit relevant fans. Location-segmented sends lift open rates and stop annoying international fans with local-only news." },
  { title: "Run a fan-vote to pick the next single or remix", category: "social", priority: "low", description: "Use a Discord poll or Mailchimp survey to let the community vote on artwork, single choice or remix. Involving fans boosts investment and reliably lifts pre-save and share rates on launch." },
  { title: "Build a welcome email automation for new subscribers", category: "social", priority: "medium", description: "Set up a 2-3 email automated welcome series in Mailchimp/MailerLite delivering the free track, the label story and a first release. Welcome emails get the highest open rates, so lead with your best material." },
  { title: "Collect emails at live shows with a QR-code signup", category: "social", priority: "medium", description: "Print a QR code linking to the Mailchimp form on flyers, merch tables and DJ booth signage at every gig. Live audiences are your warmest leads; a phone-friendly form beats paper sign-up sheets." },
  // Sync licensing (18)
  { title: "Research sync briefs this month", category: "sync", priority: "medium", description: "Check Music Gateway, Musicbed and Musicray for open sync briefs in your genre." },
  { title: "Upload catalog to a sync library", category: "sync", priority: "low", description: "Sign up to Artlist, Musicbed or Pond5 and upload released tracks for passive sync income." },
  { title: "Register full catalog with Musicbed and Artlist for library sync", category: "sync", priority: "high", description: "Apply to submission-based sync libraries like Musicbed, Artlist, or Epidemic Sound with 10-15 of your most sync-friendly instrumentals and stems. Non-exclusive deals keep rights flexible; expect 2-4 week review turnaround." },
  { title: "Prepare clean instrumental + stem versions for top 15 tracks", category: "sync", priority: "high", description: "Bounce instrumental, TV mix, and 30s/60s edits with WAV stems for your strongest catalog, since supervisors almost always need vocal-free options. Store in a shared Google Drive folder ready to send within the hour." },
  { title: "Subscribe to weekly sync brief digests (Music Gateway, SyncFloor)", category: "sync", priority: "medium", description: "Sign up to Music Gateway, SyncFloor, and Music Xray brief digests plus the free Sync Songwriter list to catch open film/TV/ad calls weekly. Set a Friday 30-min slot to scan and shortlist matches." },
  { title: "Build a one-page sync pitch sheet per artist with clearance status", category: "sync", priority: "high", description: "Create a supervisor-friendly one-pager listing genre, mood tags, tempo/key, and 'one-stop clearable' status (master + publishing both controlled). One-stop tracks get placed far faster because there's no chasing splits." },
  { title: "Confirm one-stop clearance and pre-clear splits on sync-ready tracks", category: "sync", priority: "urgent", description: "For any track you actively pitch, get written confirmation from all writers and rights holders that you can license master + publishing on their behalf. Supervisors drop tracks that can't clear on a deadline, so lock this before pitching." },
  { title: "Tag catalog with mood, tempo, key & instrumentation for sync search", category: "sync", priority: "medium", description: "Add supervisor-searchable descriptors (dark, euphoric, driving, 128bpm, cinematic dubstep) to a master sync spreadsheet and your library profiles. Good tagging is how briefs get matched, especially for electronic sub-genres." },
  { title: "Pitch 5 sync-ready tracks to a UK music supervisor via warm intro", category: "sync", priority: "medium", description: "Identify 3-5 UK supervisors (via Music Week Sync Awards credits or IMDb) working on drama/reality that fits electronic music, and send a tight 3-track pitch with streamable private links. Keep emails short with instant-play links, no attachments." },
  { title: "Submit high-energy tracks to a games/trailer sync library", category: "sync", priority: "low", description: "Submit your best EDM/DnB cuts to games- and trailer-focused libraries (e.g. Position Music, Extreme Music, or indie game asset marketplaces). Games and trailers favour intense electronic beds and pay recurring library royalties." },
  { title: "Set up Songtradr and Jamendo Licensing profiles for the label", category: "sync", priority: "medium", description: "Create label profiles on marketplace platforms like Songtradr and Jamendo Licensing so ad agencies and creators can license directly. Upload metadata-complete WAVs; non-exclusive, so no conflict with other pitching." },
  { title: "Follow up on outstanding sync holds and pitches every 10 days", category: "sync", priority: "medium", description: "Track every track on hold or pitched in your Outreach CRM and nudge supervisors politely at ~10-day intervals until confirmed or released. Holds expire silently, so a light cadence keeps you top of mind." },
  { title: "List catalog on a creator micro-sync platform (Lickd, Uppbeat)", category: "sync", priority: "low", description: "Register works with creator-focused micro-licensing services (Lickd, Uppbeat, or Epidemic's creator tier) to earn from YouTubers and streamers. Volume-based revenue that also drives Content ID and Shazam discovery." },
  { title: "Create a private Disco/SoundCloud pitch playlist for supervisors", category: "sync", priority: "medium", description: "Build a curated Disco.ac or private SoundCloud playlist of your 20 best sync cuts with downloadable WAVs enabled. Send one link per brief so supervisors audition fast without inbox clutter." },
  { title: "Draft a standard sync licence template and fee schedule", category: "sync", priority: "medium", description: "Prepare a reusable sync agreement (term, territory, media, MFN) and a rough fee guide (student/indie vs ad vs national TV) so you can quote quickly. Have a solicitor review once; speed to quote wins placements." },
  { title: "Pitch brand-friendly tracks to a Manchester ad agency creative team", category: "sync", priority: "low", description: "Reach out to music-savvy creatives at independent Manchester or London ad shops with 2-3 brand-friendly electronic cuts and clear pricing. Local agencies with smaller budgets are more open to indie label catalog." },
  { title: "File PRS cue sheets for all broadcast sync placements", category: "sync", priority: "high", description: "When a track lands a broadcast placement, ensure the production files a PRS cue sheet and that the work is registered so you collect performance royalties. Missing cue sheets equals missing the biggest sync payday." },
  { title: "Audit which catalog tracks are exclusive vs free for sync", category: "sync", priority: "medium", description: "Map every release against existing library and distributor exclusivity so you never double-license or pitch a locked track. A simple 'sync availability' column in your catalog spreadsheet prevents costly clearance conflicts." },
  // Rights, royalties, finance & operations (34)
  { title: "Register all tracks with your PRO", category: "admin", priority: "high", description: "Ensure every released track is registered with PRS (UK), ASCAP, BMI or your local PRO to collect royalties." },
  { title: "Register catalog with SoundExchange", category: "admin", priority: "medium", description: "SoundExchange collects digital performance royalties for sound recordings in the US." },
  { title: "Set up YouTube Content ID", category: "admin", priority: "medium", description: "Use your distributor or a CID admin to claim ad revenue on user-uploaded versions of your tracks." },
  { title: "Create a press kit (EPK) for each active artist", category: "admin", priority: "medium", description: "A one-pager with bio, photo, latest release, streaming links and contact — essential for pitching." },
  { title: "Register the label as a PRS for Music member and affiliate artists", category: "admin", priority: "high", description: "Sign up eligible songwriters to PRS for Music (UK PRO) so performance royalties from radio, streaming and live sets are collected. Join fee is a one-off ~£100; do this before any track is broadcast or played publicly." },
  { title: "Join PPL and register all master recordings for neighbouring rights", category: "admin", priority: "high", description: "As the master rights holder, register recordings with PPL (UK neighbouring-rights society) to collect broadcast and public-performance income. Membership is free; add ISRCs and line-up/session-player details for each track." },
  { title: "Register with MCPS to collect UK mechanical royalties", category: "admin", priority: "medium", description: "Set up MCPS membership (bundled with PRS) so mechanical royalties from physical, downloads and streaming are collected. Confirm your works are notified via the PRS/MCPS online portal after each release." },
  { title: "Sign up publishing catalog with a global admin publisher (e.g. Songtrust)", category: "admin", priority: "high", description: "Register writer/publisher shares with a global collection service like Songtrust or Sentric to sweep up royalties from 50+ overseas societies your PRO can't reach. Budget ~15% commission and no upfront fee with Songtrust." },
  { title: "Register writers with the MLC to claim US streaming mechanicals", category: "admin", priority: "high", description: "Set up a free Mechanical Licensing Collective (MLC) account so US on-demand streaming mechanical royalties aren't left unmatched in the black box. Match your works by ISWC/ISRC and keep splits current." },
  { title: "Confirm every release is registered with SoundExchange for US digital radio", category: "admin", priority: "medium", description: "Verify all masters are logged with SoundExchange so US non-interactive/satellite radio neighbouring-rights royalties (Pandora, SiriusXM) are collected. Cross-check the account quarterly for unregistered new releases." },
  { title: "Generate and log ISWCs for all compositions", category: "admin", priority: "medium", description: "Ensure each song has an ISWC (International Standard Work Code) issued via your PRO's work registration, distinct from the recording's ISRC. This lets societies worldwide match publishing income to the correct work." },
  { title: "Audit and confirm writer/publisher splits before every registration", category: "admin", priority: "high", description: "For each new track, confirm agreed composer/lyricist/producer splits in writing (email or split sheet) before submitting to PROs. Mismatched or missing splits are the top cause of frozen and unpaid royalties." },
  { title: "Register the label as a Merlin / distributor-linked rights holder for UGC claims", category: "admin", priority: "medium", description: "Through your distributor (e.g. DistroKid, Believe, or a Merlin member), enable user-generated-content and platform royalty collection on TikTok, Meta and Snap. Confirm the setting is on so fan-video usage generates income." },
  { title: "Reconcile PRS/PPL statements against actual releases each quarter", category: "admin", priority: "medium", description: "Each distribution period, compare society statements to your release list and spot missing works, wrong splits or unclaimed plays. Raise queries via the online portals within the claims window to recover lost income." },
  { title: "File retrospective PPL/PRS claims for older catalog plays", category: "admin", priority: "medium", description: "Search PPL and PRS unallocated/unclaimed pots and back-claim broadcast income from releases registered late. Most societies allow claims for the past 3-6 years, so this often recovers real money." },
  { title: "Register non-featured session musicians and vocalists for PPL performer shares", category: "admin", priority: "low", description: "Add any live instrumentalists, topliners or backing vocalists as performers on each PPL recording so they receive their share of neighbouring rights. Collect their PPL performer IDs at the session to avoid chasing later." },
  { title: "Ensure remixers and remix rights are correctly licensed and registered", category: "admin", priority: "medium", description: "For every commissioned remix, put a remix agreement in place and register the remixer's share (or master-only status) with PRS/PPL. Clarify whether the original writers retain 100% publishing before release." },
  { title: "Register sample and interpolation clearances with the relevant rights holders", category: "admin", priority: "high", description: "For any track using samples or interpolations, secure written master + publishing clearance and reflect the agreed splits in your PRO/publisher registration. Uncleared samples risk takedowns and royalty clawbacks." },
  { title: "Set up an IPI/CAE lookup check for all label writers", category: "admin", priority: "low", description: "Confirm each writer has a single, correct IPI/CAE number and that duplicates are merged with your PRO. Consistent IPIs across all works ensure international societies route royalties to the right person." },
  { title: "Notify newly released works to PRS within the claims deadline", category: "admin", priority: "urgent", description: "Register each just-released track's work details with PRS/MCPS immediately on release day so it's captured in the current royalty period. Missing the notification window delays payment by a full distribution cycle." },
  { title: "Set up a demo submission inbox with a clear brief on the label site", category: "admin", priority: "high", description: "Create a dedicated demos@ address (or a typed form via Labelradar/Google Form) with a short brief on genre fit, format, and response time. State you reply within 4-6 weeks so you aren't ghosting promising acts." },
  { title: "Triage the current demo backlog and reply to every submission", category: "admin", priority: "urgent", description: "Clear any demos older than 3 weeks: A/B/C-rank each and send a short personal yes/no/'keep sending' reply. A reliable reputation for responding is a small label's biggest scouting advantage." },
  { title: "Create an A&R scouting tracker in the Outreach CRM", category: "admin", priority: "high", description: "Add scouted artists as Contacts with fields for source, sound tags, follower count, momentum, and next-action. Review the pipeline every two weeks so warm prospects don't go cold." },
  { title: "Draft an artist development plan template for each signing", category: "admin", priority: "high", description: "Build a reusable doc covering 12-month release cadence, sonic goals, visual identity, live plan and skill gaps. Use it as the shared roadmap in your first dev meeting with every new artist." },
  { title: "Schedule quarterly artist development check-ins with each roster act", category: "admin", priority: "medium", description: "Book recurring 45-min 1:1s (via calendar invite) to review goals, wellbeing, output and blockers. Consistent check-ins catch stalled projects and retention risks early." },
  { title: "Audit each roster artist's release pipeline for a 6-month gap", category: "admin", priority: "high", description: "Review every signed artist's unreleased material and flag anyone with no track scheduled in the next six months. Momentum dies fast for electronic acts, so plan a stopgap single or remix." },
  { title: "Identify writing/production skill gaps and line up mentoring", category: "admin", priority: "low", description: "Note per-artist weak spots (mixdowns, arrangement, topline) and pair them with a roster peer or a paid session (~£150-250). Targeted development lifts release quality without a big budget." },
  { title: "Assess each artist's brand/identity readiness before next campaign", category: "admin", priority: "medium", description: "Score roster acts on artist name clarity, visual consistency, bio and story hook; flag those needing a positioning workshop. A clear identity is the foundation development work builds on." },
  { title: "Define written A&R signing criteria and a genre-fit checklist", category: "admin", priority: "medium", description: "Document the sound, work-ethic, audience and rights criteria a signing must meet, plus red flags. A shared rubric keeps signings on-brand and speeds up team decisions on demos." },
  { title: "Build a UK electronic booker & promoter contact list (30 targets)", category: "admin", priority: "high", description: "Compile 30 grassroots promoters/club nights across Manchester, Leeds, Bristol, London (e.g. Warehouse Project affiliates, Hidden, White Hotel bookers) in a spreadsheet with contact, venue capacity and genre fit. Aim for 5-10 warm targets you can personally email." },
  { title: "Pitch label showcase night to a Manchester venue (Hidden / White Hotel)", category: "admin", priority: "high", description: "Draft and send a showcase proposal to a 200-400 cap Manchester venue with a 3-4 act lineup from the roster. Include expected draw, socials reach and a proposed midweek/Sunday slot to lower risk for the promoter." },
  { title: "Apply for artist slots at UK festivals via GigMit / Festival Insights", category: "admin", priority: "high", description: "Submit roster EPKs to open festival applications on GigMit and festival booking portals for 2026 (e.g. Bluedot, Gottwood, Houghton, Field Maneuvers). Track deadlines in a calendar as many close 6-9 months out." },
  { title: "Submit to Boiler Room / HÖR Berlin open booking channels", category: "admin", priority: "medium", description: "Send mixes and links to Boiler Room submissions and HÖR Berlin's booking form for the best-fit roster DJs. Lead with a strong recorded set and any local scene credibility rather than streaming numbers." },
  { title: "Register the label for The Great Escape / Output showcase applications", category: "admin", priority: "medium", description: "Apply to industry showcase festivals (The Great Escape Brighton, Reeperbahn, Eurosonic) where an unsigned/emerging act can play. Check application windows now as TGE typically closes in autumn for the following May." },
  // Catalog, metadata & DSP profiles (27)
  { title: "Add missing MusicBrainz IDs to artists", category: "catalog", priority: "medium", description: "MusicBrainz is the global open music database. Linking improves entity recognition across the web." },
  { title: "Complete ISNI registration for all artists", category: "catalog", priority: "low", description: "ISNI is the ISO standard identifier for artists — needed for rights management and metadata accuracy." },
  { title: "Update artist bios across DSPs", category: "catalog", priority: "medium", description: "Check Spotify for Artists, Apple Music for Artists and Amazon Music to ensure bios match the label site." },
  { title: "Check streaming profiles match label branding", category: "catalog", priority: "low", description: "Ensure cover art, artist photos and bios are consistent across Spotify, Apple Music, Tidal and Amazon." },
  { title: "Submit albums to Rate Your Music / Discogs", category: "catalog", priority: "low", description: "Helps with discoverability and lets fans rate and discover your releases through music communities." },
  { title: "Audit ISRC codes across the full catalog for gaps and duplicates", category: "catalog", priority: "high", description: "Export every track from your distributor (e.g. RouteNote/DistroKid) and cross-check ISRCs are unique and present — no track should share a code with another or lack one. Keep a master spreadsheet as the single source of truth." },
  { title: "Assign UK ISRC prefix and log codes in a central register", category: "catalog", priority: "medium", description: "Register your own ISRC registrant prefix via PPL UK rather than relying on distributor-assigned codes, then log each issued code in a shared sheet so you retain control if you switch distributors." },
  { title: "Verify every release has a valid UPC/EAN barcode", category: "catalog", priority: "high", description: "Confirm each single, EP and album carries a unique 13-digit UPC in your distributor dashboard; flag any placeholder or reused barcodes that would collide on DSPs or Bandcamp." },
  { title: "Standardise artist name spelling and capitalisation across all releases", category: "catalog", priority: "high", description: "Pick one canonical spelling per artist (e.g. no stray feat. variations) and fix mismatches in your distributor so DSPs collapse them into one profile instead of splitting streams across duplicate pages." },
  { title: "Fill in songwriter and producer credits for every track", category: "catalog", priority: "high", description: "Complete full composer/producer/mixer credits in your distributor's metadata and in the Music Story/Jaxsta-style fields so DSP 'Credits' tabs are populated — good looks like every role named, not just the main artist." },
  { title: "Tag primary vs featured artist roles correctly on collabs", category: "catalog", priority: "medium", description: "Review remixes, features and B2B tracks to ensure the primary/featured/remixer roles are set properly in metadata so royalties and DSP attribution route to the right artist profiles." },
  { title: "Set accurate genre and sub-genre tags per release", category: "catalog", priority: "medium", description: "Assign precise electronic sub-genres (dubstep, DnB, house) in distributor metadata rather than a generic 'Electronic' — this feeds DSP algorithmic classification and store browsing categories." },
  { title: "Add explicit/clean advisory flags where required", category: "catalog", priority: "medium", description: "Mark any track with explicit lyrics with the correct advisory in your distributor to avoid rejection or mistagging on Apple Music and Spotify, and provide clean versions where useful for radio." },
  { title: "Embed correct BPM, key and mood metadata for DJ discovery", category: "catalog", priority: "low", description: "Populate BPM and musical key in your files/distributor and on Beatport/Bandcamp so DJs can find and mix tracks — Beatport in particular surfaces this, and accurate tags aid sync-library search too." },
  { title: "Reconcile catalog release dates across DSPs and internal records", category: "catalog", priority: "medium", description: "Check that original release dates match across Spotify, Apple, Beatport and your admin database; mismatched dates fragment 'latest release' logic and mess up back-catalog reporting." },
  { title: "Verify ownership and content on each Spotify/Apple artist profile", category: "catalog", priority: "high", description: "Claim all artist pages via Spotify for Artists and Apple Music for Artists and confirm no wrong tracks are mis-attributed; request DSP merges/splits for any incorrect groupings." },
  { title: "Standardise release title formatting (Remix, VIP, Extended)", category: "catalog", priority: "low", description: "Adopt a consistent title convention for version tags — e.g. 'Track (Artist Remix)' and '(Extended Mix)' — so the catalog reads cleanly and versions don't get de-duped incorrectly by DSPs." },
  { title: "Add label copyright (P and C) lines to every release", category: "catalog", priority: "medium", description: "Ensure each release carries correct '℗ 2026 Oscillation Records' and '© 2026 Oscillation Records' notices in metadata, matching the year of first publication — DSPs display these and they matter for rights disputes." },
  { title: "Reclaim and correct any distributor-assigned generic labels", category: "catalog", priority: "low", description: "Check older releases weren't published under a blank or distributor default label name; update the label field to 'Oscillation Records' so all catalog sits under one imprint on DSPs and Discogs." },
  { title: "Cross-check track durations and titles against master files", category: "catalog", priority: "low", description: "Spot-audit that DSP durations and titles match your delivered WAV masters to catch wrong-file uploads or truncated tracks; a quick quarterly pass prevents silent errors going unnoticed." },
  { title: "Build a single master catalog spreadsheet of all identifiers", category: "catalog", priority: "high", description: "Consolidate ISRC, UPC, release date, credits and PRO work IDs into one master sheet (or your admin catalog DB) so every identifier lives in one place — this is the backbone for audits, sync pitches and rights claims." },
  { title: "Set all upcoming releases to Friday 00:00 local go-live", category: "catalog", priority: "medium", description: "Confirm each scheduled release in the distributor dashboard is timed to the global Friday new-music day for chart eligibility and playlist cycles. Double-check the timezone field so a UK label doesn't accidentally drop at US time." },
  { title: "Schedule a waterfall/rolling strategy for the next EP", category: "catalog", priority: "medium", description: "Release EP singles sequentially so each new drop bundles prior tracks onto one growing release page, compounding streams. Confirm your distributor supports 'add track to existing release' before committing." },
  { title: "Reserve UPCs and ISRCs for the next quarter's slate", category: "catalog", priority: "medium", description: "Pre-generate UPC barcodes and ISRC codes for all Q-ahead tracks via your distributor or the PPL/PPL-issued ISRC prefix so nothing is blocked at delivery. Keep them logged in the catalog sheet against each track." },
  { title: "Time a catalog re-release / remaster to fill a gap week", category: "catalog", priority: "low", description: "Identify weeks with no new release and schedule a remaster, extended mix, or instrumental version to keep the release cadence and algorithm active. Good for slow months like August or late December." },
  { title: "Plan holiday/seasonal releases 6-8 weeks out", category: "catalog", priority: "low", description: "Slot any seasonal or themed tracks (NYE, festival-season) into the calendar early enough to pitch and build pre-saves. Electronic seasonal edits work well delivered by mid-October for December." },
  { title: "Confirm territory and pricing settings before delivery", category: "catalog", priority: "low", description: "Check each release is set to worldwide distribution (or intended territories) and correct download pricing in the distributor before it locks. Missing a store like Beatport or Traxsource is common for electronic releases." },
] as const;

type Task = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  assigneeId: string | null;
  dueAt: string | null;
  isTemplate: boolean;
};

// The assignable pool = admins (from /api/admin/users). Only entries with a real
// User id can own a task, so the picker filters out bootstrap admins who've never
// signed in (id === null).
type Assignee = { id: string; name: string | null; email: string; image: string | null };

const displayName = (a: Assignee) => a.name || a.email;
function initialsOf(a: Assignee) {
  const base = (a.name || a.email || "").trim();
  if (!base) return "?";
  const parts = base.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

// A round avatar: photo → object-cover image; no photo → initials; no user → a
// dashed "unassigned" placeholder. Sized in px so it reads crisply at small sizes.
function AssigneeAvatar({ user, size = 22 }: { user: Assignee | null; size?: number }) {
  if (!user) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground"
        style={{ width: size, height: size }}
      >
        <UserRound style={{ width: size * 0.55, height: size * 0.55 }} aria-hidden />
      </span>
    );
  }
  if (user.image) {
    return (
      <Image
        src={user.image}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold uppercase text-foreground"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {initialsOf(user)}
    </span>
  );
}

// Inline assignee control on a task row: an avatar button that opens a menu to
// (re)assign or clear. Persists via PATCH so no dialog trip is needed.
function AssigneePicker({
  value, assignees, myId, onChange,
}: {
  value: string | null;
  assignees: Assignee[];
  myId?: string;
  onChange: (assigneeId: string | null) => void;
}) {
  const current = value ? assignees.find((a) => a.id === value) ?? null : null;
  const label = current ? displayName(current) : "Unassigned";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={`Assignee: ${label}`}
          aria-label={`Assignee: ${label}. Reassign task.`}
          className={`flex shrink-0 items-center gap-1.5 rounded-full outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring ${
            current ? "py-0.5 pl-0.5 pr-2 hover:bg-white/5" : "hover:opacity-80"
          }`}
        >
          <AssigneeAvatar user={current} />
          {current ? (
            // Name shows from the `sm` breakpoint up; on narrow phones the row
            // stays compact (avatar-only) to protect the row's controls.
            <span className="hidden max-w-[7.5rem] truncate text-xs text-muted-foreground sm:inline-block">
              {displayName(current)}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        <DropdownMenuItem onClick={() => onChange(null)} className="gap-2">
          <AssigneeAvatar user={null} size={20} />
          <span className="flex-1">Unassigned</span>
          {!value ? <Check className="h-3.5 w-3.5" /> : null}
        </DropdownMenuItem>
        {assignees.length > 0 ? <DropdownMenuSeparator /> : null}
        {assignees.map((a) => (
          <DropdownMenuItem key={a.id} onClick={() => onChange(a.id)} className="gap-2">
            <AssigneeAvatar user={a} size={20} />
            <span className="flex-1 truncate">{displayName(a)}{a.id === myId ? " (me)" : ""}</span>
            {value === a.id ? <Check className="h-3.5 w-3.5" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const EMPTY_FORM = { title: "", description: "", category: "pitching", priority: "medium", status: "todo", assigneeId: "", dueAt: "" };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TasksPage() {
  const toast = useToast();
  const { data: session } = useSession();
  const myId = session?.user?.id;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  // Assignee filter: "" = everyone · "me" = my tasks · "none" = unassigned · <id>.
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [cal, setCal] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  const [showSuggestions, setShowSuggestions] = useState(false);
  // Filters for the suggested-tasks panel (200 items — needs search + category).
  const [suggestionQuery, setSuggestionQuery] = useState("");
  const [suggestionCat, setSuggestionCat] = useState<string>("all");

  // Needs attention (auto-detected catalog issues) — its own tab, eager-loaded so
  // the count is visible on the tab.
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [attentionLoading, setAttentionLoading] = useState(false);
  const [attentionLoaded, setAttentionLoaded] = useState(false);

  // Create / edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // ---- data ----
  const loadTasks = useCallback(async () => {
    // Live data: paint cached tasks instantly on revisit, always revalidate.
    const cached = getCached<Task[]>("tasks-list");
    if (cached) {
      setTasks(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch("/api/outreach/tasks?isTemplate=false");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTasks(data.items);
      setCached("tasks-list", data.items);
    } catch {
      if (!cached) toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadAttention = useCallback(async () => {
    setAttentionLoading(true);
    try {
      const res = await fetch("/api/tasks/needs-attention");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAttentionItems(data.items);
      setAttentionLoaded(true);
    } catch {
      // non-fatal: the tab still works, just no count/items
    } finally {
      setAttentionLoading(false);
    }
  }, []);

  // Assignable people = admins who've signed in (have a User id). Reuses the admin
  // users endpoint so there's one source of truth for "who can access the admin".
  const loadAssignees = useCallback(async () => {
    const cached = getCached<Assignee[]>("task-assignees");
    if (cached) setAssignees(cached);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list: Assignee[] = (data.admins ?? [])
        .filter((a: { id: string | null }) => a.id)
        .map((a: { id: string; name: string | null; email: string; image: string | null }) => ({
          id: a.id, name: a.name, email: a.email, image: a.image,
        }));
      setAssignees(list);
      setCached("task-assignees", list);
    } catch {
      // non-fatal: assignment UI just shows the current data (or nothing)
    }
  }, []);

  useEffect(() => {
    loadTasks();
    loadAttention();
    loadAssignees();
  }, [loadTasks, loadAttention, loadAssignees]);

  // ---- derived ----
  // Non-status filters (category + assignee), shared by the list, the tab counts
  // and the calendar so all three stay in agreement.
  const assigneeOk = useCallback(
    (t: Task) =>
      assigneeFilter === "" ? true
        : assigneeFilter === "none" ? !t.assigneeId
        : assigneeFilter === "me" ? t.assigneeId === myId
        : t.assigneeId === assigneeFilter,
    [assigneeFilter, myId]
  );
  const matchesFilters = useCallback(
    (t: Task) => (!categoryFilter || t.category === categoryFilter) && assigneeOk(t),
    [categoryFilter, assigneeOk]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, todo: 0, in_progress: 0, done: 0 };
    for (const t of tasks) {
      if (!matchesFilters(t)) continue;
      c.all++;
      c[t.status] = (c[t.status] ?? 0) + 1;
    }
    return c;
  }, [tasks, matchesFilters]);

  // Suggested-tasks panel filtering (search + category) — 200 items are too many
  // to scroll, so narrow by keyword and/or category before rendering.
  const filteredSuggestions = useMemo(() => {
    const q = suggestionQuery.trim().toLowerCase();
    return SUGGESTIONS.filter(
      (s) =>
        (suggestionCat === "all" || s.category === suggestionCat) &&
        (!q || s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    );
  }, [suggestionQuery, suggestionCat]);

  const filtered = useMemo(
    () =>
      tasks
        .filter((t) => (tab === "all" || t.status === tab) && matchesFilters(t))
        // Auto-sort by urgency: completed sink to the bottom, then most-urgent
        // priority first, then soonest/overdue due date (undated last).
        .sort((a, b) => {
          const aDone = a.status === "done";
          const bDone = b.status === "done";
          if (aDone !== bDone) return aDone ? 1 : -1;
          const pr = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
          if (pr !== 0) return pr;
          const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
          const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
          return aDue - bDue;
        }),
    [tasks, tab, matchesFilters]
  );

  // Calendar: group dated tasks by their due day (category + assignee filters
  // apply; all statuses shown). Undated tasks get their own strip below the grid.
  const byDay = useMemo(() => {
    const m: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (!t.dueAt) continue;
      if (!matchesFilters(t)) continue;
      (m[t.dueAt.slice(0, 10)] ??= []).push(t);
    }
    return m;
  }, [tasks, matchesFilters]);
  const undated = useMemo(
    () => tasks.filter((t) => !t.dueAt && matchesFilters(t)),
    [tasks, matchesFilters]
  );
  const monthLabel = new Date(cal.y, cal.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayKey = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();
  const cells = useMemo(() => {
    const startDow = new Date(cal.y, cal.m, 1).getDay();
    const days = new Date(cal.y, cal.m + 1, 0).getDate();
    const arr: Array<{ key: string; day: number } | null> = [];
    for (let i = 0; i < startDow; i++) arr.push(null);
    for (let d = 1; d <= days; d++) arr.push({ key: `${cal.y}-${pad(cal.m + 1)}-${pad(d)}`, day: d });
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cal]);

  // ---- actions ----
  const setField = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  const openNew = () => { setEditingId(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true); };
  const openEdit = (t: Task) => {
    setEditingId(t.id);
    setForm({
      title: t.title,
      description: t.description ?? "",
      category: t.category,
      priority: t.priority,
      status: t.status,
      assigneeId: t.assigneeId ?? "",
      dueAt: t.dueAt ? t.dueAt.slice(0, 10) : "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const body = { ...form, dueAt: form.dueAt || null, isTemplate: false };
      const res = editingId
        ? await fetch(`/api/outreach/tasks/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/outreach/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) throw new Error();
      const wasNew = !editingId;
      toast.success(wasNew ? "Task added" : "Task updated");
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      // Land where the saved task is so it's visible (new tasks default to To Do).
      if (wasNew) setTab("todo");
      else if (tab !== "all" && tab !== "attention" && tab !== form.status) setTab(form.status as Tab);
      loadTasks();
    } catch {
      toast.error(editingId ? "Failed to update task" : "Failed to add task");
    } finally {
      setSaving(false);
    }
  };

  const addSuggestion = async (s: (typeof SUGGESTIONS)[number]) => {
    try {
      const res = await fetch("/api/outreach/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: s.title, description: s.description, category: s.category, priority: s.priority, isTemplate: false, status: "todo" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Task added to To Do");
      setTab("todo");
      loadTasks();
    } catch {
      toast.error("Failed to add task");
    }
  };

  const updateStatus = async (id: string, status: string) => {
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      const res = await fetch(`/api/outreach/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Failed to update task");
      loadTasks();
    }
  };

  const updateAssignee = async (id: string, assigneeId: string | null) => {
    // Optimistic: reflect the reassignment immediately, roll back on failure.
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, assigneeId } : t)));
    setCached("tasks-list", tasks.map((t) => (t.id === id ? { ...t, assigneeId } : t)));
    try {
      const res = await fetch(`/api/outreach/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Failed to reassign task");
      loadTasks();
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/outreach/tasks/${deleteTarget}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Task deleted");
      setDeleteTarget(null);
      loadTasks();
    } catch {
      toast.error("Failed to delete task");
    } finally {
      setWorking(false);
    }
  };

  const isOverdue = (t: Task) => t.dueAt && new Date(t.dueAt) < new Date() && t.status !== "done";

  // Assignee filter dropdown, shared by the list and calendar toolbars. "My tasks"
  // only appears once we know who's signed in; the current user is folded into it
  // rather than listed twice.
  const assigneeFilterSelect = (
    <select
      value={assigneeFilter}
      onChange={(e) => setAssigneeFilter(e.target.value)}
      aria-label="Filter by assignee"
      className="rounded-md border border-border bg-card py-1.5 pl-3 pr-8 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <option value="">All assignees</option>
      {myId ? <option value="me">My tasks</option> : null}
      <option value="none">Unassigned</option>
      {assignees.filter((a) => a.id !== myId).map((a) => (
        <option key={a.id} value={a.id}>{displayName(a)}</option>
      ))}
    </select>
  );

  // ---- render ----
  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Outreach and label action items, plus auto-detected catalog issues."
        actions={
          <Button onClick={openNew} className="bg-white text-black hover:bg-gray-200">
            <Plus className="h-4 w-4" /> New task
          </Button>
        }
      />

      {/* Suggested tasks (collapsible) */}
      <div className="mb-5 rounded-xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowSuggestions((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            Suggested tasks — click any to add to To Do
          </span>
          {showSuggestions ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {showSuggestions && (
          <div className="border-t border-border p-4">
            {/* Search + category filter — 200 suggestions is a lot to scroll. */}
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={suggestionQuery}
                onChange={(e) => setSuggestionQuery(e.target.value)}
                placeholder="Search suggestions…"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring sm:max-w-xs"
              />
              <div className="flex flex-wrap gap-1">
                {(["all", ...CATEGORIES] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSuggestionCat(c)}
                    className={`rounded-full border px-2.5 py-1 text-xs capitalize transition-colors ${
                      suggestionCat === c
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground sm:ml-auto">
                {filteredSuggestions.length} of {SUGGESTIONS.length}
              </span>
            </div>
            {filteredSuggestions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No suggestions match that filter.</p>
            ) : (
              <div className="grid max-h-[28rem] gap-2 overflow-y-auto scroll-themed pr-1 sm:grid-cols-2">
                {filteredSuggestions.map((s) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => addSuggestion(s)}
                    className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-border/80 hover:bg-white/[0.02]"
                  >
                    <span className="text-sm font-medium">{s.title}</span>
                    <span className="text-xs text-muted-foreground">{s.description}</span>
                    <div className="mt-1 flex gap-1.5">
                      <Badge variant="muted" className="text-[10px]">{s.category}</Badge>
                      <Badge variant={priorityVariant(s.priority)} className="text-[10px]">{PRIORITY_LABELS[s.priority]}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* View: list / calendar */}
      <div className="mb-4 inline-flex rounded-lg border border-border p-0.5">
        <button
          type="button"
          onClick={() => setView("list")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            view === "list" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <List className="h-3.5 w-3.5" /> List
        </button>
        <button
          type="button"
          onClick={() => setView("calendar")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            view === "calendar" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CalendarDays className="h-3.5 w-3.5" /> Calendar
        </button>
      </div>

      {view === "list" ? (
        <>
      {/* Tabs: Needs attention + status filters, then category */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => setTab("attention")}
            title={ATTENTION_HELP}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              tab === "attention" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Needs attention
            {attentionLoaded ? (
              <span className={`ml-0.5 tabular-nums ${attentionItems.length ? "text-amber-400" : "text-muted-foreground"}`}>
                {attentionItems.length}
              </span>
            ) : attentionLoading ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : null}
          </button>
          <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                tab === key ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{counts[key] ?? 0}</span>
            </button>
          ))}
        </div>
        {tab === "attention" ? (
          <InfoHint text={ATTENTION_HELP} />
        ) : (
          <>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter by category"
              className="rounded-md border border-border bg-card py-1.5 pl-3 pr-8 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
            {assigneeFilterSelect}
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* NEEDS ATTENTION                                                     */}
      {/* ------------------------------------------------------------------ */}
      {tab === "attention" ? (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            Auto-detected issues in your live catalog — click any to jump straight to it. These clear themselves once fixed.
          </p>
          {attentionLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4">
                  <Skeleton className="mb-1.5 h-4 w-64" />
                  <Skeleton className="h-3 w-96 max-w-full" />
                </div>
              ))}
            </div>
          ) : attentionItems.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
              Everything looks good — no catalog issues found.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {attentionItems.map((item) => {
                const Icon = item.type === "release" ? Music2 : item.type === "system" ? AlertCircle : Radio;
                // Pin + highlight unread contact messages — time-sensitive inbound.
                const isMessage = item.id === "system-messages";
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`group flex items-start gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-white/[0.02] ${
                      isMessage
                        ? "border-amber-500/50 border-l-[3px] border-l-amber-500 bg-amber-500/[0.04] hover:border-amber-500/70"
                        : "border-border hover:border-white/20"
                    }`}
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${isMessage ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-background"}`}>
                      <Icon className={`h-4 w-4 ${isMessage ? "text-amber-400" : "text-muted-foreground"}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium group-hover:underline">{item.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={attentionPriorityVariant(item.priority)} className="text-[10px]">{item.priority}</Badge>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* -------------------------------------------------------------- */
        /* TASK LIST                                                       */
        /* -------------------------------------------------------------- */
        <div className="flex flex-col gap-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <Skeleton className="mb-1.5 h-4 w-64" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
              {tasks.length === 0
                ? "No tasks yet. Add one with “New task”, or pick from the suggestions above."
                : categoryFilter || tab !== "all"
                  ? "No tasks match these filters."
                  : "No tasks yet."}
            </div>
          ) : (
            filtered.map((t) => {
              const overdue = isOverdue(t);
              return (
              <div
                key={t.id}
                className={`group flex items-center gap-3 rounded-xl border border-border border-l-[3px] bg-card px-4 py-3 transition-colors hover:bg-white/[0.02] ${STATUS_ACCENT[t.status] ?? "border-l-zinc-600"}`}
              >
                {/* Complete toggle */}
                <button
                  type="button"
                  onClick={() => updateStatus(t.id, t.status === "done" ? "todo" : "done")}
                  title={t.status === "done" ? "Mark as to do" : "Mark as done"}
                  aria-label={t.status === "done" ? "Mark as to do" : "Mark as done"}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    t.status === "done"
                      ? "border-emerald-500 bg-emerald-500 text-black"
                      : "border-border hover:border-foreground/50"
                  }`}
                >
                  {t.status === "done" ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </button>

                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${t.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                    {t.title}
                  </p>
                  {t.description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.description}</p>
                  )}
                  {/* One compact, scannable meta line: priority · category · due */}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority] ?? "bg-zinc-500"}`} />
                      {PRIORITY_LABELS[t.priority]}
                    </span>
                    <span className="text-border" aria-hidden>·</span>
                    <span className="capitalize">{t.category}</span>
                    {t.dueAt && (
                      <>
                        <span className="text-border" aria-hidden>·</span>
                        <span className={overdue ? "font-medium text-amber-400" : ""}>
                          {overdue ? "Overdue" : "Due"} {fmtDate(t.dueAt)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Assignee + status pill (coloured) + edit + delete */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <AssigneePicker
                    value={t.assigneeId}
                    assignees={assignees}
                    myId={myId}
                    onChange={(assigneeId) => updateAssignee(t.id, assigneeId)}
                  />
                  <select
                    value={t.status}
                    onChange={(e) => updateStatus(t.id, e.target.value)}
                    title="Change status"
                    aria-label="Change status"
                    className={`rounded-md border py-1 pl-2.5 pr-6 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring ${STATUS_PILL[t.status] ?? "border-border bg-background text-foreground"}`}
                  >
                    {STATUSES.map((s) => <option key={s} value={s} className="bg-card text-foreground">{STATUS_LABELS[s]}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => openEdit(t)}
                    title="Edit task"
                    aria-label="Edit task"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(t.id)}
                    title="Delete task"
                    aria-label="Delete task"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-950/20 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              );
            })
          )}
        </div>
      )}
        </>
      ) : (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-lg border border-border p-0.5">
              <button type="button" onClick={() => setCal((c) => shiftMonth(c, -1))} aria-label="Previous month" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="w-36 text-center text-sm font-medium">{monthLabel}</span>
              <button type="button" onClick={() => setCal((c) => shiftMonth(c, 1))} aria-label="Next month" className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button type="button" onClick={() => { const d = new Date(); setCal({ y: d.getFullYear(), m: d.getMonth() }); }} className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
              Today
            </button>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category" className="rounded-md border border-border bg-card py-1.5 pl-3 pr-8 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
            {assigneeFilterSelect}
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="bg-card px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{d}</div>
            ))}
            {cells.map((cell, i) =>
              cell === null ? (
                <div key={`b-${i}`} className="min-h-[6rem] bg-background/30" />
              ) : (
                <div key={cell.key} className="min-h-[6rem] bg-card p-1.5">
                  <div className="mb-1 flex justify-end">
                    <span className={`flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs tabular-nums ${cell.key === todayKey ? "bg-white font-medium text-black" : "text-muted-foreground"}`}>
                      {cell.day}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {(byDay[cell.key] ?? []).map((t) => (
                      <button key={t.id} type="button" onClick={() => openEdit(t)} title={t.title} className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] transition-colors hover:bg-white/5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority] ?? "bg-zinc-500"}`} />
                        <span className={`truncate ${t.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}>{t.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>

          {undated.length > 0 && (
            <div className="mt-4 rounded-xl border border-border bg-card p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">No due date ({undated.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {undated.map((t) => (
                  <button key={t.id} type="button" onClick={() => openEdit(t)} title={t.title} className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs transition-colors hover:border-white/20">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority] ?? "bg-zinc-500"}`} />
                    <span className={`truncate ${t.status === "done" ? "text-muted-foreground line-through" : ""}`}>{t.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditingId(null); setForm({ ...EMPTY_FORM }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Edit task" : "New task"}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Title <span className="text-destructive">*</span></label>
              <input value={form.title} onChange={(e) => setField("title", e.target.value)}
                placeholder="What needs to be done?"
                className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Description</label>
              <textarea value={form.description} onChange={(e) => setField("description", e.target.value)} rows={2}
                placeholder="How to do it, what to look for…"
                className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Category</label>
                <select value={form.category} onChange={(e) => setField("category", e.target.value)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Priority</label>
                <select value={form.priority} onChange={(e) => setField("priority", e.target.value)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Assignee</label>
              <select value={form.assigneeId} onChange={(e) => setField("assigneeId", e.target.value)}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                <option value="">Unassigned</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>{displayName(a)}{a.id === myId ? " (me)" : ""}</option>
                ))}
              </select>
            </div>
            {editingId ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Status</label>
                  <select value={form.status} onChange={(e) => setField("status", e.target.value)}
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Due date</label>
                  <input type="date" value={form.dueAt} onChange={(e) => setField("dueAt", e.target.value)}
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Due date <span className="font-normal text-muted-foreground">(optional)</span></label>
                <input type="date" value={form.dueAt} onChange={(e) => setField("dueAt", e.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-white text-black hover:bg-gray-200">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editingId ? "Save changes" : "Add task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete task</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete this task? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={working}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
