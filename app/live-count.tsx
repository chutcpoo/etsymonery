"use client";
import { useEffect, useState } from "react";

export const displayWindowMs = 60_000;

// The original observation remains dated. Hide it on expiry and on tab restore;
// refreshing the page obtains a new observation without background polling.
export function LiveCount({ count, observedAt }: { count: number | null; observedAt: string | null }) {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const observed = observedAt ? Date.parse(observedAt) : NaN;
    const expires = observed + displayWindowMs;
    function update() {
      const now = Date.now();
      setFresh(document.visibilityState === "visible" && observed <= now && now < expires);
    }
    update();
    const timer = setTimeout(update, Math.min(displayWindowMs, Math.max(0, expires - Date.now())));
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
    };
  }, [observedAt]);
  return <p>{fresh && count !== null ? count : "Unknown"}</p>;
}
