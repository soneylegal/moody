import React from "react";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App routing", () => {
  afterEach(() => {
    localStorage.clear();
    window.history.pushState({}, "", "/");
  });

  it("renders login page by default (no token)", () => {
    localStorage.clear();
    render(<App />);
    expect(screen.getByText(/Entrar/i)).toBeInTheDocument();
  });

  it("redirects /dashboard to /login when no token", () => {
    localStorage.clear();
    window.history.pushState({}, "", "/dashboard");
    render(<App />);
    expect(screen.getByText(/Entrar/i)).toBeInTheDocument();
  });

  it("redirects wildcard route to /login when no token", () => {
    localStorage.clear();
    window.history.pushState({}, "", "/nonexistent");
    render(<App />);
    expect(screen.getByText(/Entrar/i)).toBeInTheDocument();
  });

  it("shows dashboard when token is present", () => {
    localStorage.setItem("token", "test-token");
    window.history.pushState({}, "", "/dashboard");
    render(<App />);
    expect(screen.getByText("Moody")).toBeInTheDocument();
    const painelElements = screen.getAllByText("Painel Geral");
    expect(painelElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows strategy page when authenticated", () => {
    localStorage.setItem("token", "test-token");
    window.history.pushState({}, "", "/strategy");
    render(<App />);
    const strategyElements = screen.getAllByText("Estratégia");
    expect(strategyElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows login page on /login even with token", () => {
    localStorage.setItem("token", "test-token");
    window.history.pushState({}, "", "/login");
    render(<App />);
    expect(screen.getByText(/Entrar/i)).toBeInTheDocument();
  });

  it("shows register page", () => {
    localStorage.clear();
    window.history.pushState({}, "", "/register");
    render(<App />);
    expect(screen.getByText(/Cadastrar/i)).toBeInTheDocument();
  });
});