# Etsy Live Read — Owner Legal Review Gate

Status: **PENDING OWNER REVIEW**. The two drafts in this directory are not live website pages and are not evidence of Etsy or seller approval.

1. Confirm legal operator name, monitored support email and applicable jurisdiction.
2. Confirm the private-app audience and exact enabled read-only functions; no listings writes, transaction reads or email.
3. Confirm approved Etsy app purpose and shop `23582741` against the live Etsy developer console and shop-owner authorization.
4. Verify Vercel Production `DATABASE_URL` points to the expected Neon project, and inspect production regions, subprocessor terms, security logs and backups.
5. Document retention periods, deletion and revocation workflow, backup expiration, security incident owner and notifications.
6. Obtain owner/legal review of Terms and Privacy Policy, including any Etsy-specific notices.
7. Publish the approved versions with public, accessible HTTPS URLs only after review; test anonymous GET 200 and correct content.
8. Record the actual dated owner acceptance/authorization evidence; never fabricate an approval reference.
9. Only then consider setting shop-bound read gates and performing one authorized `listings_r` refresh and GET verification.

No OAuth tokens, keys or passwords should appear in these documents.
