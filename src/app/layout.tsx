import type { Metadata } from "next";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Redhorn Capital — Deal Manager AI",
  description: "Asset management dashboard powered by Deal Manager AI",
};

const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('redhorn_theme');
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored === 'dark' || stored === 'light' ? stored : (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-screen bg-[#f7f7f8] dark:bg-[#09090b]">
        <ConvexClientProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
