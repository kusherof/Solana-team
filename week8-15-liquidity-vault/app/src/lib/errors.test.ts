import { describe, expect, it } from "vitest";
import { describeError, programErrorText } from "./errors";
import idl from "../../../sdk/liquidity_vault_idl.json";

const code = (name: string) => (idl as any).errors.find((e: any) => e.name === name).code as number;

describe("ошибки → понятный текст", () => {
  it("каждая ошибка контракта из IDL имеет текст", () => {
    for (const e of (idl as any).errors) expect(programErrorText(e.code)).toBeTruthy();
  });
  it("AnchorError от клиента Anchor", () => {
    const e = { error: { errorCode: { code: "VaultNotIdle", number: code("VaultNotIdle") }, errorMessage: "x" } };
    expect(describeError(e)).toMatch(/закройте позицию/);
    expect(describeError(e)).toMatch(/Дождитесь/);
  });
  it("код из simulation logs (custom program error: 0x…)", () => {
    const hex = code("DepositTooSmall").toString(16);
    expect(describeError(new Error(`failed: custom program error: 0x${hex}`))).toMatch(/Минимальный депозит/);
  });
  it("ошибка Raydium внутри CPI ищется по имени, а не по номеру", () => {
    const e = { message: "Simulation failed", logs: ["Program log: AnchorError ... Error Code: TooLittleOutputReceived. Error Number: 6022."] };
    expect(describeError(e)).toMatch(/slippage/);
  });
  it("кошелёк и сеть", () => {
    expect(describeError(new Error("User rejected the request."))).toMatch(/отменили/);
    expect(describeError(new Error("Attempt to debit an account but found no record of a prior credit."))).toMatch(/SOL/);
    expect(describeError(new Error("429 Too Many Requests"))).toMatch(/429/);
    expect(describeError(new Error("Blockhash not found"))).toMatch(/устарела/);
  });
  it("неизвестная ошибка — как есть", () => {
    expect(describeError(new Error("что-то новое"))).toBe("что-то новое");
  });
});
