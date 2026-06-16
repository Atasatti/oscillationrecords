import AlbumLayout from "@/components/local-ui/AlbumLayout";
import ContactFormSection from "@/components/sections/ContactFormSection";
import MusicHeardSection from "@/components/sections/MusicHeardSection";
import ScrollReveal3D from "@/components/local-ui/ScrollReveal3D";
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with Oscillation Records — for artists, collaborations, and enquiries.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact | Oscillation Records",
    description: "Get in touch with Oscillation Records.",
    url: "/contact",
  },
};

const ContactPage = () => {
  return (
    <div>
      <ScrollReveal3D>
        <div
          className="bg-center bg-no-repeat bg-contain flex justify-between px-[10%] w-full mx-auto"
          style={{ backgroundImage: `url('/profit-bg.svg')` }}
        >
          <ContactFormSection />
          <AlbumLayout />
        </div>
      </ScrollReveal3D>
      <ScrollReveal3D>
        <MusicHeardSection
          heading="Send us your demo"
          subtext="Oscillation Records for the Artists."
        />
      </ScrollReveal3D>
    </div>
  );
};

export default ContactPage;
