"use client";

import Image from "next/image";
import React from "react";
import { User, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useSession, signIn, signOut } from "next-auth/react";

type BenertRemixNavbarProps = {
  /** Post-login / post-logout redirect (include path only, e.g. `/benert-remix` or `/benert-remix/test`) */
  authCallbackPath?: string;
};

export default function BenertRemixNavbar({ authCallbackPath = "/benert-remix" }: BenertRemixNavbarProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  const isLoading = status === "loading";

  return (
    <nav className="flex justify-between items-center py-4 px-4 md:px-8 lg:px-[10%] border-b border-white/10 font-[family-name:var(--font-inter)]">
      <span className="text-lg md:text-xl font-medium tracking-tight text-white">
        Benert Remix Competition
      </span>
      <div className="flex items-center gap-2">
        {isLoading ? (
          <div className="w-9 h-9 rounded-full bg-white/20 animate-pulse" />
        ) : isAuthenticated && session?.user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-[#0f0f0f]"
                aria-label="Account menu"
              >
                {session.user.image ? (
                  <Image
                    src={session.user.image}
                    alt=""
                    width={36}
                    height={36}
                    className="rounded-full w-9 h-9 object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-rose-500 flex items-center justify-center text-white">
                    <User size={18} />
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-[#1a1a1a] border-white/10">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium truncate">{session.user.name ?? "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{session.user.email ?? ""}</p>
              </div>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: authCallbackPath })}
                className="cursor-pointer text-rose-400 focus:text-rose-300 focus:bg-rose-500/10"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="default"
            size="sm"
            className="bg-rose-500 hover:bg-rose-600 text-white rounded-lg px-4 py-2 text-sm font-medium"
            onClick={() => signIn("google", { callbackUrl: authCallbackPath })}
          >
            Login
          </Button>
        )}
      </div>
    </nav>
  );
}
