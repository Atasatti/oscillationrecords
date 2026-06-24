"use client";
import React from "react";
import FooterSettingsAdmin from "@/components/admin/FooterSettingsAdmin";
import AdminRolesAdmin from "@/components/admin/AdminRolesAdmin";
import PageHeader from "@/components/admin/shell/PageHeader";

export default function AdminSettings() {
  return (
    <div>
      <PageHeader
        title="Site settings"
        description="Site-wide settings that apply across every page. Home-page content (hero, photos, carousels) lives under Homepage."
      />
      <div className="space-y-8">
        <AdminRolesAdmin />
        <FooterSettingsAdmin />
      </div>
    </div>
  );
}
