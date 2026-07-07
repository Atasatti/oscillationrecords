// Artist publish-readiness — the three fields required to take an artist LIVE
// (name, biography, photo), mirroring the publish validation in the artists API.
// Deliberately NOT the SEO/discoverability score (links, genres, MusicBrainz,
// ISNI…): this answers "can this artist go live yet, and what's blocking it?".
// Pure — safe on server or client.

export type OnboardingChecks = {
  name: boolean;
  bio: boolean;
  photo: boolean;
  ready: boolean;
  missing: string[];
};

export function artistPublishChecks(a: {
  name: string;
  biography: string;
  profilePicture: string | null;
}): OnboardingChecks {
  const name = !!a.name?.trim();
  const bio = !!a.biography?.trim();
  const photo = !!a.profilePicture?.trim();
  const missing: string[] = [];
  if (!name) missing.push("Name");
  if (!bio) missing.push("Biography");
  if (!photo) missing.push("Photo");
  return { name, bio, photo, ready: name && bio && photo, missing };
}
