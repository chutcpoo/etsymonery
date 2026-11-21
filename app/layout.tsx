import type { Metadata } from "next";
import "./globals.css";

const googleSiteVerification =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() || undefined;
export const metadata: Metadata = {
  title: "PoonthaiDigital Publisher",
  description: "PoonthaiDigital publishing control center",
  verification: googleSiteVerification
    ? { google: googleSiteVerification }
    : undefined
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
