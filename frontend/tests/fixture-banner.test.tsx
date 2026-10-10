import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FixtureModeBanner } from "@/components/FixtureModeBanner";

describe("FixtureModeBanner", () => {
  it("labels synthetic data", () => {
    render(<FixtureModeBanner />);
    expect(screen.getByRole("status").textContent).toBe("Fixture mode — synthetic data");
  });
});
