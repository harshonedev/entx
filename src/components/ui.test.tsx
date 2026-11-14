import { render, screen } from "@testing-library/react";
import { Change, Dim, EpiMeter, Flash, SimBadge, Sparkline, Stat, isFlat, signTone } from "./ui";

describe("isFlat", () => {
  it("treats values that round to 0.00% as flat", () => {
    expect(isFlat(0)).toBe(true);
    expect(isFlat(-0.00001)).toBe(true);
    expect(isFlat(0.00004)).toBe(true);
  });
  it("treats visible moves as not flat", () => {
    expect(isFlat(0.0001)).toBe(false);
    expect(isFlat(-0.05)).toBe(false);
  });
  it("respects the digits argument", () => {
    expect(isFlat(0.004, 0)).toBe(true);
    expect(isFlat(0.006, 0)).toBe(false);
  });
});

describe("signTone", () => {
  it("is neutral inside the default ±0.25% dead band", () => {
    expect(signTone(0.002)).toBe("text-muted");
    expect(signTone(-0.0024)).toBe("text-muted");
  });
  it("is up/down outside the band", () => {
    expect(signTone(0.01)).toBe("text-up");
    expect(signTone(-0.01)).toBe("text-down");
  });
  it("accepts a custom band", () => {
    expect(signTone(0.01, 0.05)).toBe("text-muted");
  });
});

describe("Change", () => {
  it("renders a positive change with an up arrow and screen-reader text", () => {
    const { container } = render(<Change value={0.0523} />);
    const el = container.firstElementChild!;
    expect(el).toHaveClass("text-up");
    expect(el).toHaveTextContent("▲ up 5.23%");
    expect(el.textContent).not.toContain("+");
  });
  it("renders a negative change without the minus sign", () => {
    const { container } = render(<Change value={-0.1} className="extra" />);
    const el = container.firstElementChild!;
    expect(el).toHaveClass("text-down", "extra");
    expect(el).toHaveTextContent("▼ down 10.00%");
    expect(el.textContent).not.toContain("-");
  });
  it("renders a tiny change as flat 0.00% with no arrow", () => {
    const { container } = render(<Change value={-0.00001} />);
    const el = container.firstElementChild!;
    expect(el).toHaveClass("text-muted");
    expect(el).toHaveTextContent("unchanged 0.00%");
    expect(el.textContent).not.toMatch(/[▲▼]/);
  });
});

describe("Flash", () => {
  it("renders children without a flash class initially", () => {
    render(<Flash value={10}>ten</Flash>);
    const el = screen.getByText("ten");
    expect(el).not.toHaveClass("flash-up");
    expect(el).not.toHaveClass("flash-down");
  });
  it("flashes up when the value rises and down when it falls", () => {
    const { rerender } = render(<Flash value={10}>v</Flash>);
    rerender(<Flash value={11}>v</Flash>);
    expect(screen.getByText("v")).toHaveClass("flash-up");
    rerender(<Flash value={9}>v</Flash>);
    expect(screen.getByText("v")).toHaveClass("flash-down");
  });
  it("ignores negligible changes", () => {
    const { rerender } = render(<Flash value={1000}>v</Flash>);
    rerender(<Flash value={1000.1}>v</Flash>);
    expect(screen.getByText("v")).not.toHaveClass("flash-up");
  });
  it("passes className through", () => {
    render(<Flash value={1} className="foo">v</Flash>);
    expect(screen.getByText("v")).toHaveClass("foo");
  });
});

describe("Sparkline", () => {
  it("renders nothing for fewer than two points", () => {
    const { container } = render(<Sparkline points={[1]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("draws an up-coloured path when the last point is above the first", () => {
    const { container } = render(<Sparkline points={[1, 3, 2]} width={100} height={20} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "100");
    expect(svg).toHaveAttribute("aria-hidden");
    const path = svg.querySelector("path")!;
    expect(path).toHaveAttribute("stroke", "var(--up)");
    // 3 points -> one M and two L segments, spanning the full width
    const d = path.getAttribute("d")!;
    expect(d.match(/[ML]/g)).toEqual(["M", "L", "L"]);
    expect(d).toMatch(/^M0\.0,/);
    expect(d).toContain("L100.0,");
  });
  it("draws a down-coloured path when the series fell", () => {
    const { container } = render(<Sparkline points={[5, 4, 1]} />);
    expect(container.querySelector("path")).toHaveAttribute("stroke", "var(--down)");
  });
  it("handles a flat series without NaN", () => {
    const { container } = render(<Sparkline points={[2, 2, 2]} />);
    expect(container.querySelector("path")!.getAttribute("d")).not.toContain("NaN");
  });
});

describe("SimBadge", () => {
  it("defaults to 'Simulated'", () => {
    render(<SimBadge />);
    expect(screen.getByText("Simulated")).toBeInTheDocument();
  });
  it("renders custom children", () => {
    render(<SimBadge>Devnet</SimBadge>);
    expect(screen.getByText("Devnet")).toBeInTheDocument();
  });
});

describe("EpiMeter", () => {
  const bar = (value: number) => {
    const { container } = render(<EpiMeter value={value} />);
    return container.firstElementChild!.firstElementChild as HTMLElement;
  };
  it("scales the bar to value/100", () => {
    expect(bar(42).style.transform).toBe("scaleX(0.42)");
  });
  it("clamps to 0..100", () => {
    expect(bar(150).style.transform).toBe("scaleX(1)");
    expect(bar(-5).style.transform).toBe("scaleX(0)");
  });
});

describe("Stat", () => {
  it("renders label, value and optional sub", () => {
    render(
      <Stat label="Cash" sub="available">
        $10
      </Stat>,
    );
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("$10")).toBeInTheDocument();
    expect(screen.getByText("available")).toBeInTheDocument();
  });
  it("omits the sub line when not given", () => {
    const { container } = render(<Stat label="Cash">$10</Stat>);
    expect(container.firstElementChild!.children).toHaveLength(2);
  });
});

describe("Dim", () => {
  it("dims the fractional part", () => {
    const { container } = render(<Dim text="$43,255.38" className="c" />);
    const root = container.firstElementChild!;
    expect(root).toHaveClass("c");
    expect(root).toHaveTextContent("$43,255.38");
    expect(screen.getByText(".38")).toHaveClass("text-faint");
  });
  it("renders plain text when there is no decimal point", () => {
    const { container } = render(<Dim text="$100" />);
    expect(container.firstElementChild).toHaveTextContent("$100");
    expect(container.querySelector(".text-faint")).toBeNull();
  });
});
