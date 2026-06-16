"use client";
import React from "react";
import StackedHeroImagesAdmin from "@/components/admin/StackedHeroImagesAdmin";
import StudioPhotosAdmin from "@/components/admin/StudioPhotosAdmin";
import FooterSettingsAdmin from "@/components/admin/FooterSettingsAdmin";
import PageHeader from "@/components/admin/shell/PageHeader";

export default function AdminSettings() {
  return (
    <div className="min-h-screen text-white">
      <AdminNavbar />

      <div className="px-4 md:px-6 lg:px-[10%] py-8 md:py-12 lg:py-14">
        <div className="mb-8 md:mb-12 lg:mb-14">
          <p className="text-xs uppercase tracking-wider text-center text-muted-foreground">
            Site Settings
          </p>
          <p className="font-light text-3xl md:text-4xl lg:text-5xl text-center tracking-tighter mt-2 md:mt-3">
            Home &amp; Footer
          </p>
          <p className="text-gray-400 text-xs md:text-sm text-center mt-2">
            Hero images and footer social links shown across the public site
          </p>
        </div>

        <StackedHeroImagesAdmin />
        <StudioPhotosAdmin />
        <FooterSettingsAdmin />
      </div>
    </div>
  );
}
