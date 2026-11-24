import type { Metadata } from "next";
import LoginClient from "./login-client";
import "./login.css";

export const metadata: Metadata = {
  title: "Sign in | Mosselora Product Factory",
  description: "Private product research, QA and release workspace."
};
export const dynamic = "force-dynamic";

function safeNext(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") ||
      value.includes("\\") || /[\r\n]/.test(value) || value.startsWith("/login")) return "/factory";
  return value;
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  return <LoginClient next={safeNext(params.next)} />;
}
