import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const copies = path.resolve(import.meta.dirname, "../src/fixtures/examples");
const source = path.resolve(import.meta.dirname, "../../contracts/examples");

describe("src/fixtures/examples", () => {
  const files = readdirSync(copies).filter((name) => name.endsWith(".json"));

  it("has copies to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s matches contracts/examples", (name) => {
    const copy: unknown = JSON.parse(readFileSync(path.join(copies, name), "utf8"));
    const original: unknown = JSON.parse(readFileSync(path.join(source, name), "utf8"));
    expect(copy).toEqual(original);
  });
});
