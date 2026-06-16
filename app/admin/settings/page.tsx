"use client";
import React from "react";
import StackedHeroImagesAdmin from "@/components/admin/StackedHeroImagesAdmin";
import StudioPhotosAdmin from "@/components/admin/StudioPhotosAdmin";
import FooterSettingsAdmin from "@/components/admin/FooterSettingsAdmin";
import PageHeader from "@/components/admin/shell/PageHeader";

export default function AdminSettings() {
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Hero images, studio photos, and footer links shown across the public site."
      />
      <StackedHeroImagesAdmin />
      <StudioPhotosAdmin />
      <FooterSettingsAdmin />
    </div>
  );
}
