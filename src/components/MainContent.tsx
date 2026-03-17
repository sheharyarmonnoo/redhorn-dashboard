"use client";
import { useState, useEffect } from "react";
import PropertyGuard from "@/components/PropertyGuard";

export default function MainContent({ children }: { children: React.ReactNode }) {
  const [marginLeft, setMarginLeft] = useState(240);

  useEffect(() => {
    const saved = localStorage.getItem("redhorn_sidebar_collapsed");
    if (saved === "true") setMarginLeft(52);

    function updateMargin(collapsed: boolean) {
      if (window.innerWidth < 1024) {
        setMarginLeft(0);
      } else {
        setMarginLeft(collapsed ? 52 : 240);
      }
    }

    function handleToggle(e: Event) {
      const detail = (e as CustomEvent).detail;
      updateMargin(detail.collapsed);
    }

    function handleResize() {
      const saved = localStorage.getItem("redhorn_sidebar_collapsed") === "true";
      updateMargin(saved);
    }

    window.addEventListener("sidebar-toggle", handleToggle);
    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("sidebar-toggle", handleToggle);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <main
      className="flex-1 pt-12 lg:pt-0 transition-all duration-200"
      style={{ marginLeft }}
    >
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <PropertyGuard>{children}</PropertyGuard>
      </div>
    </main>
  );
}
