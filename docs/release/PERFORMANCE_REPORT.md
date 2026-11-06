# Performance report

Status: **NOT_VERIFIED** against production/staging SLOs. Unit/integration/browser
test duration is not a latency benchmark. No fabricated p95, throughput or uptime.

New bounded operations: CSV512KiB/5000 records; 10 open previews per actor/tenant;
preview TTL24h with minute worker purge; generation60days per transaction;
calendar range93days; list pages at most100 rows; new UI requests20 rows per page.
Enrollment capacity uses a sweep over effective-date events, retaining future
withdrawals in seat occupancy. Tenant write locks intentionally serialize seat,
schedule and import commits; contention must be measured.

Known review items: schedule eligibility loads all sessions within the bounded
range before pagination; class/session formatting and scope can issue per-row
lookups; dashboard count/page limits and high-volume reports need measurement.
Neither database size nor active tenant count is established from synthetic data.

Rehearsal protocol: create isolated staging-like tenants with agreed anonymized
volume, warm up, then run separate authenticated attendance/read/report mixes.
Measure requests/sec, p50/p95/p99, errors, DB lock waits/query count, CPU/RAM,
outbox age and worker drain. Include20 concurrent attendance writes, last-seat
enrollment, overlapping schedule commits and payment retries. Verify resulting
rows/ledger invariants after load. Record hardware, versions, dataset, commit,
script and raw machine output; compare with the master-spec SLOs. Real staging
capacity, approved load window and operations owner are still needed.
