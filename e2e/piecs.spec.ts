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

test("workflow builder explains that a description is required before saving", async ({ page }) => {
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page.getByLabel("Workflow name").fill("Missing Description Workflow");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByRole("button", { name: "Save workflow" }).click();
  await expect(page.getByRole("alert")).toContainText("Vui lòng nhập mô tả workflow.");
  await expect(page.getByText("Missing Description Workflow", { exact: true })).toHaveCount(0);
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

test("workflow can be edited, cloned, and deleted without losing the saved copy", async ({ page }) => {
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page.getByLabel("Workflow name").fill("Lifecycle Workflow");
  await page.getByLabel("Description").fill("Workflow lifecycle E2E test.");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByRole("button", { name: "Save workflow" }).click();

  const savedRow = page.getByRole("listitem").filter({
    has: page.getByText("Lifecycle Workflow", { exact: true }),
  });
  await expect(savedRow).toBeVisible();
  await savedRow.getByRole("button").first().click();
  await expect(page.getByRole("heading", { name: "Edit workflow" })).toBeVisible();
  await page.getByLabel("Workflow name").fill("Lifecycle Workflow Edited");
  await page.getByRole("button", { name: "Save workflow" }).click();

  const editedRow = page.getByRole("listitem").filter({
    has: page.getByText("Lifecycle Workflow Edited", { exact: true }),
  });
  await expect(editedRow).toBeVisible();
  await editedRow.getByRole("button", { name: "Duplicate Lifecycle Workflow Edited", exact: true }).click();

  const copyRow = page.getByRole("listitem").filter({
    has: page.getByText("Lifecycle Workflow Edited (Copy)", { exact: true }),
  });
  await expect(copyRow).toBeVisible();

  page.once("dialog", dialog => dialog.accept());
  await editedRow.getByRole("button", { name: "Delete Lifecycle Workflow Edited", exact: true }).click();
  await expect(editedRow).toHaveCount(0);
  await expect(copyRow).toBeVisible();
});

test("JSON Studio rejects an invalid PIECS schema and an oversized file", async ({ page }) => {
  await page.getByRole("button", { name: "JSON Studio", exact: true }).click();
  const editor = page.getByLabel("PIECS JSON document");
  await editor.fill(JSON.stringify({ system: "NOT-PIECS", schemaVersion: "1.0.0", templates: [] }));
  await page.getByRole("button", { name: "Validate JSON" }).click();
  await expect(page.getByText("Nguồn dữ liệu không phải package PIECS.")).toBeVisible();

  await page.getByLabel("Open PIECS JSON backup file").setInputFiles({
    name: "oversized.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 32),
  });
  await expect(page.getByRole("alert")).toContainText("File vượt quá giới hạn 10 MB");
  await expect(editor).toHaveValue(JSON.stringify({ system: "NOT-PIECS", schemaVersion: "1.0.0", templates: [] }));
});

test("canceling a JSON data-type switch preserves the unsaved editor content", async ({ page }) => {
  await page.getByRole("button", { name: "JSON Studio", exact: true }).click();
  const editor = page.getByLabel("PIECS JSON document");
  await editor.fill('{"draft":"keep me"}');
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Workflows (", exact: false }).click();
  await expect(editor).toHaveValue('{"draft":"keep me"}');
  await expect(page.getByRole("button", { name: /Templates \(/ })).toHaveAttribute("aria-pressed", "true");
});

test("JSON Studio refuses to import workflow IDs that already exist", async ({ page }) => {
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page.getByLabel("Workflow name").fill("Duplicate Guard Workflow");
  await page.getByLabel("Description").fill("Duplicate import guard E2E test.");
  await page.getByLabel("Choose workflow command").selectOption("source");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByRole("button", { name: "Save workflow" }).click();
  const duplicateGuardRow = page.getByRole("listitem").filter({ hasText: "Duplicate Guard Workflow" });
  await expect(duplicateGuardRow).toBeVisible();

  await page.getByRole("button", { name: "JSON Studio", exact: true }).click();
  await page.getByRole("button", { name: "Workflows (", exact: false }).click();
  await page.getByRole("button", { name: "Load library JSON" }).click();
  await page.getByRole("button", { name: "Validate JSON" }).click();
  await expect(page.getByRole("status")).toContainText("JSON hợp lệ");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Import to library" }).click();
  await expect(page.getByRole("alert")).toContainText("already exists");
  await expect(page.getByRole("alert")).toContainText("nothing was imported");
});

test("Image Studio is accessible and validates a prompt before generation", async ({ page }) => {
  await page.getByRole("button", { name: "Image Studio", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Image Studio", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo ảnh" })).toBeDisabled();
  await page.getByLabel("Prompt").fill("A premium product photo on a clean studio background");
  await expect(page.getByRole("button", { name: "Tạo ảnh" })).toBeEnabled();
  await expect(page.getByText(/Không cần nhập API Key/)).toBeVisible();
});

test("Image Studio rejects unsupported and oversized reference images", async ({ page }) => {
  await page.getByRole("button", { name: "Image Studio", exact: true }).click();
  const fileInput = page.getByLabel("Chọn ảnh tham chiếu");
  await fileInput.setInputFiles({ name: "bad.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
  await expect(page.getByRole("alert")).toContainText("Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP");
  await fileInput.setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("vượt quá 10 MB");
});
