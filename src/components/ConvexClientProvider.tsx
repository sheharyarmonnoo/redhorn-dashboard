"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { ReactNode, useState, useEffect } from "react";

// Backend DB URL — neutral env name that doesn't bake the vendor into the
// variable. Set in .env.local / Vercel.
const dbUrl = process.env.NEXT_PUBLIC_DB_URL!;
const convex = new ConvexReactClient(dbUrl);

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
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
