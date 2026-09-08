import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const googleSiteVerification =
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim() || undefined;
const ga4MeasurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim() || "";
const clarityProjectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID?.trim() || "";
const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || "";
const analyticsPublicPathPrefixes = (
  process.env.NEXT_PUBLIC_ANALYTICS_PUBLIC_PATH_PREFIXES ?? "/products,/p"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export const metadata: Metadata = {
  title: "AutoDigitalPublisher",
  description: "Digital product publishing control center",
  verification: googleSiteVerification
    ? { google: googleSiteVerification }
    : undefined
};

function analyticsBootstrap() {
  const config = JSON.stringify({
    ga4MeasurementId,
    clarityProjectId,
    metaPixelId,
    publicPathPrefixes: analyticsPublicPathPrefixes
  });

  return `(function () {
    var config = ${config};
    var path = window.location.pathname;
    var isPublicCommercePath = config.publicPathPrefixes.some(function (prefix) {
      if (!prefix) return false;
      var normalized = prefix.endsWith("/") && prefix.length > 1
        ? prefix.slice(0, -1)
        : prefix;
      return path === normalized || path.startsWith(normalized + "/");
    });

    if (!isPublicCommercePath) return;

    function loadScript(src) {
      var script = document.createElement("script");
      script.async = true;
      script.src = src;
      document.head.appendChild(script);
    }

    if (config.ga4MeasurementId) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag("js", new Date());
      window.gtag("config", config.ga4MeasurementId, { send_page_view: true });
      loadScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(config.ga4MeasurementId));
    }

    if (config.clarityProjectId) {
      window.clarity = window.clarity || function () {
        (window.clarity.q = window.clarity.q || []).push(arguments);
      };
      loadScript("https://www.clarity.ms/tag/" + encodeURIComponent(config.clarityProjectId));
    }

    if (config.metaPixelId) {
      if (!window.fbq) {
        var fbq = function () {
          fbq.callMethod
            ? fbq.callMethod.apply(fbq, arguments)
            : fbq.queue.push(arguments);
        };
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = "2.0";
        fbq.queue = [];
        window.fbq = fbq;
        window._fbq = fbq;
        loadScript("https://connect.facebook.net/en_US/fbevents.js");
      }
      window.fbq("init", config.metaPixelId);
      window.fbq("track", "PageView");
    }

    function cleanPayload(payload) {
      var result = {};
      Object.keys(payload || {}).forEach(function (key) {
        var value = payload[key];
        if (value !== undefined && value !== null && value !== "") result[key] = value;
      });
      return result;
    }

    window.autodigitalpublisherTrack = function (eventName, payload) {
      var clean = cleanPayload(payload || {});

      if (window.gtag) window.gtag("event", eventName, clean);

      if (window.clarity) {
        if (clean.product_id) window.clarity("set", "product_id", String(clean.product_id));
        if (clean.listing_id) window.clarity("set", "listing_id", String(clean.listing_id));
        window.clarity("event", eventName);
      }

      if (window.fbq) {
        if (eventName === "view_product") {
          window.fbq("track", "ViewContent", {
            content_ids: clean.product_id ? [String(clean.product_id)] : undefined,
            content_type: "product",
            listing_id: clean.listing_id
          });
        } else if (eventName === "click_to_etsy") {
          window.fbq("trackCustom", "ClickToEtsy", clean);
        }
      }
    };

    function bindCommerceEvents() {
      var product = document.querySelector("[data-analytics-product-id]");
      if (product && window.autodigitalpublisherTrack) {
        window.autodigitalpublisherTrack("view_product", {
          product_id: product.getAttribute("data-analytics-product-id"),
          listing_id: product.getAttribute("data-analytics-listing-id") || undefined,
          page_path: window.location.pathname
        });
      }

      document.addEventListener("click", function (event) {
        var target = event.target;
        if (!target || !target.closest) return;
        var anchor = target.closest("a[href]");
        if (!anchor) return;

        var url;
        try {
          url = new URL(anchor.href, window.location.href);
        } catch (_) {
          return;
        }

        if (!(url.hostname === "etsy.com" || url.hostname.endsWith(".etsy.com"))) return;

        var container = anchor.closest("[data-analytics-product-id]");
        var listingMatch = url.pathname.match(/\\/listing\\/(\\d+)/);
        if (window.autodigitalpublisherTrack) {
          window.autodigitalpublisherTrack("click_to_etsy", {
            product_id: container ? container.getAttribute("data-analytics-product-id") : undefined,
            listing_id: container && container.getAttribute("data-analytics-listing-id")
              ? container.getAttribute("data-analytics-listing-id")
              : listingMatch
                ? listingMatch[1]
                : undefined,
            destination: url.origin + url.pathname,
            page_path: window.location.pathname
          });
        }
      }, { capture: true });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindCommerceEvents, { once: true });
    } else {
      bindCommerceEvents();
    }
  })();`;
}

const analyticsConfigured = Boolean(
  ga4MeasurementId || clarityProjectId || metaPixelId
);

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
      {analyticsConfigured ? (
        <Script id="commerce-analytics-bootstrap" strategy="afterInteractive">
          {analyticsBootstrap()}
        </Script>
      ) : null}
    </html>
  );
}
