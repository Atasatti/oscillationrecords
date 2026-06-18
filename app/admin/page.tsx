"use client";
import React from "react";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import NeedsAttention from "@/components/admin/NeedsAttention";
import PageHeader from "@/components/admin/shell/PageHeader";

export default function Admin() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="How your music and site are doing for the selected period — plays, listeners, link click-through, and audience. Click any card or “View all” for the full breakdown. Figures cover everyone who accepted analytics cookies, plus signed-in members."
      />
      <NeedsAttention />
      <AnalyticsDashboard />
    </div>
  );
}
