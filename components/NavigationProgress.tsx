"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * A thin, animated progress bar displayed at the very top of the viewport
 * during client-side navigation. Inspired by banking/productivity apps.
 *
 * Detection strategy (React 19 / Next.js 16 safe):
 * - Watches `usePathname()` for route changes
 * - Intercepts anchor clicks to detect navigation *start*
 * - Does NOT patch history.pushState (causes useInsertionEffect errors in React 19)
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const prevPathRef = useRef(pathname);

  // Navigation completed — hide bar
  useEffect(() => {
    if (pathname !== prevPathRef.current) {
      setIsNavigating(false);
      prevPathRef.current = pathname;
    }
  }, [pathname]);

  // Intercept link clicks to detect navigation *start*
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;
      // Internal navigation — show progress bar
      const newPath = href.split("?")[0];
      if (newPath !== pathname) {
        setIsNavigating(true);
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname]);

  if (!isNavigating) return null;

  return <div className="nav-progress-bar" />;
}
