"use client";
import React from "react";
import AnalyticsDashboard from "@/components/admin/AnalyticsDashboard";
import PageHeader from "@/components/admin/shell/PageHeader";

export default function Admin() {
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Release performance and audience engagement."
      />
      <AnalyticsDashboard />
    </div>
  );
}
