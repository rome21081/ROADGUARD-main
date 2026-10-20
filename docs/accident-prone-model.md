# Rule-based accident-prone area analysis

ROADGUARD implements the operational rules supplied by the user. This feature is **rule-based, not AI**, and is not an accident probability predictor. The map, dashboard, proximity warnings, and route comparisons use one shared `MapSafety.buildRiskModel()` implementation in `Final Project 3rd Year/jsFiles/map-safety.js`.

## Eligibility and reliability

Before a record contributes to analysis, it must:

1. Be a road accident or vehicular-related incident. Vehicular incidents can come from the general incident feed when their classification or description establishes a road/vehicle event. Unrelated fire, medical, robbery, weather, and similar records do not qualify merely because they appear near a road.
2. Have an accident ID, incident ID, or meaningful case reference, valid coordinates, a valid event timestamp, and recognized severity. Supported aliases are low/minor, moderate/medium, high/severe, critical/fatal.
3. Have no explicit rejected, pending, unverified, duplicate, or unreliable status/flag.
4. Fall within the inclusive rolling **36-calendar-month** period ending at analysis time. Philippine time (UTC+08:00) is used for timestamps without a timezone. Future, impossible, missing, and expired dates do not contribute to scores or route-risk calculations. Month-end and leap days are clamped when subtracting months.

These are structural and explicit-status reliability checks, not independent verification that a crash really occurred. Absent verification flags do not mean independently verified. Incorrect geocoding or false reports still require upstream review. Excluded source records remain browsable; they do not silently become eligible low-risk incidents.

Duplicate removal uses source-aware IDs, meaningful case references, and apparent copies sharing the event timestamp, normalized description, and coordinates within 20 m. It never modifies source JSON. Apparent-copy detection is conservative; genuinely separate crashes with identical recorded evidence may need manual review.

## Grouping by area

The geographic radius remains 300 m. The model selects deterministic dense neighbourhoods and assigns each eligible incident to one bounded area. A centroid is accepted only if every member stays within the radius; otherwise the seed is retained. This avoids a chain of nearby incidents connecting distant intersections. Search and severity filters do not change area membership or classification.

There is **no separate-day eligibility requirement**. Distinct, eligible same-day incidents can count. Distinct-day counts are displayed as supporting context, not as a gating rule.

## Severity, frequency, and recency

Severity weights:

| Source severity | Weight |
| --- | ---: |
| Low / minor | 1 |
| Moderate / medium | 2 |
| High / severe | 4 |
| Critical / fatal | 5 |

Recency multipliers use calendar-month cutoffs:

| Incident age | Multiplier |
| --- | ---: |
| Within 6 months | 1.00 |
| Over 6 to 12 months | 0.75 |
| Over 12 to 24 months | 0.50 |
| Over 24 to 36 months | 0.25 |

**Frequency** is the number of eligible unique incidents in an area. **Severity burden** is `sum(severity weight × recency multiplier)` across those incidents. Recent and severe incidents contribute more. The existing explanatory factorization, `frequency × average severity × severity-weighted recency`, is equivalent to that sum; it is not a second score.

## Classification, in precedence order

| Level | Rule | Accident-prone tag? |
| --- | --- | --- |
| Critical | At least 5 incidents **and** severity burden at least 20 | Yes |
| High | At least 5 incidents **or** at least 3 incidents with severity burden at least 10 | Yes |
| Moderate | At least 2 incidents that do not meet high/critical rules | No |
| Caution | Exactly 1 eligible incident | No |
| No eligible evidence | No eligible incidents | No area inferred |

The user specified the count hierarchy but did not give numeric cutoffs for “enough” or “very high” severity burden. **10 and 20 are configurable prototype defaults**, not numbers taken from ALERT-CIA, REV, or an official road-safety standard. They must be calibrated against validated local data before operational reliance. Defaults live in `MapSafety.DEFAULTS` as `highSeverityBurden`, `criticalSeverityBurden`, and their associated count thresholds.

Examples: one recent fatal incident remains caution; two recent fatal incidents are moderate; three recent severe incidents have burden 12 and are high; five recent low incidents are high through frequency; five recent severe incidents have burden 20 and are critical. Five older eligible incidents still satisfy the explicit high-frequency rule even if recency reduces their severity burden.

## Public map, alerts, and routing

- All four levels retain separate text labels. High and critical accident-prone areas use red shaded boundaries, with a stronger fill for critical; caution/moderate retain their lower-level colors. No additional area point pins or permanent labels cover the individual crash markers. High/critical alone are counted as accident-prone areas. The `areas` collection includes all levels; `zones` contains the accident-prone subset.
- Minimal popups/cards show the risk level, location, eligible crash count, serious-crash count, and latest crash date. Cards act as one accessible button to locate the area. Repeated guidance, explanations, age labels, extra action buttons, and scoring jargon are omitted.
- Individual markers remain clickable, with full-detail links and overlapping-record selection.
- Proximity warnings consider all eligible risk areas. Being inside caution/moderate produces a caution warning, not a high-risk entry alarm. GPS uncertainty and exit hysteresis are respected.
- Automatic route reassessment is limited to approaching high/critical areas intersecting the selected route, with a live GPS start, a current position near that route, a 60-second interval, and a per-area guard.
- Routes sum severity/recency-weighted eligible incidents near the road, plus the burden of intersecting high/critical areas as a repeat-pattern penalty. Individual-history and accident-prone-area counts remain separate. Only alternatives returned by OSRM are compared.
- No demonstration zones, invented coordinates, fabricated probabilities, or AI predictions establish accident-prone tags.

Geographic proximity alone cannot distinguish parallel roads, bridges, or grade separation without road-segment data. Missing history is not proof that a road is safe. This prototype has not been calibrated as a statistical crash-rate or exposure-adjusted model.

## Research context

The publisher's abstract for [Differentiating high-frequency and high-severity hotspots: A robust risk-evolution-volume (REV) framework](https://www.sciencedirect.com/science/article/abs/pii/S0001457526002502) describes distinguishing crash frequency from crash severity and considering spatiotemporal persistence and exposure-related risk. It supports the conceptual comparison with multi-factor analysis. ROADGUARD does **not** implement the REV statistical framework or claim that REV validates these prototype thresholds. The full publisher text was unavailable during verification. No independently verified Project G4RS algorithm was available; the supplied description is not treated as a source of numeric thresholds.

## Validation

Run `npm.cmd test --prefix testscraper`. Tests cover every count/burden classification boundary; single/fatal incidents; low-severity frequency; same-day distinct events; severity aliases; vehicular incidents; rejected/pending/incomplete records; deduplication; exact 36-month boundaries, leap days and month-end; bounded order-independent grouping; GPS caution; route integration; and public details. Real browser/GPS field validation is still required.
