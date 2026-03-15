import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import DataChat from "@/components/DataChat";
import CommandPalette from "@/components/CommandPalette";

export const metadata: Metadata = {
  title: "Redhorn Capital — Deal Manager AI",
  description: "Asset management dashboard powered by Deal Manager AI",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-[#f7f7f8]">
        <Sidebar />
        <main className="flex-1 ml-0 lg:ml-[240px] pt-12 lg:pt-0">
          <div className="max-w-[1400px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
            {children}
          </div>
        </main>
        <DataChat />
        <CommandPalette />
      </body>
    </html>
  );
}
