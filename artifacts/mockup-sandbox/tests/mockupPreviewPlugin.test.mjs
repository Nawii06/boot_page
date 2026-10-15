import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mockupPreviewPlugin } from "../mockupPreviewPlugin.ts";

test("discovers preview components and rescans additions/removals without private files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mockup-discovery-"));
  const mockups = path.join(root, "src/components/mockups");
  const generated = path.join(root, "src/.generated/mockup-components.ts");
  const plugin = mockupPreviewPlugin();

  async function add(relativePath) {
    const target = path.join(mockups, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "");
  }

  try {
    for (const file of [
      "Card.tsx",
      "nested/Panel.tsx",
      "_Private.tsx",
      "_private/Hidden.tsx",
      "nested/_private/Hidden.tsx",
      "nested/_Helper.tsx",
      ".hidden/Hidden.tsx",
      "notes.ts",
    ]) {
      await add(file);
    }

    plugin.configResolved({ root });
    await plugin.buildStart();
    const source = await readFile(generated, "utf8");
    assert.match(source, /"\.\/components\/mockups\/Card\.tsx"/);
    assert.match(source, /import\("\.\.\/components\/mockups\/nested\/Panel\.tsx"\)/);
    assert.equal((source.match(/\(\) => import\(/g) ?? []).length, 2);
    assert.doesNotMatch(source, /Private|Hidden|Helper|notes/);

    await add("nested/Added.tsx");
    await rm(path.join(mockups, "Card.tsx"));
    await plugin.buildStart();
    const rescanned = await readFile(generated, "utf8");
    assert.match(rescanned, /nested\/Added\.tsx/);
    assert.doesNotMatch(rescanned, /Card\.tsx/);

    await rm(mockups, { recursive: true });
    await plugin.buildStart();
    const empty = await readFile(generated, "utf8");
    assert.equal((empty.match(/\(\) => import\(/g) ?? []).length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
