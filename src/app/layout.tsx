import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MainContent from "@/components/MainContent";
import DataChat from "@/components/DataChat";
import CommandPalette from "@/components/CommandPalette";
import ConvexClientProvider from "@/components/ConvexClientProvider";

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
        <ConvexClientProvider>
          <Sidebar />
          <MainContent>{children}</MainContent>
          <DataChat />
          <CommandPalette />
        </ConvexClientProvider>
      </body>
    </html>
  );
}
