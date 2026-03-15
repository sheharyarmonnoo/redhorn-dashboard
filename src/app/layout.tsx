import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

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
      <body className="flex min-h-screen bg-[#f5f6fa]">
        <Sidebar />
        <main className="flex-1 lg:ml-[260px] main-content">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
