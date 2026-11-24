# Planning

The calendar uses civil dates in `Europe/Paris`, with French display formatting. A cycle begins at dinner on the verified Quitoque `deliveryDate` and ends at lunch seven days later: one first dinner, twelve middle-day meals, and one final lunch (14 slots total). Delivery weekday and commercial period dates never substitute for the delivery date.

The `delivery_cycle`, `delivery_selection`, and `planned_meal` tables retain delivery snapshots and shared household assignments. House recipes reference the existing recipe table; restaurant meals are slot entries, not recipes. Empty slots are derived from the absence of a planned meal. Existing imported recipe rows and favorites are not deleted; new Quitoque syncs do not add catalog products to the recipe library.

The weekly cycle view preserves order-item position and explicit quantity occurrences, then distributes them chronologically. It leaves all manually assigned and overlapping-cycle slots untouched. Re-running distribution asks before replacing existing automatic placements. Selections beyond available slots are reported as unassigned. No nutrition optimization occurs.

`GET /api/planning?from=...&to=...` accepts a bounded period of at most 63 days. The private `/api/planning` routes support delivery and recipe sync, slot assignment/removal/move, cycle detail, and distribution. Every route requires a session; writes reject a present Origin outside the configured allowlist. Quitoque credentials never leave server memory.

The `/planning` route supports `view=week|month|day`, a civil `date`, and a `cycle` ID in the query string. Month navigation follows calendar months; day navigation is continuous and independent of delivery-cycle boundaries.
