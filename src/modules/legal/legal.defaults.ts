import { LegalType } from './entities/legal-document.entity';

/**
 * Starter texts, seeded as version 1.0 when the table is empty. They describe what GoCity
 * really collects and does, but they are templates: fill in the [placeholders] and have them
 * reviewed by a lawyer before going live. Publish a new version via POST /legal/:type.
 */
const TEMPLATE_NOTE =
  '> **Template:** this document is a starting point written for GoCity. Replace every ' +
  '[placeholder] and have it reviewed by a qualified lawyer for the countries where you operate ' +
  'before relying on it.';

const PRIVACY = `${TEMPLATE_NOTE}

GoCity ("we", "us") is operated by [Company name], [Company address]. This policy explains what personal data we collect when you use the GoCity website and apps, why, and the choices you have. Questions: [Contact email].

## 1. Data we collect

**Account data.** Your first and last name, email address and password (stored only as a one-way hash). Optionally: phone number, an "about me" text, your interests, a profile photo, and an organization name for organization accounts.

**Verification and security data.** One-time codes we email you to verify your address or reset your password (they expire after a few minutes), and sign-in sessions: refresh tokens together with basic device and browser information and the IP address used, so you can see and end your sessions.

**Trip content.** Everything you add to a trip: its name, dates, number of travellers, budget, destination city, hotel, activities and plans (times, places, coordinates, meeting points, transport), expenses and who paid, ideas and votes, tips, the trip story, and photos or videos you upload. Trip members can see this content.

**People you invite.** When you invite someone by email we store that address with the invitation and send them an email, even if they do not have an account yet.

**Favorites and activity.** Trips, activities, hotels and places you save, and in-app notifications about your trips.

**Push notifications.** If you allow notifications, a device token from Firebase Cloud Messaging (Google) so we can send them.

**Place searches.** City and hotel searches are sent to the Google Places API to return results. We cache results for a short time.

We do not sell your personal data and we do not use advertising trackers.

## 2. Why we use it

- To create and secure your account, verify your email and let you reset your password.
- To provide the service: planning trips, inviting people, sharing and copying trips, expenses and favorites.
- To send service emails (verification codes, invitations, password resets) and notifications you enabled.
- To keep GoCity safe: preventing abuse, investigating misuse and enforcing our Terms of Use.
- To comply with legal obligations.

Where the GDPR or similar laws apply, we rely on: performing our contract with you (providing the service), our legitimate interests (security, abuse prevention, improving the service), your consent (push notifications; you can withdraw it at any time), and legal obligations. [Adjust to your jurisdictions.]

## 3. What other people can see

Trips are **private** by default: only members can see them. If you share a trip **by link**, anyone with the link can see it; if you make it **public**, anyone can find it. A shared trip shows its name, dates, destination, hotel, itinerary, story, tips, photos and videos, budget figures, and your name and profile photo as its owner. Other users can copy a shared trip or one of its activities into their own trips. Member lists, email addresses and invitation codes are never shown on shared trips. User search shows names and a masked email address.

## 4. Who we share data with

We use service providers that process data for us under contract:

- **Hosting and storage:** [Hosting provider, region].
- **Email delivery:** [Email/SMTP provider].
- **Google Places API** (Google LLC) for city and hotel search, details and photos.
- **Firebase Cloud Messaging** (Google LLC) for push notifications.

We may also disclose data when required by law, to protect rights and safety, or as part of a merger or acquisition (with notice to you).

## 5. Storage in your browser

We do not use advertising cookies. The web app keeps your sign-in tokens and basic profile in your browser's local storage so you stay signed in; signing out removes them. If you enable push notifications, Firebase stores a registration in your browser.

## 6. How long we keep data

We keep your account data while your account is open. Trip content stays as long as the trip exists; deleting a trip deletes its activities, ideas, expenses and media. Verification codes expire within minutes. Refresh tokens expire after [N] days or when you sign out. When you delete your account we delete or anonymize your personal data within [30] days, except where we must keep it for legal reasons. Copies that other users made of your shared trips belong to them.

## 7. Your rights

Depending on where you live, you may have the right to access, correct, delete or export your data, to object to or restrict some processing, and to withdraw consent. You can edit most data in your profile and trips. For anything else, email [Contact email]; we will answer within [30] days. You may also complain to your local data protection authority.

## 8. Security

Passwords are hashed, connections are encrypted [in production, over HTTPS], and access to trips is checked on every request. No system is perfectly secure; if a breach affects you, we will notify you as the law requires.

## 9. International transfers

Our providers may process data outside your country, including in the United States. Where required we use appropriate safeguards such as the EU Standard Contractual Clauses. [Adjust.]

## 10. Children

GoCity is not intended for children under [16]. We do not knowingly collect their data; contact us if you believe a child has created an account.

## 11. Changes

When we change this policy we publish a new version with a new effective date. If the changes are significant we will tell you in the app and ask you to review them.

## 12. Contact

[Company name], [Company address], [Contact email]. Data protection officer (if appointed): [DPO contact].
`;

