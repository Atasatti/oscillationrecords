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
        title="Site settings"
        description="Hero images, the studio-photos carousel, and footer social links shown across the public site."
      />
      <div className="space-y-8">
        <StackedHeroImagesAdmin />
        <StudioPhotosAdmin />
        <FooterSettingsAdmin />
      </div>
    </div>
  );
}
