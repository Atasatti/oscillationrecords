import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { studioPageAccess } from "@/lib/page-guard";
import StudioBookingClient from "./StudioBookingClient";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const access = await studioPageAccess(); // redirects if signed out
  const session = await getServerSession(authOptions);

  if (access === "denied") {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="text-2xl font-light tracking-tight">Studio booking</h1>
        <p className="mt-4 text-muted-foreground">
          You&apos;re signed in as <span className="text-white">{session?.user?.email}</span>, but this
          account isn&apos;t on the studio access list yet. Ask the label to add you, then reload.
        </p>
      </div>
    );
  }

  return (
    <StudioBookingClient
      viewerName={session?.user?.name ?? null}
      isOwner={!!session?.user?.isAdmin}
    />
  );
}
