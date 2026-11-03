import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Template Library" })).toBeVisible();
});

test("template editor creates a custom template and persists it after reload", async ({ page }) => {
  await page.getByRole("button", { name: "New template" }).click();
  const dialog = page.getByRole("dialog", { name: "Create custom template" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Template name")).toBeFocused();
  await dialog.getByLabel("Template name").fill("E2E Product Template");
  await dialog.getByLabel("Description").fill("Created by the PIECS browser acceptance test.");
  await dialog.getByRole("button", { name: "Save template" }).click();
  await expect(page.getByText("E2E Product Template")).toBeVisible();
  await page.reload();
  await expect(page.getByText("E2E Product Template")).toBeVisible();
});

test("command tabs support arrow-key navigation and expose the selected panel", async ({ page }) => {
  await page.getByRole("button", { name: "Command Library", exact: true }).click();
  const libraryTab = page.getByRole("tab", { name: "Command Library" });
  const builderTab = page.getByRole("tab", { name: "Command Builder" });
  await expect(libraryTab).toHaveAttribute("aria-selected", "true");
  await libraryTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(builderTab).toBeFocused();
  await expect(builderTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Command Builder" })).toBeVisible();
});

test("workflow builder creates and saves a reusable workflow", async ({ page }) => {
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page.getByLabel("Workflow name").fill("E2E Workflow");
  await page.getByLabel("Description").fill("Workflow created during browser acceptance.");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByRole("button", { name: "Save workflow" }).click();
  await expect(page.getByText("E2E Workflow")).toBeVisible();
});

test("JSON Studio loads and validates the local template backup", async ({ page }) => {
  await page.getByRole("button", { name: "JSON Studio", exact: true }).click();
  await page.getByRole("button", { name: "Load library JSON" }).click();
  await expect(page.getByLabel("PIECS JSON document")).not.toHaveValue("");
  await page.getByRole("button", { name: "Validate JSON" }).click();
  await expect(page.getByRole("status")).toContainText("JSON hợp lệ");
});
