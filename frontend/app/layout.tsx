import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { Toaster } from "sonner";
import NavigationProgress from "@/components/NavigationProgress";
import PageWrapper from "@/components/PageWrapper";
import QueryProvider from "@/providers/query-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Presale Dashboard",
  description: "AI-powered presales pipeline management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-background`}>
        <QueryProvider>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <PageWrapper>
            {children}
          </PageWrapper>
          <Toaster
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: "font-sans text-sm",
                success: "border-emerald-200",
                error: "border-red-200",
              },
            }}
            richColors
            closeButton
          />
        </QueryProvider>
      </body>
    </html>
  );
}
