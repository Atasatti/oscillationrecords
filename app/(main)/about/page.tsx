import AboutHeroSection from "@/components/sections/AboutHeroSection";
import AboutMoreSection from "@/components/sections/AboutMoreSection";
import AboutSection2 from "@/components/sections/AboutSection2";
import MusicHeardSection from "@/components/sections/MusicHeardSection";
import ScrollReveal3D from "@/components/local-ui/ScrollReveal3D";
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "About",
  description:
    "About Oscillation Records — a record label that puts artists first.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About | Oscillation Records",
    description: "A record label that puts artists first.",
    url: "/about",
  },
};

const AboutUs = () => {
  return (
    <div>
      <ScrollReveal3D>
        <AboutHeroSection />
      </ScrollReveal3D>
      <ScrollReveal3D>
        <AboutMoreSection />
      </ScrollReveal3D>
      <ScrollReveal3D>
        <AboutSection2 />
      </ScrollReveal3D>
      <ScrollReveal3D>
        <MusicHeardSection
          className="mt-24 sm:mt-32 md:mt-40"
          heading="Let’s get your music heard."
          subtext="Artist, visionary, or just someone with big ideas? We’re here to listen. Let’s talk."
        />
      </ScrollReveal3D>
    </div>
  );
};

export default AboutUs;
