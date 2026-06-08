"use client";

import React, { useState, useEffect } from "react";
import { BarChart3, Users, Play, TrendingUp, Music, Radio, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DashboardData {
  summary: {
    totalPlays: number;
    uniqueUsers: number;
    completedPlays: number;
    completionRate: number;
    totalUsers: number;
  };
  playsByType: {
    track: number;
    release: number;
    single: number;
    album: number;
    ep: number;
  };
  topContent: Array<{
    id: string;
    name: string;
    plays: number;
    artistName?: string;
  }>;
  topArtists: Array<{
    name: string;
    plays: number;
  }>;
  demographics: {
    gender: {
      male: number;
      female: number;
      other: number;
      prefer_not_to_say: number;
      unknown: number;
    };
    ageRange: {
      "18-24": number;
      "25-34": number;
      "35-44": number;
      "45-54": number;
      "55+": number;
      unknown: number;
    };
  };
  playsOverTime: Array<{
    date: string;
    count: number;
  }>;
  recentPlays: Array<{
    id: string;
    userName: string;
    contentType: string;
    contentName: string;
    artistName?: string;
    completed: boolean;
    createdAt: string;
  }>;
}

interface ContentAnalytics {
  contentId: string;
  contentType: string;
  summary: {
    totalPlays: number;
    uniqueUsers: number;
    completedPlays: number;
    completionRate: number;
    averagePlayDuration: number;
  };
  demographics: {
    gender: {
      male: number;
      female: number;
      other: number;
      prefer_not_to_say: number;
      unknown: number;
    };
    ageRange: {
      "18-24": number;
      "25-34": number;
      "35-44": number;
      "45-54": number;
      "55+": number;
      unknown: number;
    };
    topCountries: Array<{ country: string; count: number }>;
    topCities: Array<{ city: string; count: number }>;
  };
  topUsers: Array<{
    userId: string;
    userName: string;
    playCount: number;
    profile: Record<string, unknown>;
  }>;
  userEngagement: Array<{
    userId: string;
    userName: string;
    userEmail: string;
    gender: string | null;
    ageRange: string | null;
    country: string | null;
    city: string | null;
    playDuration: number | null;
    completed: boolean;
    createdAt: string;
  }>;
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [selectedContent, setSelectedContent] = useState<{ id: string; type: string; name: string } | null>(null);
  const [contentAnalytics, setContentAnalytics] = useState<ContentAnalytics | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, [days]);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/analytics/dashboard?days=${days}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const dashboardData = await response.json();
        setData(dashboardData);
      } else {
        setError("Failed to fetch dashboard data");
      }
    } catch (error) {
      console.error("Error fetching dashboard:", error);
      setError("Failed to fetch dashboard data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleContentClick = async (contentId: string, contentType: string, contentName: string) => {
    setSelectedContent({ id: contentId, type: contentType, name: contentName });
    setLoadingContent(true);
    
    try {
      // Extract actual content ID from the key format "type-id"
      const actualId = contentId.includes('-') ? contentId.split('-')[1] : contentId;
      const response = await fetch(`/api/analytics/content/${actualId}?type=${contentType}&days=${days}`);
      if (response.ok) {
        const analytics = await response.json();
        setContentAnalytics(analytics);
      } else {
        console.error("Failed to fetch content analytics");
      }
    } catch (error) {
      console.error("Error fetching content analytics:", error);
    } finally {
      setLoadingContent(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-4">{error || "No data available"}</p>
        <Button onClick={fetchDashboardData} variant="outline" className="border-gray-700">
          Retry
        </Button>
      </div>
    );
  }

  const maxPlays = Math.max(...data.topContent.map(c => c.plays), 1);
  const maxGender = Math.max(...Object.values(data.demographics.gender), 1);
  const maxAgeRange = Math.max(...Object.values(data.demographics.ageRange), 1);

  return (
    <div className="space-y-8">
      {/* Time Range Selector */}
      <div className="flex justify-end gap-2">
        {[7, 30, 90, 365].map((d) => (
          <Button
            key={d}
            variant={days === d ? "default" : "outline"}
            size="sm"
            onClick={() => setDays(d)}
            className={days === d ? "bg-white text-black hover:bg-gray-200" : "border-gray-700"}
          >
            {d === 7 ? "7 Days" : d === 30 ? "30 Days" : d === 90 ? "90 Days" : "1 Year"}
          </Button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-[#0F0F0F] rounded-xl p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-red-500/10 rounded-lg">
              <Play className="w-6 h-6 text-red-500" />
            </div>
          </div>
          <h3 className="text-sm text-gray-400 mb-1">Total Plays</h3>
          <p className="text-3xl font-light">{data.summary.totalPlays.toLocaleString()}</p>
        </div>

        <div className="bg-[#0F0F0F] rounded-xl p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Users className="w-6 h-6 text-blue-500" />
            </div>
          </div>
          <h3 className="text-sm text-gray-400 mb-1">Unique Users</h3>
          <p className="text-3xl font-light">{data.summary.uniqueUsers.toLocaleString()}</p>
        </div>

        <div className="bg-[#0F0F0F] rounded-xl p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-500/10 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-500" />
            </div>
          </div>
          <h3 className="text-sm text-gray-400 mb-1">Completion Rate</h3>
          <p className="text-3xl font-light">{data.summary.completionRate.toFixed(1)}%</p>
        </div>

        <div className="bg-[#0F0F0F] rounded-xl p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-500/10 rounded-lg">
              <BarChart3 className="w-6 h-6 text-purple-500" />
            </div>
          </div>
          <h3 className="text-sm text-gray-400 mb-1">Total Users</h3>
          <p className="text-3xl font-light">{data.summary.totalUsers.toLocaleString()}</p>
        </div>
      </div>

      {/* Plays by Type */}
      <div className="bg-[#0F0F0F] rounded-xl p-6 border border-gray-800">
        <h3 className="text-lg font-medium text-gray-200 mb-6">Plays by content type</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-red-500" />
                <span className="text-sm text-gray-400">Track (audio)</span>
              </div>
              <span className="text-sm font-medium">{data.playsByType.track}</span>
            </div>
            <div className="h-2 bg-[#0F0F0F] rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full transition-all"
                style={{ width: `${(data.playsByType.track / (data.summary.totalPlays || 1)) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-gray-400">Release (detail)</span>
              </div>
              <span className="text-sm font-medium">{data.playsByType.release}</span>
            </div>
            <div className="h-2 bg-[#0F0F0F] rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${(data.playsByType.release / (data.summary.totalPlays || 1)) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-green-500" />
                <span className="text-sm text-gray-400">Legacy (old)</span>
              </div>
              <span className="text-sm font-medium">
                {data.playsByType.single + data.playsByType.album + data.playsByType.ep}
              </span>
            </div>
            <div className="h-2 bg-[#0F0F0F] rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{
                  width: `${((data.playsByType.single + data.playsByType.album + data.playsByType.ep) / (data.summary.totalPlays || 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Top Content and Demographics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Content */}
        <div className="bg-[#0F0F0F] rounded-xl p-6 border border-gray-800">
          <h3 className="text-lg font-medium text-gray-200 mb-6">Top Content</h3>
          <div className="space-y-4">
            {data.topContent.length > 0 ? (
              data.topContent.map((content) => {
                // Extract content type and ID from the key format "type-id"
                const [contentType] = content.id.includes('-') 
                  ? content.id.split('-') 
                  : ['single', content.id];
                
                return (
                  <div 
                    key={content.id} 
                    className="space-y-2 cursor-pointer hover:bg-[#1a1a1a]/50 p-2 rounded-lg transition-colors"
                    onClick={() => handleContentClick(content.id, contentType, content.name)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white truncate">{content.name}</p>
                          <Eye className="w-3 h-3 text-gray-500 flex-shrink-0" />
                        </div>
                        {content.artistName && (
                          <p className="text-xs text-gray-500 truncate">{content.artistName}</p>
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-400 ml-4">{content.plays}</span>
                    </div>
                    <div className="h-2 bg-[#0F0F0F] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500 rounded-full transition-all"
                        style={{ width: `${(content.plays / maxPlays) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-gray-500 text-sm">No content data available</p>
            )}
          </div>
        </div>

        {/* Demographics - Gender */}
        <div className="bg-[#0F0F0F] rounded-xl p-6 border border-gray-800">
          <h3 className="text-lg font-medium text-gray-200 mb-6">Audience Demographics</h3>
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-4">Gender Distribution</h4>
              <div className="space-y-3">
                {Object.entries(data.demographics.gender)
                  .filter(([, count]) => count > 0)
                  .map(([gender, count]) => (
                    <div key={gender} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300 capitalize">{gender.replace('_', ' ')}</span>
                        <span className="text-sm font-medium text-gray-400">{count}</span>
                      </div>
                      <div className="h-2 bg-[#0F0F0F] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${(count / maxGender) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-400 mb-4">Age Range Distribution</h4>
              <div className="space-y-3">
                {Object.entries(data.demographics.ageRange)
                  .filter(([, count]) => count > 0)
                  .map(([ageRange, count]) => (
                    <div key={ageRange} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">{ageRange === 'unknown' ? 'Unknown' : ageRange}</span>
                        <span className="text-sm font-medium text-gray-400">{count}</span>
                      </div>
                      <div className="h-2 bg-[#0F0F0F] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${(count / maxAgeRange) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Artists */}
      <div className="bg-[#0F0F0F] rounded-xl p-6 border border-gray-800">
        <h3 className="text-lg font-medium text-gray-200 mb-6">Top Artists</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {data.topArtists.length > 0 ? (
            data.topArtists.map((artist, artistIndex) => (
              <div key={artist.name} className="text-center p-4 bg-[#0F0F0F] rounded-lg">
                <div className="text-2xl font-bold text-red-500 mb-2">#{artistIndex + 1}</div>
                <p className="text-sm font-medium text-white truncate mb-1">{artist.name}</p>
                <p className="text-xs text-gray-400">{artist.plays} plays</p>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm col-span-full">No artist data available</p>
          )}
        </div>
      </div>

      {/* Recent Plays */}
      <div className="bg-[#0F0F0F] rounded-xl p-6 border border-gray-800">
        <h3 className="text-lg font-medium text-gray-200 mb-6">Recent Plays</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">User</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Content</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Artist</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Type</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.recentPlays.filter((p) => p.contentType !== "release").length > 0 ? (
                data.recentPlays.filter((p) => p.contentType !== "release").slice(0, 20).map((play) => (
                  <tr key={play.id} className="border-b border-gray-800 hover:bg-[#1a1a1a]/50">
                    <td className="py-3 px-4 text-sm text-gray-300">{play.userName}</td>
                    <td className="py-3 px-4 text-sm text-white">{play.contentName}</td>
                    <td className="py-3 px-4 text-sm text-gray-400">{play.artistName || "—"}</td>
                    <td className="py-3 px-4 text-sm text-gray-400 capitalize">{play.contentType}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          play.completed
                            ? "bg-green-500/20 text-green-400"
                            : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {play.completed ? "Completed" : "Incomplete"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">
                      {new Date(play.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500 text-sm">
                    No recent track plays
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Content Detail Dialog */}
      <Dialog open={!!selectedContent} onOpenChange={(open) => !open && setSelectedContent(null)}>
        <DialogContent className="bg-[#0F0F0F] border-gray-800 text-white w-[95vw] max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">{selectedContent?.name}</DialogTitle>
            <DialogDescription className="text-gray-400">
              Detailed analytics and audience demographics for this {selectedContent?.type}
            </DialogDescription>
          </DialogHeader>

          {loadingContent ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
          ) : contentAnalytics ? (
            <div className="space-y-6 mt-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                  <p className="text-xs text-gray-400 mb-1">Total Plays</p>
                  <p className="text-2xl font-light">{contentAnalytics.summary.totalPlays}</p>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                  <p className="text-xs text-gray-400 mb-1">Unique Users</p>
                  <p className="text-2xl font-light">{contentAnalytics.summary.uniqueUsers}</p>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                  <p className="text-xs text-gray-400 mb-1">Completion Rate</p>
                  <p className="text-2xl font-light">{contentAnalytics.summary.completionRate.toFixed(1)}%</p>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                  <p className="text-xs text-gray-400 mb-1">Avg Duration</p>
                  <p className="text-2xl font-light">
                    {Math.floor(contentAnalytics.summary.averagePlayDuration / 60)}:
                    {(contentAnalytics.summary.averagePlayDuration % 60).toString().padStart(2, '0')}
                  </p>
                </div>
              </div>

              {/* Demographics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                  <h4 className="text-sm font-medium text-gray-300 mb-3">Gender Distribution</h4>
                  <div className="space-y-3">
                    {Object.entries(contentAnalytics.demographics.gender)
                      .filter(([, count]) => count > 0)
                      .map(([gender, count]) => {
                        const maxGender = Math.max(...Object.values(contentAnalytics.demographics.gender));
                        return (
                          <div key={gender} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-300 capitalize">{gender.replace('_', ' ')}</span>
                              <span className="text-xs font-medium text-gray-400">{count}</span>
                            </div>
                            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${(count / maxGender) * 100}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                  <h4 className="text-sm font-medium text-gray-300 mb-3">Age Range Distribution</h4>
                  <div className="space-y-3">
                    {Object.entries(contentAnalytics.demographics.ageRange)
                      .filter(([, count]) => count > 0)
                      .map(([ageRange, count]) => {
                        const maxAge = Math.max(...Object.values(contentAnalytics.demographics.ageRange));
                        return (
                          <div key={ageRange} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-300">{ageRange === 'unknown' ? 'Unknown' : ageRange}</span>
                              <span className="text-xs font-medium text-gray-400">{count}</span>
                            </div>
                            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${(count / maxAge) * 100}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              {/* Top Countries/Cities */}
              {(contentAnalytics.demographics.topCountries.length > 0 || contentAnalytics.demographics.topCities.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {contentAnalytics.demographics.topCountries.length > 0 && (
                    <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                      <h4 className="text-sm font-medium text-gray-300 mb-3">Top Countries</h4>
                      <div className="space-y-2">
                        {contentAnalytics.demographics.topCountries.map((item) => (
                          <div key={item.country} className="flex items-center justify-between">
                            <span className="text-xs text-gray-300">{item.country}</span>
                            <span className="text-xs font-medium text-gray-400">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {contentAnalytics.demographics.topCities.length > 0 && (
                    <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                      <h4 className="text-sm font-medium text-gray-300 mb-3">Top Cities</h4>
                      <div className="space-y-2">
                        {contentAnalytics.demographics.topCities.map((item) => (
                          <div key={item.city} className="flex items-center justify-between">
                            <span className="text-xs text-gray-300">{item.city}</span>
                            <span className="text-xs font-medium text-gray-400">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* User Engagement Table */}
              <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                <h4 className="text-sm font-medium text-gray-300 mb-3">User Engagement</h4>
                <table className="w-full text-xs border-collapse">
                  <colgroup>
                    <col style={{ width: "22%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "8%" }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-2 pr-3 text-gray-400 font-medium">User</th>
                      <th className="text-left py-2 pr-3 text-gray-400 font-medium">Email</th>
                      <th className="text-left py-2 pr-3 text-gray-400 font-medium">Gender</th>
                      <th className="text-left py-2 pr-3 text-gray-400 font-medium">Age</th>
                      <th className="text-left py-2 pr-3 text-gray-400 font-medium">Location</th>
                      <th className="text-left py-2 pr-3 text-gray-400 font-medium">Status</th>
                      <th className="text-left py-2 text-gray-400 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contentAnalytics.userEngagement.slice(0, 20).map((engagement) => (
                      <tr
                        key={`${engagement.userId}-${engagement.createdAt}`}
                        className="border-b border-gray-800 hover:bg-[#222]/50"
                      >
                        <td className="py-2 pr-3 text-gray-300 max-w-0">
                          <span className="block truncate" title={engagement.userName}>{engagement.userName}</span>
                        </td>
                        <td className="py-2 pr-3 text-gray-400 max-w-0">
                          <span className="block truncate" title={engagement.userEmail || undefined}>{engagement.userEmail || "—"}</span>
                        </td>
                        <td className="py-2 pr-3 text-gray-400 capitalize">{engagement.gender || "—"}</td>
                        <td className="py-2 pr-3 text-gray-400">{engagement.ageRange || "—"}</td>
                        <td className="py-2 pr-3 text-gray-400 max-w-0">
                          {(() => {
                            const loc = engagement.city && engagement.country
                              ? `${engagement.city}, ${engagement.country}`
                              : engagement.country || engagement.city || "—";
                            return <span className="block truncate" title={loc !== "—" ? loc : undefined}>{loc}</span>;
                          })()}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`px-2 py-0.5 rounded whitespace-nowrap ${
                              engagement.completed
                                ? "bg-green-500/20 text-green-400"
                                : "bg-yellow-500/20 text-yellow-400"
                            }`}
                          >
                            {engagement.completed ? "Completed" : "Incomplete"}
                          </span>
                        </td>
                        <td className="py-2 text-gray-500 whitespace-nowrap">
                          {new Date(engagement.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No analytics data available</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

