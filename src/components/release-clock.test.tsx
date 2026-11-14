import { render, screen, within } from "@testing-library/react";
import { ASSETS, ASSET_BY_ID } from "@/lib/assets";
import { useMarket } from "@/store/market";
import { ReleaseClock } from "./release-clock";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: ({ fill: _fill, ...props }: Record<string, unknown>) => <img {...(props as object)} />,
}));

const initial = useMarket.getState();

beforeEach(() => {
  useMarket.setState(initial, true);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const items = () => within(screen.getByRole("list")).getAllByRole("listitem");

describe("ReleaseClock", () => {
  it("renders a labelled release calendar section", () => {
    render(<ReleaseClock />);
    expect(screen.getByRole("region", { name: "Release calendar" })).toBeInTheDocument();
  });

  it("omits titles released 120+ days ago", () => {
    render(<ReleaseClock />);
    for (const id of ["the-lord-of-the-rings-the-rings-of-power", "mobland", "dexter-resurrection"]) {
      expect(screen.queryByText(ASSET_BY_ID[id].title)).toBeNull();
    }
    const expected = ASSETS.filter((a) => {
      const days = Math.floor((Date.now() - new Date(`${a.releaseDate}T00:00:00Z`).getTime()) / 86_400_000);
      return days < 120;
    });
    expect(items()).toHaveLength(expected.length);
  });

  it("orders titles from the furthest upcoming release to the longest running", () => {
    render(<ReleaseClock />);
    const links = within(screen.getByRole("list")).getAllByRole("link");
    expect(links[0]).toHaveAccessibleName(`${ASSET_BY_ID["avengers-doomsday"].title}, Opens in 32 days`);
    expect(links[1]).toHaveAccessibleName(
      `${ASSET_BY_ID["the-hunger-games-sunrise-on-the-reaping"].title}, Opens in 4 days`,
    );
  });

  it("labels opening/premiere weeks and weeks in release", () => {
    render(<ReleaseClock />);
    expect(screen.getByRole("link", { name: `${ASSET_BY_ID["ebenezer"].title}, Opening week` })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: `${ASSET_BY_ID["the-body"].title}, Premiere week` })).toBeInTheDocument();
    // the-odyssey: released 2026-07-15 -> 122 days, out of window; spider-man 07-29 -> 108 days -> week 16
    expect(
      screen.getByRole("link", { name: `${ASSET_BY_ID["spider-man-brand-new-day"].title}, Week 16 in release` }),
    ).toBeInTheDocument();
  });

  it("links each title to its asset page and shows its 24h change", () => {
    render(<ReleaseClock />);
    const link = screen.getByRole("link", { name: /Opening week/ });
    expect(link).toHaveAttribute("href", "/asset/ebenezer");
    expect(link).toHaveTextContent(/(up|down|unchanged) \d+\.\d{2}%/);
  });

  it("shows the formatted release date", () => {
    render(<ReleaseClock />);
    const li = screen.getByRole("link", { name: /Opens in 32 days/ }).closest("li")!;
    expect(li).toHaveTextContent("Dec 16");
  });
});
