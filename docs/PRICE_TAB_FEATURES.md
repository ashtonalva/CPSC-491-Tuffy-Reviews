# Price Tab – Sub-features

Build in this order, one at a time.

---

## 1. Price tab structure (HTML + CSS)

**Goal:** Add the layout and placeholders for the Price panel. No data or logic yet.

- Current price line (e.g. "Current price: $--")
- Three stat boxes: Lowest, Average, Highest (placeholder values like "$--")
- A container for the price history chart (empty or placeholder text)
- Savings line (e.g. "Savings: --")
- Period selector: 30 days / 90 days / 6 months (buttons or dropdown)

**Deliverable:** Switching to the Price tab shows this structure with static placeholder text.

---

## 2. Mock price data ✅

**Goal:** Generate fake price history in JS so the rest of the tab can use it.

- Function that returns an array of `{ date, price }` for a given number of days (e.g. 30, 90, 180).
- Use a base price and simple random variation (e.g. ±10–15%).
- No UI changes yet; can be used by the next steps.

**Deliverable:** A function like `getMockPriceData(days)` that returns consistent mock data.
**Done:** `getMockPriceData(days)` in `popup.js`; base price $49.99, deterministic ±~12% variation.

---

## 3. Price stats from data ✅

**Goal:** Compute and show Lowest, Average, Highest from the mock data.

- When the Price tab is shown (or when period changes), compute min, max, and average of the mock prices.
- Update the three stat boxes with these values.
- Current price = last point in the series (or use a separate “current” if you prefer).

**Deliverable:** Stats in the Price tab reflect the mock data for the selected period.
**Done:** `updatePriceStats()` and `getSelectedPricePeriod()` in `popup.js`; called when switching to Price tab.

---

## 4. Period selector behavior ✅

**Goal:** Changing the period updates the data used for the tab.

- When user picks "30 days", "90 days", or "6 months", store the selected period (variable or data attribute).
- Re-run the logic that uses mock data (stats, and later chart + savings) with the new period.
- No chart or savings logic required yet; stats updating is enough to verify.

**Deliverable:** Changing period updates the displayed Lowest / Average / Highest.
**Done:** Click listeners on `.period-btn`; set active, then call `updatePriceStats()`.

---

## 5. Price history chart

**Goal:** Draw a simple line chart of price over time.

- Use a `<canvas>` in the chart container.
- Given the array of `{ date, price }`, draw a line (and optional dot at “today”).
- Scale the y-axis from min to max price in the data; x-axis = time (can be linear spacing).
- Run when the Price tab is visible and when period changes.

**Deliverable:** Price tab shows a line chart for the selected period using mock data.

---

## 6. Savings indicator

**Goal:** Show whether the current price is a good deal.

- Define “savings” (e.g. vs average price or vs highest in period).
- Display a short message, e.g. "$X.XX (Y% below average)" or "At average price" or "Above average".
- Optionally style (e.g. green for below average, neutral/gray for at/above).

**Deliverable:** Savings line shows a clear, correct message based on current price vs chosen baseline.

---

## 7. Load on tab switch

**Goal:** Everything runs when the user opens the Price tab.

- On switching to the Price tab, run: get mock data → update stats → draw chart → update savings.
- Use the currently selected period for all of the above.
- Handle the case where the tab is already open and period is changed (already covered in 4 and 5).

**Deliverable:** Opening the Price tab shows up-to-date stats, chart, and savings with one flow.

---

## Summary order

| #   | Sub-feature              | Depends on |
| --- | ------------------------ | ---------- |
| 1   | Price tab structure      | —          |
| 2   | Mock price data          | —          |
| 3   | Price stats from data    | 1, 2       |
| 4   | Period selector behavior | 1, 2, 3    |
| 5   | Price history chart      | 1, 2, 4    |
| 6   | Savings indicator        | 1, 2, 3    |
| 7   | Load on tab switch       | 3, 4, 5, 6 |

We can start with **1. Price tab structure** next.
