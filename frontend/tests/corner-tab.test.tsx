import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CornerTab } from "@/components/CornerTab";

afterEach(cleanup);

describe("CornerTab", () => {
  it("is marked unavailable until it has a role", () => {
    render(<CornerTab />);
    expect(screen.getByRole("button", { name: "Coming soon" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("calls its action once wired", () => {
    const onPress = vi.fn();
    render(<CornerTab label="Open glasses menu" onPress={onPress} />);
    const tab = screen.getByRole("button", { name: "Open glasses menu" });
    expect(tab.getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(tab);
    expect(onPress).toHaveBeenCalledOnce();
  });
});
