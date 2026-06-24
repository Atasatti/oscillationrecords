"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function UserDemographicsCollector() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [showDialog, setShowDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    gender: "",
    age: "",
    ageRange: "",
    country: "",
    city: "",
  });

  const skipOnPaths = pathname?.startsWith("/admin") || pathname?.startsWith("/benert-remix");

  useEffect(() => {
    if (skipOnPaths) return;

    // Check if user has already provided demographics
    const checkProfile = async () => {
      if (!session?.user) return;

      // Demographics are analytics → only prompt with analytics consent
      // ("osc_consent=all", a readable cookie set by the consent banner). The
      // server enforces the same on write.
      const consented =
        typeof document !== "undefined" &&
        document.cookie.split("; ").some((c) => c.trim() === "osc_consent=all");
      if (!consented) return;

      try {
        const response = await fetch("/api/analytics/user-profile");
        if (response.ok) {
          const { profile } = await response.json();
          // Only show dialog if profile doesn't exist or is incomplete
          if (!profile || (!profile.gender && !profile.ageRange)) {
            // Wait a bit before showing to not interrupt user experience
            setTimeout(() => {
              setShowDialog(true);
            }, 5000);
          }
        }
      } catch (error) {
        console.error("Error checking profile:", error);
      }
    };

    checkProfile();
  }, [session, skipOnPaths]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/analytics/user-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gender: formData.gender || null,
          age: formData.age ? parseInt(formData.age) : null,
          ageRange: formData.ageRange || null,
          country: formData.country || null,
          city: formData.city || null,
        }),
      });

      if (response.ok) {
        setShowDialog(false);
      }
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateAgeRange = (age: number): string => {
    if (age >= 18 && age <= 24) return "18-24";
    if (age >= 25 && age <= 34) return "25-34";
    if (age >= 35 && age <= 44) return "35-44";
    if (age >= 45 && age <= 54) return "45-54";
    if (age >= 55) return "55+";
    return "";
  };

  const handleAgeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const age = e.target.value;
    setFormData(prev => ({
      ...prev,
      age,
      ageRange: age ? calculateAgeRange(parseInt(age)) : "",
    }));
  };

  if (!session?.user || skipOnPaths) return null;

  return (
    <Dialog open={showDialog} onOpenChange={setShowDialog}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Help Us Improve</DialogTitle>
          <DialogDescription className="text-gray-400">
            Share some information about yourself to help us provide better content. All information is optional and kept private.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div>
              <label htmlFor="gender" className="block text-sm font-medium text-gray-300 mb-2">
                Gender
              </label>
              <select
                id="gender"
                value={formData.gender}
                onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 focus:border-gray-600 focus:outline-none"
              >
                <option value="">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label htmlFor="age" className="block text-sm font-medium text-gray-300 mb-2">
                Age
              </label>
              <Input
                id="age"
                type="number"
                min="18"
                max="100"
                value={formData.age}
                onChange={handleAgeChange}
                placeholder="Enter your age"
                className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
              />
            </div>

            <div>
              <label htmlFor="country" className="block text-sm font-medium text-gray-300 mb-2">
                Country (Optional)
              </label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                placeholder="e.g., United States"
                className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDialog(false)}
              className="border-gray-700"
            >
              Skip
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-white text-black hover:bg-gray-200"
            >
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