const TERMS = `${TEMPLATE_NOTE}

These Terms of Use ("Terms") govern your use of GoCity, operated by [Company name] ("we", "us"). By creating an account or using GoCity you agree to these Terms and to our [Privacy Policy](/privacy). If you do not agree, do not use GoCity.

## 1. The service

GoCity helps you plan trips: itineraries, activities, budgets and expenses, hotel and city suggestions, ideas and votes with the people you travel with, and sharing trips with others. Hotel and place information comes from third parties such as Google; **GoCity does not sell travel or make bookings**, and prices, budgets and expenses are estimates entered by users.

## 2. Your account

- You must be at least [16] years old (or the age of digital consent where you live).
- Give accurate information, verify your email, and keep your password secret. You are responsible for activity on your account.
- Organization accounts must be created by someone authorized to act for that organization.
- Tell us at [Contact email] if you think your account has been compromised.

## 3. Your content

You keep ownership of what you add to GoCity: trip details, stories, tips, photos, videos and other content ("Your Content").

- You give us a worldwide, non-exclusive, royalty-free licence to host, store, reproduce and display Your Content as needed to run GoCity for you and the people you share it with.
- When you share a trip **by link** or make it **public**, you also allow other users to view it and to **copy** the trip or its activities into their own trips, and you allow us to show it in Discover and search. Making the trip private again stops new views and copies, but copies already made remain with those users.
- You confirm that you have the rights to Your Content, including permission from people who appear in your photos or videos.

## 4. Acceptable use

Do not:

- break the law or infringe anyone's rights, including privacy, copyright and trademark;
- upload content that is hateful, harassing, sexually explicit, violent or misleading, or that shares other people's personal data without permission;
- invite or email people who have not agreed to hear from you, or use GoCity to spam;
- try to access trips, accounts or data you are not allowed to see, probe or overload our systems, or bypass security or rate limits;
- scrape GoCity or reuse data from Google Places outside the app;
- impersonate others or create accounts automatically.

We may remove content or restrict accounts that break these rules.

## 5. Trips with other people

Trip owners decide who can view and edit a trip and can remove members. Editors can change the plan, and members can see the trip's content, including expenses. Settle shared costs between yourselves: GoCity only records amounts and does not process payments.

## 6. Third-party services

GoCity uses services such as Google Maps / Places and Firebase. Your use of their content is also subject to their terms (for example, the Google Maps/Google Earth Additional Terms of Service). We are not responsible for third-party information such as hotel details, ratings, opening hours or prices.

## 7. Suspension and termination

You can stop using GoCity at any time and ask us to delete your account at [Contact email]. We may suspend or close accounts that break these Terms, create risk or legal exposure for us or others, or have been inactive for a long period, with notice where reasonable.

## 8. Disclaimers

GoCity is provided "as is" and "as available". Travel involves risks: check opening hours, safety, entry requirements, prices and bookings yourself. To the extent the law allows, we disclaim all warranties, including fitness for a particular purpose and uninterrupted availability.

## 9. Limitation of liability

To the extent the law allows, we are not liable for indirect, incidental or consequential damages, or for lost bookings, travel costs, data or profits. Our total liability for any claim is limited to the greater of the amount you paid us in the 12 months before the claim and [amount, e.g. 100 EUR]. Nothing in these Terms limits liability that cannot be limited by law.

## 10. Indemnity

You agree to compensate us for claims arising from Your Content or your breach of these Terms, to the extent permitted by law.

## 11. Changes to these Terms

We may update these Terms. We will publish the new version with its effective date and, for material changes, ask you to accept it in the app. If you do not agree, you can close your account.

## 12. Governing law

These Terms are governed by the laws of [Country/governing law]. Disputes go to the courts of [City, Country], unless your local consumer law gives you other rights.

## 13. Contact

[Company name], [Company address], [Contact email].
`;

export const LEGAL_DEFAULTS: Record<LegalType, { title: string; content: string }> = {
  [LegalType.PRIVACY_POLICY]: { title: 'Privacy Policy', content: PRIVACY },
  [LegalType.TERMS_OF_USE]: { title: 'Terms of Use', content: TERMS },
};
export const DEFAULT_LEGAL_VERSION = '1.0';
