"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useState, useEffect } from "react";
import NavbarSearch from "./NavbarSearch";
import { LogOut, User, Menu, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import { signOutCompletely } from "@/lib/sign-out-client";
import { motion } from "motion/react";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/artists", label: "Artists" },
  { href: "/releases", label: "Releases" },
  { href: "/contact", label: "Contact Us" },
];

const navContainerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.4 } },
};

const navLinkVariants = {
  hidden: { y: -10, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 24 },
  },
};

const Navbar = () => {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  const isLoading = status === "loading";
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSignOut = async () => {
    await signOutCompletely("/");
  };

  const toggleMobileMenu = () => setIsMobileMenuOpen((v) => !v);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <>
      {/* Slide-down entrance on first load */}
      <motion.header
        initial={{ y: -90, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className={`sticky top-0 z-40 w-full backdrop-blur-md bg-background/90 supports-[backdrop-filter]:bg-background/75 transition-all duration-300 ${
          scrolled
            ? "border-b border-white/[0.10] shadow-[0_8px_32px_rgba(0,0,0,0.45),0_1px_0_rgba(255,255,255,0.08)]"
            : "border-b border-white/[0.06] shadow-[0_1px_0_rgba(255,255,255,0.04)]"
        }`}
      >
        <div className="mx-auto flex max-w-full items-center justify-between px-4 py-5 md:px-[10%] md:py-7">

          {/* Logo — scale on hover */}
          <Link href="/">
            <motion.div
              className="flex items-center gap-1.5 md:gap-3"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
            >
              <Image
                width={40}
                height={40}
                className="w-8 h-8 md:w-14 md:h-14"
                alt="logo-icon"
                src="/logo-icon.svg"
              />
              <Image
                width={80}
                height={24}
                className="w-22 h-8 md:w-28 md:h-9"
                alt="logo-name"
                src="/logo-name.svg"
              />
            </motion.div>
          </Link>

          {/* Desktop nav — stagger entrance + per-link hover lift */}
          <motion.div
            variants={navContainerVariants}
            initial="hidden"
            animate="visible"
            className="hidden 2xl:flex items-center gap-8 xl:gap-10 font-[family-name:var(--font-inter)] backdrop-blur-sm shadow-[5px_5px_30px_rgba(0,0,0,0.25)] px-4 xl:px-6 py-2.5 xl:py-3 rounded-xl"
          >
            {navLinks.map((link) => (
              <motion.div key={link.href} variants={navLinkVariants}>
                <Link href={link.href}>
                  <motion.p
                    className="uppercase text-muted-foreground text-xs xl:text-sm tracking-wider whitespace-nowrap"
                    whileHover={{
                      y: -3,
                      color: "#ffffff",
                      textShadow: "0 0 14px rgba(255,255,255,0.35)",
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  >
                    {link.label}
                  </motion.p>
                </Link>
              </motion.div>
            ))}
          </motion.div>

          {/* Right side — Search, Auth, Hamburger. These share the 2xl breakpoint
              with the desktop nav + hamburger so they never appear in both the
              navbar and the mobile menu at the same time (incl. when zoomed). */}
          <div className="flex items-center gap-2 md:gap-4">
            <div className="hidden 2xl:block w-full max-w-[200px] lg:max-w-[280px]">
              <NavbarSearch className="w-full" />
            </div>

            {/* Auth — Desktop */}
            <div className="hidden 2xl:flex items-center">
              {isLoading ? (
                <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
              ) : isAuthenticated && session?.user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="shrink-0 rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
                      {session.user.image ? (
                        <Image
                          src={session.user.image}
                          alt="User Avatar"
                          width={36}
                          height={36}
                          className="rounded-full cursor-pointer w-9 h-9 shrink-0 object-cover"
                          referrerPolicy="no-referrer"
                          crossOrigin="anonymous"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white">
                          <User size={18} />
                        </div>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium">{session.user.name || "User"}</p>
                      <p className="text-xs text-muted-foreground truncate">{session.user.email || ""}</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Sign out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="flex gap-2">
                  <Link href="/login">
                    <Button variant="ghost" size="sm" className="text-xs lg:text-sm">Sign In</Button>
                  </Link>
                  <Link href="/signup">
                    <Button size="sm" className="text-xs lg:text-sm">Sign Up</Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Hamburger — mobile */}
            <button
              onClick={toggleMobileMenu}
              className="2xl:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile Side Menu — CSS transitions kept as-is */}
      <div
        className={`fixed inset-0 z-50 2xl:hidden transition-transform duration-300 ease-in-out ${
          isMobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="absolute inset-0 bg-black/50" onClick={closeMobileMenu} />

        <div className="absolute right-0 top-0 h-full w-80 max-w-[85vw] bg-background shadow-xl overflow-y-auto">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-2">
              <Image width={32} height={32} alt="logo-icon" src="/logo-icon.svg" />
              <Image width={80} height={24} alt="logo-name" src="/logo-name.svg" />
            </div>
            <button
              onClick={closeMobileMenu}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 border-b">
            <NavbarSearch className="w-full" onNavigate={closeMobileMenu} />
          </div>

          <nav className="flex flex-col p-4 space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMobileMenu}
                className="uppercase text-muted-foreground text-sm tracking-wider py-3 px-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="p-4 border-t mt-auto">
            {isLoading ? (
              <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse mx-auto" />
            ) : isAuthenticated && session?.user ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-4">
                  {session.user.image ? (
                    <Image
                      src={session.user.image}
                      alt="User Avatar"
                      width={40}
                      height={40}
                      className="rounded-full w-10 h-10 shrink-0 object-cover"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white">
                      <User size={20} />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium">{session.user.name || "User"}</p>
                    <p className="text-xs text-muted-foreground truncate">{session.user.email || ""}</p>
                  </div>
                </div>
                <button
                  onClick={() => { handleSignOut(); closeMobileMenu(); }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-destructive hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Link href="/login" onClick={closeMobileMenu}>
                  <Button variant="ghost" size="sm" className="w-full text-sm">Sign In</Button>
                </Link>
                <Link href="/signup" onClick={closeMobileMenu}>
                  <Button size="sm" className="w-full text-sm">Sign Up</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Navbar;
