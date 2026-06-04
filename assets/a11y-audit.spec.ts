// Portable mobile-UI/a11y audit. Copy into the app's e2e dir (or run via the app's
// Playwright config). Routes + viewports come from QA_A11Y_ROUTES / QA_A11Y_VIEWPORTS
// env (JSON) or default below. Writes one JSON file of AuditFinding[] per route to
// QA_A11Y_OUT (default reports/audit). minTapTargetPx from QA_A11Y_MIN_TAP (default 44).
import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES: string[] = JSON.parse(process.env.QA_A11Y_ROUTES ?? '["/home","/people","/groups"]');
const OUT = process.env.QA_A11Y_OUT ?? "reports/audit";
const MIN_TAP = Number(process.env.QA_A11Y_MIN_TAP ?? 44);

for (const route of ROUTES) {
  test(`a11y audit ${route}`, async ({ page }) => {
    await page.goto(route);
    const findings = await page.evaluate((minTap) => {
      const out: { route: string; kind: string; selector: string; detail: string }[] = [];
      const sel = (el: Element) => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : "");
      if (document.documentElement.scrollWidth > window.innerWidth)
        out.push({ route: location.pathname, kind: "horizontal-scroll", selector: "html", detail: `scrollWidth ${document.documentElement.scrollWidth} > ${window.innerWidth}` });
      const interactive = [...document.querySelectorAll("button,a,[role=button],[role=link],input,select,textarea")];
      for (const el of interactive) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < minTap || r.height < minTap)
          out.push({ route: location.pathname, kind: "small-tap-target", selector: sel(el), detail: `${Math.round(r.width)}×${Math.round(r.height)}px` });
        const named = el.textContent?.trim() || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title") || el.querySelector("img[alt]");
        if (!named) out.push({ route: location.pathname, kind: "no-accessible-name", selector: sel(el), detail: el.outerHTML.slice(0, 80) });
      }
      return out;
    }, MIN_TAP);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, route.replace(/\W+/g, "_") + ".json"), JSON.stringify(findings, null, 2));
    expect(Array.isArray(findings)).toBe(true);
  });
}
