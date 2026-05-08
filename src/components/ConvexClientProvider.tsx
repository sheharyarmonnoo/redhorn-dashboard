"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { ReactNode, useState, useEffect, useCallback } from "react";

// Backend DB URL — prefer the neutral name; fall back to the legacy
// vendor-named var so an out-of-order env rename on the host doesn't
// crash the client at boot.
const dbUrl = process.env.NEXT_PUBLIC_DB_URL || process.env.NEXT_PUBLIC_CONVEX_URL!;
const convex = new ConvexReactClient(dbUrl);

// Override Clerk's JWT template name. ConvexProviderWithClerk hardcodes
// `template: "convex"` when calling getToken, but we renamed the template
// in Clerk to "sync" so the vendor name doesn't surface in network logs.
// We wrap useAuth's getToken to ignore whatever template the caller asked
// for and always request the "sync" template instead.
const JWT_TEMPLATE = "sync";

function useAuthForConvex() {
  const auth = useAuth();
  // Hard-swallow getToken errors. Unauthenticated users (e.g. landed on
  // /unauthorized after a Clerk role check) still trigger getToken probes
  // from the Convex provider; without a catch, every probe surfaces a
  // red error in the browser console even though "no session" is the
  // expected state on those pages.
  const getTokenOverride = useCallback(
    async (opts?: { skipCache?: boolean }) => {
      try {
        return await auth.getToken({ template: JWT_TEMPLATE, skipCache: opts?.skipCache });
      } catch {
        return null;
      }
    },
    [auth],
  );
  return {
    ...auth,
    getToken: getTokenOverride,
  };
}

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <ClerkProvider
      appearance={{
        baseTheme: isDark ? dark : undefined,
        variables: isDark
          ? {
              colorBackground: "#18181b",
              colorInputBackground: "rgba(255,255,255,0.04)",
              colorText: "#fafafa",
              colorTextSecondary: "#a1a1aa",
              colorInputText: "#fafafa",
              colorNeutral: "#fafafa",
              colorPrimary: "#fafafa",
              borderRadius: "6px",
            }
          : undefined,
        elements: isDark
          ? {
              userButtonPopoverCard: "!bg-[#18181b] !border-[#3f3f46]",
              userButtonPopoverMain: "!text-white",
              userButtonPopoverActionButton: "!text-white hover:!bg-white/[0.04]",
              userButtonPopoverActionButtonText: "!text-white",
              userButtonPopoverActionButtonIcon: "!text-white/70",
              userButtonPopoverFooter: "!hidden",
              userPreview: "!text-white",
              userPreviewMainIdentifier: "!text-white",
              userPreviewSecondaryIdentifier: "!text-white/60",
            }
          : undefined,
      }}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuthForConvex}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
