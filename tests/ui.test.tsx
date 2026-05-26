import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";

function markSetupCompleted() {
  localStorage.setItem("ownerledger-local-browser-data", JSON.stringify({
    setupCompleted: true,
    properties: [],
    units: [],
    tenants: [],
    contracts: [],
    charges: [],
    spotCharges: [],
    payments: [],
    allocations: [],
    expenses: [],
    deposits: [],
    repairs: [],
    documents: []
  }));
}

describe("beginner-friendly UI", () => {
  it("初回セットアップ画面を表示する", async () => {
    localStorage.clear();
    render(<App />);
    expect(await screen.findByText("オーナーレジャー ローカル 初回設定")).toBeInTheDocument();
    expect(screen.getByText("最初に必要な項目だけ登録します。詳しい情報は後から追加できます。")).toBeInTheDocument();
  });

  it("危険操作に使う確認ダイアログを呼べる", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    window.confirm("この入金を取り消します。関連する消込も再計算されます。よろしいですか？");
    expect(confirmSpy).toHaveBeenCalledWith("この入金を取り消します。関連する消込も再計算されます。よろしいですか？");
    confirmSpy.mockRestore();
  });

  it("セットアップを進めるボタンが分かりやすい", async () => {
    localStorage.clear();
    render(<App />);
    const nextButton = await screen.findByRole("button", { name: /次へ進む/ });
    fireEvent.click(nextButton);
    expect(screen.getByText("名前または屋号")).toBeInTheDocument();
  });

  it("販売前の未完成メニューを表示しない", async () => {
    markSetupCompleted();
    render(<App />);
    expect(await screen.findByText("OwnerLedger")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "未収・滞納" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ローン" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "設定" })).not.toBeInTheDocument();
  });

  it("文字サイズを大きくできる", async () => {
    markSetupCompleted();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "特大" }));
    expect(document.documentElement.dataset.fontSize).toBe("extra-large");
    expect(localStorage.getItem("ownerledger-font-size")).toBe("extra-large");
  });

  it("かんたん操作から目的の画面へ移動できる", async () => {
    markSetupCompleted();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "支出を入れる" }));
    expect(await screen.findByRole("heading", { name: "支出を登録する" })).toBeInTheDocument();
  });
});
