import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Layout } from "./Layout";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

const renderLayout = (initialRoute = "/dashboard") =>
  render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Layout>
        <div data-testid="child-content">Dashboard Content</div>
      </Layout>
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
  mockNavigate.mockClear();
});

describe("Layout", () => {
  it("renders sidebar with logo and nav links", () => {
    localStorage.setItem("username", "Davi");
    renderLayout();

    expect(screen.getByText("Moody")).toBeInTheDocument();
    expect(screen.getByText("Trading Bot")).toBeInTheDocument();
    const links = screen.getAllByText("Painel Geral");
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Estratégia")).toBeInTheDocument();
    expect(screen.getByText("Backtesting & Risco")).toBeInTheDocument();
  });

  it("highlights active nav link based on current route", () => {
    localStorage.setItem("username", "Trader");
    renderLayout("/strategy");

    const links = screen.getAllByText("Estratégia");
    const navLink = links.find((el) => el.tagName === "A") as HTMLElement;
    expect(navLink.className).toContain("bg-indigo-600/15");
    expect(navLink.className).toContain("indigo-400");
  });

  it("renders children in main content area", () => {
    localStorage.setItem("username", "Trader");
    renderLayout();

    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Dashboard Content")).toBeInTheDocument();
  });

  it("shows username initials avatar and full username", () => {
    localStorage.setItem("username", "Davi Laurindo");
    renderLayout();

    expect(screen.getByText("DA")).toBeInTheDocument();
    expect(screen.getByText("Davi Laurindo")).toBeInTheDocument();
  });

  it("falls back to Trader when no username in localStorage", () => {
    renderLayout();

    expect(screen.getByText("TR")).toBeInTheDocument();
    expect(screen.getByText("Trader")).toBeInTheDocument();
  });

  it("shows header with active route label and sync time", () => {
    localStorage.setItem("username", "Trader");
    renderLayout("/backtest");

    const elements = screen.getAllByText("Backtesting & Risco");
    expect(elements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Última Sincronização:")).toBeInTheDocument();
  });

  it("calls handleLogout clearing storage and navigating to /login", () => {
    localStorage.setItem("token", "abc123");
    localStorage.setItem("refreshToken", "ref456");
    localStorage.setItem("username", "Davi");
    renderLayout();

    const logoutBtn = screen.getByTitle("Sair");
    fireEvent.click(logoutBtn);

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("refreshToken")).toBeNull();
    expect(localStorage.getItem("username")).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("renders connection status badge in sidebar footer", () => {
    renderLayout();

    expect(screen.getByText("Preços em Tempo Real")).toBeInTheDocument();
  });
});