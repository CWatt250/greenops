-- Split job notes into crew-internal vs customer-visible. Today the
-- portal job-history card renders `jobs.notes` — but those are
-- crew-internal scratch ("watch for sprinkler heads", "dog gets out, close
-- gate twice"). Adding a parallel `customer_notes` column lets the admin
-- explicitly opt-in to surface a friendly note to the customer.

alter table jobs add column if not exists customer_notes text;
