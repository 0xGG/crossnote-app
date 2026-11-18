import type { Page } from "@playwright/test";
import { CrossnoteApp } from "./crossnote";
import { expect, test } from "./fixtures";
import { layoutOf, row, tabset } from "./layouts";

test("graph keeps its view and opens a linked note", async ({ app, page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await app.open();
  await app.openNotes();
  const title = await app.createNote();
  await app.setEditorText("See [[README]] here.\n");
  await app.selectTab("Drafts");
  await expect(app.noteCards.filter({ hasText: `${title}.md` })).toContainText(
    "See",
  );
  await app
    .notebook("Drafts")
    .getByRole("group")
    .getByRole("treeitem", { name: /Graph view/ })
    .click();
  const svg = page
    .locator("#main-panel svg")
    .filter({ has: page.locator(".nodes") });
  const nodes = svg.locator(".nodes circle");
  await expect(nodes).toHaveCount(2, { timeout: 15000 });
  await nodes.first().hover();
  await expect(svg.locator(".arrows circle")).toHaveCount(1);
  const draggedPath = await nodes.first().evaluate((node) => {
    node.setAttribute("data-test-drag", "target");
    return (node as unknown as { __data__: { id: string } }).__data__.id;
  });
  await expect(
    page.getByText(`Drafts: ${draggedPath}`, { exact: true }),
  ).toBeVisible();
  const box = (await nodes.first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Sample the rendered position during the gesture. The force simulation
  // can pull the node back on its very next frame.
  await nodes.first().evaluate((circle) => {
    const start = circle.getBoundingClientRect();
    const observer = new MutationObserver(() => {
      const moved = circle.getBoundingClientRect();
      if (moved.x > start.x + 15 && moved.y > start.y + 8) {
        circle.setAttribute("data-test-followed-pointer", "true");
        observer.disconnect();
      }
    });
    observer.observe(circle, {
      attributes: true,
      attributeFilter: ["transform"],
    });
  });
  await page.mouse.move(
    box.x + box.width / 2 + 30,
    box.y + box.height / 2 + 20,
    { steps: 5 },
  );
  // Dragging raises the target above its neighbors. Keep measuring that node
  // even as its position in the SVG changes.
  await expect(nodes.last()).toHaveAttribute("data-test-drag", "target");
  await expect(nodes.last()).toHaveAttribute(
    "data-test-followed-pointer",
    "true",
  );
  await page.mouse.up();
  const svgBox = (await svg.boundingBox())!;
  await page.mouse.move(
    svgBox.x + svgBox.width / 2,
    svgBox.y + svgBox.height / 2,
  );
  await page.mouse.wheel(0, -400);
  const group = svg.locator(":scope > g");
  await expect.poll(() => group.getAttribute("transform")).toContain("scale(");
  const transform = await group.getAttribute("transform");
  await svg.evaluate((element) =>
    element.setAttribute("data-test-instance", "kept"),
  );
  await app.selectTab("Drafts");
  await app.selectTab("Graph view");
  await page.evaluate(
    () => new Promise((resolve) => setTimeout(resolve, 1200)),
  );
  await expect(svg).toHaveAttribute("data-test-instance", "kept");
  await expect(group).toHaveAttribute("transform", transform!);
  const readmeIndex = await nodes.evaluateAll((elements) =>
    elements.findIndex(
      (element) =>
        (element as unknown as { __data__: { id: string } }).__data__.id ===
        "README.md",
    ),
  );
  expect(readmeIndex).toBeGreaterThanOrEqual(0);
  await nodes.nth(readmeIndex).click();
  await expect(app.tab("README")).toHaveAttribute("aria-selected", "true");
  await app.openSettings();
  await page.getByRole("combobox").filter({ hasText: "light" }).click();
  await page.getByRole("option", { name: "dark", exact: true }).click();
  await app.selectTab("Graph view");
  await expect(svg.locator(".labelNodes text")).toHaveCount(2);
  await expect(svg).not.toHaveAttribute("data-test-instance", "kept");
  await app
    .tab("Graph view")
    .locator(".flexlayout__tab_button_trailing")
    .click();
  await expect(svg).toHaveCount(0);
  expect(errors).toEqual([]);
});

async function focusedGraph(app: CrossnoteApp, page: Page) {
  await app.open();
  await app.openNotes();
  const folder = await app.notebookFolder();
  const title = await app.createNote();
  await app.setEditorText("[[Other target]]\n");
  await app.selectTab("Drafts");
  await expect(app.noteCards.filter({ hasText: `${title}.md` })).toContainText(
    "Other target",
  );
  await app.storedText(`${folder}/README.md`, "[[First target]]\n");
  const note = (name: string, filePath: string) => ({
    type: "tab",
    id: `note-${name}`,
    name,
    component: "Note",
    config: {
      component: "Note",
      notebookPath: folder,
      noteFilePath: filePath,
    },
  });
  const graph = {
    type: "tab",
    id: "graph-test",
    name: "Graph view",
    component: "Graph",
    config: { component: "Graph", notebookPath: folder },
  };
  await app.seedLayout(
    layoutOf(
      row(
        tabset(note("README", "README.md"), note(title, `${title}.md`)),
        tabset(graph),
      ),
    ),
  );
  await page.reload();
  await app.waitUntilReady();
  const nodes = page.locator("#main-panel .nodes circle");
  await expect(nodes).toHaveCount(4, { timeout: 15000 });
  const fill = (id: string) =>
    nodes.evaluateAll(
      (elements, id) =>
        (
          elements.find(
            (element) =>
              (element as unknown as { __data__: { id: string } }).__data__
                .id === id,
          ) as SVGCircleElement
        )?.style.fill,
      id,
    );
  await page.evaluate(
    () => new Promise((resolve) => setTimeout(resolve, 1200)),
  );
  await app.selectTab(title);
  await app.selectTab("README");
  await expect.poll(() => fill("README.md")).toBe("rgb(33, 150, 243)");
  return { title, fill };
}

test("moves graph focus between unrelated notes", async ({ app, page }) => {
  const { title, fill } = await focusedGraph(app, page);
  await app.selectTab(title);
  await expect.poll(() => fill(`${title}.md`)).toBe("rgb(33, 150, 243)");
  await expect.poll(() => fill("README.md")).toBe("rgb(170, 170, 170)");
  await expect.poll(() => fill("First target.md")).toBe("rgb(170, 170, 170)");
});

test("keeps graph focus after a theme change", async ({ app, page }) => {
  const { fill } = await focusedGraph(app, page);
  await app.openSettings();
  await page.getByRole("combobox").filter({ hasText: "light" }).click();
  await page.getByRole("option", { name: "dark", exact: true }).click();
  await expect.poll(() => fill("README.md")).toBe("rgb(144, 19, 254)");
});

test("keeps the visible zoom when a redraw interrupts a double click", async ({
  app,
  page,
}) => {
  await page.clock.install();
  const { fill } = await focusedGraph(app, page);
  await app.openSettings();
  const theme = page.getByRole("combobox").filter({ hasText: /light|dark/ });
  await theme.click();
  const svg = page
    .locator("#main-panel svg")
    .filter({ has: page.locator(".nodes") });
  const group = svg.locator(":scope > g");
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
  try {
    await svg.dispatchEvent("dblclick");
    await page.clock.runFor(64);
    await expect(group).toHaveAttribute("transform", /scale\(1\.\d+\)/);
    const visibleZoom = await group.getAttribute("transform");

    await page
      .getByRole("option", { name: "dark", exact: true })
      .dispatchEvent("click");
    await expect.poll(() => fill("README.md")).toBe("rgb(144, 19, 254)");
    await expect(group).toHaveAttribute("transform", visibleZoom!);

    // Let the old transition's remaining frames elapse before another redraw.
    await page.clock.runFor(500);
    await theme.dispatchEvent("mousedown");
    await page
      .getByRole("option", { name: "light", exact: true })
      .dispatchEvent("click");
    await expect.poll(() => fill("README.md")).toBe("rgb(33, 150, 243)");
    await expect(group).toHaveAttribute("transform", visibleZoom!);
  } finally {
    await page.clock.resume();
  }
});
