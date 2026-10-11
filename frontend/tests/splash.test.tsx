import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EXPAND_MS, HOLD_MS, PRODUCT_NAME, REVEAL_MS, SWEEP_MS, Splash, backDuration } from "@/components/Splash";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function visibleLetters(): string {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-letter]"))
    .filter((letter) => letter.style.opacity !== "0")
    .map((letter) => letter.textContent)
    .join("");
}

describe("Splash", () => {
  it("shows the product name and starts the camera on the logo tap, then plays the intro", () => {
    vi.useFakeTimers();
    const onStart = vi.fn();
    const onDone = vi.fn();
    render(<Splash onStart={onStart} onDone={onDone} />);
    expect(screen.getByRole("heading", { name: PRODUCT_NAME })).toBeTruthy();
    expect(visibleLetters()).toBe(PRODUCT_NAME);

    const logo = screen.getByRole("button", { name: "Start camera" });
    fireEvent.click(logo);
    expect(onStart).toHaveBeenCalledTimes(1); // inside the tap, for the camera permission prompt
    expect(logo).toHaveProperty("disabled", true);

    act(() => vi.advanceTimersByTime(SWEEP_MS));
    expect(visibleLetters()).toBe(""); // the sweep erased the title
    // jsdom has no layout, so the return trip falls back to the sweep's duration.
    const head = () => document.querySelector("circle") as SVGCircleElement;
    expect(head().style.opacity).toBe("1");
    act(() => vi.advanceTimersByTime(SWEEP_MS + HOLD_MS - 1)); // waiting at the centre, head on
    expect(head().style.opacity).toBe("1");
    act(() => vi.advanceTimersByTime(1)); // the zoom starts and the head goes at the same moment
    expect(head().style.opacity).toBe("0");
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(EXPAND_MS)); // the V has zoomed and the background is black
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(REVEAL_MS)); // the black fades, revealing the camera
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("moves back at the same speed as the sweep", () => {
    expect(backDuration(400, 400)).toBe(SWEEP_MS);
    expect(backDuration(400, 600)).toBe(1.5 * SWEEP_MS);
    expect(backDuration(400, -200)).toBe(0.5 * SWEEP_MS);
  });

  it("never leaves focus on the logo, so no focus box can stay behind", () => {
    vi.useFakeTimers();
    render(<Splash onStart={vi.fn()} onDone={vi.fn()} />);
    const logo = screen.getByRole("button", { name: "Start camera" });
    // A pointer press does not take focus...
    expect(fireEvent.mouseDown(logo)).toBe(false); // default (focusing) prevented
    // ...and keyboard activation gives focus back up.
    logo.focus();
    expect(document.activeElement).toBe(logo);
    fireEvent.click(logo);
    expect(document.activeElement).not.toBe(logo);
  });

  it("ignores repeated taps during the intro", () => {
    vi.useFakeTimers();
    const onStart = vi.fn();
    render(<Splash onStart={onStart} onDone={vi.fn()} />);
    const logo = screen.getByRole("button", { name: "Start camera" });
    fireEvent.click(logo);
    fireEvent.click(logo);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
