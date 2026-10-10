import type { Metadata } from "next";
import { Cormorant_Garamond, Source_Sans_3 } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getViewer } from "@/lib/account";
import "./globals.css";

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant-garamond",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const sourceSans3 = Source_Sans_3({
  variable: "--font-source-sans-3",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  /**
   * Without this, the share card in `opengraph-image.tsx` is advertised at a
   * relative path. Browsers cope; the scrapers behind WhatsApp, iMessage and
   * Slack do not, and quietly show no picture at all.
   */
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://mastarbiyainstitute.org",
  ),
  title: {
    default: "MAS Tarbiya Institute — Islamic Learning & Course Registration",
    template: "%s · MAS Tarbiya Institute",
  },
  description:
    "Islamic studies courses at MAS Tarbiya Institute. Online registration, secure payment and a student portal.",
  openGraph: {
    title: "MAS Tarbiya Institute — Islamic Learning",
    description:
      "Qur'anic sciences, fiqh and character formation, with online registration and a student portal.",
    type: "website",
  },
  /**
   * Say the card is a big one. Left unset, X falls back to the small square
   * thumbnail and crops a 1200x630 image to a postage stamp.
   */
  twitter: { card: "summary_large_image" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();

  return (
    <html
      lang="en"
      className={`${cormorantGaramond.variable} ${sourceSans3.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader
          signedIn={viewer !== null}
          isAdmin={viewer?.isAdmin ?? false}
          isTeacher={viewer?.teacherId !== null && viewer?.teacherId !== undefined}
        />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
