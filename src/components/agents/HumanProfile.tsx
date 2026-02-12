"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActorKindBadge } from "@/components/shared/ActorKindBadge";
import { SourceBadge } from "@/components/shared/SourceBadge";
import Link from "next/link";

interface Assignment {
  id: string;
  performedAt: string;
  bounty: {
    title: string | null;
    category: string | null;
    price: number | null;
    priceType: string | null;
    currency: string | null;
    skillsNeeded: string[] | null;
    url: string | null;
    creatorName: string;
    creatorId: string | null;
  } | null;
}

interface HumanProfileProps {
  agent: {
    id: string;
    displayName: string;
    description: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    totalActions: number | null;
  };
  profile: Record<string, any>;
  assignments: Assignment[];
}

export function HumanProfile({ agent, profile, assignments }: HumanProfileProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-zinc-100">{agent.displayName}</h1>
              <ActorKindBadge kind="human" />
              <SourceBadge sourceId="rentahuman" size="sm" />
              {profile.isVerified && (
                <span className="text-[9px] font-semibold uppercase tracking-wider px-1 py-px rounded border border-emerald-800/60 text-emerald-500/80 bg-emerald-950/30">
                  Verified
                </span>
              )}
            </div>
            {profile.headline && (
              <p className="text-sm text-zinc-400">{profile.headline}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {profile.isAvailable != null && (
              <span className="flex items-center gap-1.5 text-xs">
                <span className={`size-2 rounded-full ${profile.isAvailable ? "bg-emerald-500" : "bg-zinc-600"}`} />
                <span className="text-zinc-400">{profile.isAvailable ? "Available" : "Unavailable"}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Profile Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Bio, Skills, Expertise, Languages */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-[11px] uppercase tracking-widest text-accent">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile.bio && (
              <p className="text-sm text-zinc-300 leading-relaxed">{profile.bio}</p>
            )}
            {profile.skills?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {(profile.skills as string[]).map((skill: string) => (
                    <span key={skill} className="text-xs px-2 py-0.5 rounded-full border border-teal-800/50 text-teal-400/80 bg-teal-950/20">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {profile.expertise?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Expertise</p>
                <div className="flex flex-wrap gap-1.5">
                  {(profile.expertise as string[]).map((exp: string) => (
                    <span key={exp} className="text-xs px-2 py-0.5 rounded-full border border-teal-800/50 text-teal-400/60 bg-teal-950/10">
                      {exp}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {profile.languages?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">Languages</p>
                <p className="text-sm text-zinc-400">{(profile.languages as string[]).join(", ")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Stats */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-[11px] uppercase tracking-widest text-accent">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {profile.location && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500">Location</p>
                  <p className="text-sm text-zinc-300 mt-0.5">
                    {[profile.location.city, profile.location.state, profile.location.country].filter(Boolean).join(", ") || "Remote"}
                  </p>
                </div>
              )}
              {profile.hourlyRate != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500">Hourly Rate</p>
                  <p className="text-sm text-zinc-300 mt-0.5">
                    {profile.currency === "USD" ? "$" : ""}{profile.hourlyRate}{profile.currency && profile.currency !== "USD" ? ` ${profile.currency}` : ""}/hr
                  </p>
                </div>
              )}
              {profile.rating != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500">Rating</p>
                  <p className="text-sm text-zinc-300 mt-0.5">
                    {Number(profile.rating).toFixed(1)} / 5.0
                    {profile.reviewCount != null && (
                      <span className="text-zinc-500 ml-1">({profile.reviewCount} reviews)</span>
                    )}
                  </p>
                </div>
              )}
              {profile.totalBookings != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500">Total Bookings</p>
                  <p className="text-sm text-zinc-300 mt-0.5">{profile.totalBookings}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">First Seen</p>
                <p className="text-sm text-zinc-300 mt-0.5">{new Date(agent.firstSeenAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-zinc-500">Last Active</p>
                <p className="text-sm text-zinc-300 mt-0.5">{new Date(agent.lastSeenAt).toLocaleDateString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assigned Bounties */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-[11px] uppercase tracking-widest text-accent">Assigned Bounties</CardTitle>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-sm text-zinc-500">No bounty assignments yet</p>
          ) : (
            <div className="space-y-3">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="border-b border-zinc-800 pb-3 last:border-0">
                  {assignment.bounty ? (
                    <>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {assignment.bounty.url ? (
                          <a href={assignment.bounty.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-zinc-200 hover:text-zinc-100 underline decoration-zinc-700">
                            {assignment.bounty.title || "Untitled bounty"}
                          </a>
                        ) : (
                          <span className="text-sm font-medium text-zinc-200">{assignment.bounty.title || "Untitled bounty"}</span>
                        )}
                        {assignment.bounty.category && (
                          <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                            {assignment.bounty.category}
                          </Badge>
                        )}
                        {assignment.bounty.price != null && (
                          <span className="text-xs px-1.5 py-px rounded border border-amber-800/50 text-amber-400/80 bg-amber-950/20">
                            {assignment.bounty.currency === "USD" ? "$" : ""}{assignment.bounty.price}
                            {assignment.bounty.currency && assignment.bounty.currency !== "USD" ? ` ${assignment.bounty.currency}` : ""}
                            {assignment.bounty.priceType === "hourly" ? "/hr" : assignment.bounty.priceType === "fixed" ? " fixed" : ""}
                          </span>
                        )}
                      </div>
                      {assignment.bounty.skillsNeeded?.length ? (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {assignment.bounty.skillsNeeded.map((skill: string) => (
                            <span key={skill} className="text-[10px] px-1.5 py-px rounded border border-zinc-700 text-zinc-500">
                              {skill}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span>Requested by{" "}
                          {assignment.bounty.creatorId ? (
                            <Link href={`/agents/${assignment.bounty.creatorId}`} className="text-zinc-400 hover:text-zinc-300 underline decoration-zinc-700">
                              {assignment.bounty.creatorName}
                            </Link>
                          ) : (
                            assignment.bounty.creatorName
                          )}
                        </span>
                        <span>&middot;</span>
                        <span>{new Date(assignment.performedAt).toLocaleDateString()}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <span>Assignment</span>
                      <span className="text-xs text-zinc-600">{new Date(assignment.performedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
