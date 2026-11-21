import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Publisher Demo | PoonthaiDigital",
  description: "Interactive sample-data preview. No real account or Etsy access.",
  robots: { index: false, follow: false }
};

export default function DemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
