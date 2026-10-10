import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EnrollmentCard } from "@/components/EnrollmentCard";

afterEach(cleanup);

const naming = { kind: "naming" as const, previewUrl: null, saving: false, error: null };

describe("EnrollmentCard", () => {
  it("saves only after a name is typed and the button is pressed", () => {
    const onSave = vi.fn();
    render(<EnrollmentCard state={naming} onSave={onSave} onDismiss={vi.fn()} />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Bhavya " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Bhavya" }));
    expect(onSave).toHaveBeenCalledWith(" Bhavya ", "");
  });

  it("Not now dismisses without saving", () => {
    const onSave = vi.fn();
    const onDismiss = vi.fn();
    render(<EnrollmentCard state={naming} onSave={onSave} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows capture progress and save errors", () => {
    const { rerender } = render(
      <EnrollmentCard state={{ kind: "capturing", captured: 2 }} onSave={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByRole("status").textContent).toContain("2/4");
    rerender(<EnrollmentCard state={{ ...naming, error: "Backend is unreachable." }} onSave={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toBe("Backend is unreachable.");
  });
});
