import React from "react";
import { getStudioPhotos } from "@/lib/site-settings";
import Hero3DScene from "./Hero3DScene";

export default async function HomeHeroSection() {
  const photos = await getStudioPhotos();

  return <Hero3DScene photos={photos} />;
}
