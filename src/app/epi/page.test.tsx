import { act, render, screen, within } from "@testing-library/react";
import { ASSETS, EPI_WEIGHTS } from "@/lib/assets";
import { useMarket } from "@/store/market";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: { src: string }) => <img alt="" src={String(props.src)} />,
}));

import EpiPage from "./page";

const bodyRows = () => {
  const table = screen.getByRole("table");
  return within(table).getAllByRole("row").slice(1); // drop header row
};

beforeEach(() => {
  useMarket.getState().reset();
  useMarket.setState({ toasts: [] });
});

describe("EPI page", () => {
  it("renders the title, badge and table headers", () => {
    render(<EpiPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Entertainment Popularity Index" })).toBeInTheDocument();
    expect(screen.getByText("TMDB inputs · simulated updates")).toBeInTheDocument();
    for (const h of ["#", "Title", "EPI", "24h", "Box office", "Popularity", "Votes", "Rating", "Confidence", "Trend"]) {
      expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
    }
  });

  it("ranks every catalogue title by EPI, highest first, with links", () => {
    render(<EpiPage />);
    const m = useMarket.getState().markets;
    const ranked = [...ASSETS].sort((a, b) => m[b.id].epi - m[a.id].epi);
    const rows = bodyRows();
    expect(rows).toHaveLength(ASSETS.length);
    rows.forEach((row, i) => {
      const a = ranked[i];
      const cells = within(row).getAllByRole("cell");
      expect(cells[0]).toHaveTextContent(String(i + 1));
      expect(within(row).getByRole("link")).toHaveAttribute("href", `/asset/${a.id}`);
      expect(cells[1]).toHaveTextContent(a.title);
      expect(cells[1]).toHaveTextContent(a.ticker);
      expect(cells[2]).toHaveTextContent(m[a.id].epi.toFixed(1));
      expect(row).toHaveTextContent(`${a.confidence}%`);
    });
  });

  it("shows the four signal parts for each row", () => {
    render(<EpiPage />);
    const m = useMarket.getState().markets;
    const top = [...ASSETS].sort((a, b) => m[b.id].epi - m[a.id].epi)[0];
    const parts = m[top.id].epiParts;
    const cells = within(bodyRows()[0]).getAllByRole("cell");
    expect(cells[4]).toHaveTextContent(parts.boxOffice.toFixed(0));
    expect(cells[5]).toHaveTextContent(parts.streaming.toFixed(0));
    expect(cells[6]).toHaveTextContent(parts.social.toFixed(0));
    expect(cells[7]).toHaveTextContent(parts.critics.toFixed(0));
  });

  it("re-ranks when an oracle event changes a title's EPI", () => {
    render(<EpiPage />);
    const m = useMarket.getState().markets;
    const last = [...ASSETS].sort((a, b) => m[b.id].epi - m[a.id].epi).at(-1)!;
    act(() => {
      const s = useMarket.getState();
      useMarket.setState({ markets: { ...s.markets, [last.id]: { ...s.markets[last.id], epi: 99.9 } } });
    });
    const first = bodyRows()[0];
    expect(within(first).getByRole("link")).toHaveAttribute("href", `/asset/${last.id}`);
    expect(first).toHaveTextContent("99.9");
  });

  it("24h column reflects the EPI move against the history reference", () => {
    render(<EpiPage />);
    const s = useMarket.getState();
    const top = [...ASSETS].sort((a, b) => s.markets[b.id].epi - s.markets[a.id].epi)[0];
    const hist = s.markets[top.id].epiHistory;
    const ref = hist[Math.max(0, hist.length - 25)].value;
    const change = s.markets[top.id].epi / ref - 1;
    const cell = within(bodyRows()[0]).getAllByRole("cell")[3];
    const abs = `${(Math.abs(change) * 100).toFixed(2)}%`;
    expect(cell).toHaveTextContent(change > 0 ? `up ${abs}` : `down ${abs}`);
  });

  it("documents the methodology formula and data sources", () => {
    render(<EpiPage />);
    const method = screen.getByRole("heading", { name: "Methodology" }).closest(".panel") as HTMLElement;
    for (const w of Object.values(EPI_WEIGHTS)) expect(method).toHaveTextContent(w.toFixed(2));
    expect(method).toHaveTextContent(/× box office/);
    expect(method).toHaveTextContent(/× rating/);
    expect(method).toHaveTextContent(/× popularity/);
    expect(method).toHaveTextContent(/× votes/);
    expect(method).not.toHaveTextContent(/× streaming|× social/);

    const sources = screen.getByRole("heading", { name: "Data sources" }).closest(".panel") as HTMLElement;
    expect(within(sources).getAllByRole("listitem")).toHaveLength(5);
    expect(sources).toHaveTextContent("TMDB audience vote average");
    expect(sources).toHaveTextContent("Modelled on studio reports, theatrical trackers");
    expect(sources).not.toHaveTextContent("Hourly");
  });
});
