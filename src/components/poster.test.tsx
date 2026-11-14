import { render, screen } from "@testing-library/react";
import type { AssetSeed } from "@/lib/assets";
import { ASSETS } from "@/lib/assets";
import { Poster } from "./poster";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ fill: _fill, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}));

const base = ASSETS[0];
const noPoster: AssetSeed = { ...base, posterUrl: null, title: "Generated Tile", studio: "Test Studio" };

describe("Poster", () => {
  it("renders the TMDB image when posterUrl is set", () => {
    const { container } = render(<Poster asset={base} size="lg" />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", base.posterUrl!);
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("sizes", "120px");
    expect(screen.queryByText(base.title)).toBeNull();
  });

  it("uses size-appropriate image sizes", () => {
    const { container, rerender } = render(<Poster asset={base} size="md" />);
    expect(container.querySelector("img")).toHaveAttribute("sizes", "64px");
    rerender(<Poster asset={base} size="sm" />);
    expect(container.querySelector("img")).toHaveAttribute("sizes", "32px");
  });

  it("is decorative (aria-hidden) and applies size + custom classes", () => {
    const { container } = render(<Poster asset={base} size="sm" className="custom" />);
    const root = container.firstElementChild!;
    expect(root).toHaveAttribute("aria-hidden");
    expect(root).toHaveClass("h-11", "w-8", "custom");
  });

  it("falls back to a generated tile with the title when there is no poster", () => {
    const { container } = render(<Poster asset={noPoster} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Generated Tile")).toBeInTheDocument();
    // md does not show the studio
    expect(screen.queryByText("Test Studio")).toBeNull();
    expect(container.firstElementChild).toHaveStyle({ background: noPoster.colors[1] });
  });

  it("shows the studio only on the large generated tile", () => {
    render(<Poster asset={noPoster} size="lg" />);
    expect(screen.getByText("Test Studio")).toBeInTheDocument();
  });

  it("hides the title on the small generated tile", () => {
    render(<Poster asset={noPoster} size="sm" />);
    expect(screen.queryByText("Generated Tile")).toBeNull();
  });
});
