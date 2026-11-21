# AutoDigitalPublisher — Privacy Policy (DRAFT — NOT APPROVED)

**Status:** Draft for owner review. Not effective or published.  
**Controller/operator:** [OWNER LEGAL NAME AND CONTACT TO CONFIRM]  
**Effective date:** [AFTER APPROVAL]

## 1. Purpose and audience
AutoDigitalPublisher is a private dashboard for the PoonthaiDigital Etsy shop owner and authorized colleagues. This notice describes the intended minimum data processing for read-only Etsy listing status. It must be verified against deployed code, hosting, logs, backups and external services before publication.

## 2. Information intended to be processed
For the current read-only integration, the service may process the Etsy shop ID, authorized Etsy user ID, listing IDs, listing states, listing counts, OAuth scope, token expiry and operational status. Access and refresh tokens are intended to be encrypted at rest and used server-side only. The service may also process operator authentication and technical request logs necessary for security and operations. **Do not claim that no personal data is collected until logging and hosting have been audited.**

## 3. Information not authorized for the current integration
The current `listings_r` integration is not intended to request Etsy orders, payment information, buyer addresses, buyer messages, sales transactions or marketing profiles. Etsy data is not authorized for AI training, ad targeting or resale. If future features change these purposes, review permissions and this notice before enabling them.

## 4. How data is used
Data is used to authenticate authorized access, check Etsy connection status, retrieve shop listing information, display current listing counts, investigate errors and maintain system security. No automated Etsy listing writes are enabled in the current integration.

## 5. Service providers and cross-border processing
The application is hosted using Vercel and uses a Neon-hosted database in the inspected implementation. The actual production database binding, regions, service-provider terms and subprocessors **must be verified** before this notice is finalized. Etsy acts as an independent source of Etsy account and listing data under its own policies.

## 6. Retention, deletion and backups
**Owner decision required:** document exact retention periods for OAuth tokens, shop metadata, access logs and backups; define revocation, account disconnect, deletion requests, backup expiration and evidence of completed deletion. Until those details are confirmed, no specific retention period is asserted.

## 7. Security
The implementation is designed to restrict operator access, encrypt stored OAuth credentials and block marketplace writes. These are implementation controls, not a guarantee against unauthorized access. Production key custody, monitoring, backup access and incident response still require verification.

## 8. Your choices and requests
Authorized users may request information about access, correction, restriction or deletion through the verified support contact, subject to applicable law and legitimate retention requirements. Etsy account owners can manage app authorization through Etsy. Revoking Etsy authorization may prevent further API access but does not automatically confirm deletion of all local records or backups.

## 9. Security incidents and updates
The operator must maintain an incident-response contact and process, including any applicable Etsy notification deadlines. Material changes to purposes, data categories or providers require review and an updated notice before rollout.

## 10. Contact and legal basis
**Controller name:** [OWNER TO CONFIRM]  
**Privacy/support email:** [OWNER TO CONFIRM]  
**Jurisdiction and lawful basis:** [OWNER / LEGAL ADVISER TO CONFIRM]  
**Applicable rights and transfer disclosures:** [TO CONFIRM AFTER PRODUCTION REVIEW]

**Approval checklist:** operator identity, contact, actual production data flows and regions, lawful basis, retention and deletion policy, backup policy, incident owner, Etsy purpose authorization, owner sign-off.
