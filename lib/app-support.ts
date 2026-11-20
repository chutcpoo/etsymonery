export function appSupportEmail() {
  const email = process.env.APP_SUPPORT_EMAIL?.trim() ?? "";
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email) ? email : null;
}
