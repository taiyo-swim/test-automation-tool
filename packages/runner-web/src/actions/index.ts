import type { Page } from "@playwright/test";
import type { TestStep } from "@e2e-tool/types";

export interface StepExecutionResult {
  screenshot?: Buffer;
  log?: string;
  extractedVar?: { name: string; value: string };
}

export async function executeStep(
  page: Page,
  step: TestStep,
  variables: Record<string, string>
): Promise<StepExecutionResult> {
  const p = step.params as Record<string, unknown>;

  switch (step.action) {
    case "navigate": {
      await page.goto(String(p.url), { waitUntil: "domcontentloaded", timeout: 30_000 });
      return { log: `navigated to ${p.url}` };
    }

    case "go_back": {
      await page.goBack();
      return { log: "went back" };
    }

    case "go_forward": {
      await page.goForward();
      return { log: "went forward" };
    }

    case "reload": {
      await page.reload();
      return { log: "reloaded" };
    }

    case "click": {
      const waitFor = p.wait_for as string | undefined;
      if (waitFor === "navigation") {
        await Promise.all([page.waitForNavigation(), page.click(String(p.selector))]);
      } else {
        await page.click(String(p.selector));
      }
      return { log: `clicked ${p.selector}` };
    }

    case "double_click": {
      await page.dblclick(String(p.selector));
      return { log: `double-clicked ${p.selector}` };
    }

    case "right_click": {
      await page.click(String(p.selector), { button: "right" });
      return { log: `right-clicked ${p.selector}` };
    }

    case "input": {
      await page.fill(String(p.selector), String(p.value));
      const displayValue = p.secret ? "****" : p.value;
      return { log: `input "${displayValue}" into ${p.selector}` };
    }

    case "clear": {
      await page.fill(String(p.selector), "");
      return { log: `cleared ${p.selector}` };
    }

    case "select": {
      await page.selectOption(String(p.selector), String(p.value));
      return { log: `selected "${p.value}" in ${p.selector}` };
    }

    case "check": {
      await page.check(String(p.selector));
      return { log: `checked ${p.selector}` };
    }

    case "uncheck": {
      await page.uncheck(String(p.selector));
      return { log: `unchecked ${p.selector}` };
    }

    case "scroll": {
      await page.evaluate(({ x, y }: { x?: number; y?: number }) => window.scrollBy(x ?? 0, y ?? 0), {
        x: p.x as number | undefined,
        y: p.y as number | undefined,
      });
      return { log: `scrolled` };
    }

    case "scroll_to_element": {
      await page.locator(String(p.selector)).scrollIntoViewIfNeeded();
      return { log: `scrolled to ${p.selector}` };
    }

    case "assert_text": {
      const mode = (p.mode as string) ?? "contains";
      const locator = page.locator(String(p.selector));
      const text = await locator.textContent();
      const expected = String(p.expected);

      if (mode === "exact" && text?.trim() !== expected) {
        throw new Error(`Expected text "${expected}" but got "${text?.trim()}"`);
      }
      if (mode === "contains" && !text?.includes(expected)) {
        throw new Error(`Expected text to contain "${expected}" but got "${text?.trim()}"`);
      }
      if (mode === "regex" && !new RegExp(expected).test(text ?? "")) {
        throw new Error(`Expected text to match regex "${expected}" but got "${text?.trim()}"`);
      }
      return { log: `assert_text passed: "${expected}"` };
    }

    case "assert_visible": {
      await page.locator(String(p.selector)).waitFor({ state: "visible", timeout: 10_000 });
      return { log: `${p.selector} is visible` };
    }

    case "assert_hidden": {
      await page.locator(String(p.selector)).waitFor({ state: "hidden", timeout: 10_000 });
      return { log: `${p.selector} is hidden` };
    }

    case "assert_url": {
      const currentUrl = page.url();
      const expected = String(p.expected);
      const mode = (p.mode as string) ?? "contains";
      if (mode === "exact" && currentUrl !== expected) {
        throw new Error(`Expected URL "${expected}" but got "${currentUrl}"`);
      }
      if (mode === "contains" && !currentUrl.includes(expected)) {
        throw new Error(`Expected URL to contain "${expected}" but got "${currentUrl}"`);
      }
      return { log: `assert_url passed` };
    }

    case "assert_attribute": {
      const attr = await page.locator(String(p.selector)).getAttribute(String(p.attribute));
      if (attr !== String(p.expected)) {
        throw new Error(`Expected attribute ${p.attribute}="${p.expected}" but got "${attr}"`);
      }
      return { log: `assert_attribute ${p.attribute}="${p.expected}" passed` };
    }

    case "assert_count": {
      const count = await page.locator(String(p.selector)).count();
      if (count !== Number(p.expected)) {
        throw new Error(`Expected ${p.expected} elements but found ${count}`);
      }
      return { log: `assert_count ${p.expected} passed` };
    }

    case "wait": {
      await page.waitForTimeout(Number(p.ms));
      return { log: `waited ${p.ms}ms` };
    }

    case "wait_for_element": {
      const state = (p.state as "visible" | "hidden" | "attached") ?? "visible";
      await page.locator(String(p.selector)).waitFor({ state, timeout: 30_000 });
      return { log: `waited for ${p.selector} to be ${state}` };
    }

    case "wait_for_network": {
      await page.waitForLoadState("networkidle");
      return { log: "waited for network idle" };
    }

    case "screenshot": {
      const screenshot = await page.screenshot({ fullPage: true });
      return { screenshot, log: `screenshot taken: ${p.name ?? "unnamed"}` };
    }

    case "set_variable": {
      variables[String(p.name)] = String(p.value);
      return { log: `set variable ${p.name}="${p.value}"`, extractedVar: { name: String(p.name), value: String(p.value) } };
    }

    case "extract_text": {
      const text = await page.locator(String(p.selector)).textContent();
      const value = text?.trim() ?? "";
      variables[String(p.variable)] = value;
      return { log: `extracted text "${value}" into ${p.variable}`, extractedVar: { name: String(p.variable), value } };
    }

    case "extract_attribute": {
      const attr = await page.locator(String(p.selector)).getAttribute(String(p.attribute));
      const value = attr ?? "";
      variables[String(p.variable)] = value;
      return { log: `extracted attribute ${p.attribute}="${value}" into ${p.variable}`, extractedVar: { name: String(p.variable), value } };
    }

    case "api_request": {
      const { default: axios } = await import("axios");
      const response = await axios.request({
        method: String(p.method) as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
        url: String(p.url),
        headers: p.headers as Record<string, string> | undefined,
        data: p.body,
      });
      if (p.variable) {
        const value = JSON.stringify(response.data);
        variables[String(p.variable)] = value;
        return { log: `API ${p.method} ${p.url} → ${response.status}`, extractedVar: { name: String(p.variable), value } };
      }
      return { log: `API ${p.method} ${p.url} → ${response.status}` };
    }

    default:
      throw new Error(`Unknown action: ${step.action}`);
  }
}
