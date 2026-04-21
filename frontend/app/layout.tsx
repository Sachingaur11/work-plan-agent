import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import NavigationProgress from "@/components/NavigationProgress";
import PageWrapper from "@/components/PageWrapper";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Presale Agent Dashboard",
  description: "AI-powered presales pipeline management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-background`}>
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <PageWrapper>
          {children}
        </PageWrapper>
      </body>
    </html>
  );
}
