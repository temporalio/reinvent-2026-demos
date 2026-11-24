# Readable Loan Underwriting panels

Loan Underwriting uses a bounded native layout inside its iframe instead of expanding all content and shrinking the page. The application and example applicants occupy two full-height panels. Form controls use 16px text and 48px touch targets. Examples have readable name, occupation, loan amount, and purpose text; paging keeps all seven examples available without shrinking them. Load-test controls expand in the same panel.

The heading reads: Apply for a loan. Our AI Agent, LENNY, will decide. The previous introduction paragraph is removed. Full Name is a dropdown with 12 shuffled options from 24 fictional names. Names carry no gender or ethnicity labels. The option list refreshes for a new application.

Review and assessment views keep native-size text. Long assessment content stays within its own panel. Provider availability gates are retained.

Validation: existing Island tab at a 713 x 488 application iframe showed body zoom 1, 16px form/review text, both panels within the viewport, a populated name dropdown, profile paging, expanded bulk controls, and a read-only review. The outer document remained 488px tall throughout. No applications or model calls were submitted during the UI checks.
