# Subscription Value

Open **Subscription Value** in the sidebar to compare recorded OAuth usage with its estimated API cost. Choose a calendar month, select an account to inspect its models and cumulative daily trend, or use **Show all subscriptions** for the combined view. Expand a model name to inspect its input, output, and cache tokens.

Use **Subscription fees** to enter each account's monthly cost in USD. Fees are optional and never inferred from the plan name. Blank means unknown; zero means an explicitly free plan. A saved change applies from the selected month until the next saved change for that account. It does not change earlier months. Clear a fee from the month a subscription ends. Historical accounts with entered fees remain visible even without requests.

The portfolio value ratio compares API-equivalent usage and fees for the same set of accounts: those with entered fees. It is not a statement of cash savings. The current month is month-to-date usage compared with the full monthly fee; this version does not prorate fees or model individual billing-cycle dates.

## Estimates and coverage

- Only traffic retained in the local usage database is included. Requests made outside this proxy and history removed by storage cleanup cannot be reconstructed.
- Account attribution uses the recorded provider and authentication index, with a unique credential-filename fallback. It does not infer the subscription from a model's brand. Claude usage routed through Antigravity belongs to the Antigravity account. API-key traffic and requests without sufficient OAuth attribution are excluded and counted separately.
- Current credential files include idle and disabled accounts. Previously observed accounts and estimates can be viewed while the core is offline. Deleting or replacing a credential with a different identity does not automatically transfer its fees to a new identity.
- Costs reuse the app's current model catalog and pricing overrides, including cache, long-context, and service-tier adjustments. Changing prices recalculates historical estimates. These are not immutable invoices or billed amounts.
- Requests missing a required price are excluded from dollar estimates. Explicit zero rates are valid. Coverage and partial-pricing labels disclose missing data; use **Usage → Pricing** to review or supply rates.
- The page refreshes every 30 seconds while visible and not editing fees. Refresh reads existing history; usage collection still depends on the normal proxy collector.

## Maintenance

The custom backend is `src-tauri/src/usage/subscription_value.rs`, a child of the upstream usage module so it can reuse pricing functions without widening their public API. It creates `subscription_value_accounts` and `subscription_value_fees` tables in the existing local usage database. It does not modify OAuth files, routing, the proxy core, or existing usage-event rows.

The frontend is isolated in `SubscriptionValuePage.tsx`/`.css` and `services/subscriptionValue.ts`. Keep SQL aggregation, account attribution, pricing completeness, effective-dated fees, and locale keys when merging upstream changes. Tests: `tests/subscriptionValue.test.ts`, `tests/subscription-value-ui.cjs`, and the Rust `usage::subscription_value` tests.
