import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoDigitalPublisher",
  description: "Digital product publishing control center"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
