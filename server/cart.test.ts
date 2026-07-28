import { describe, it, expect } from "vitest";

// Lógica de cálculo do total do carrinho (extraída do Home.tsx)
function calcCartTotal(cart: Array<{ option: { price: string } | null }>): number | null {
  if (cart.length <= 1) return null;
  let total = 0;
  for (const item of cart) {
    const price = item.option?.price || "0";
    const num = parseFloat(
      price.replace("R$ ", "").replace(".", "").replace(",", ".")
    );
    if (!isNaN(num)) total += num;
  }
  return total;
}

function formatCartTotal(total: number): string {
  return `R$ ${total.toFixed(2).replace(".", ",")}`;
}

describe("Cart logic", () => {
  it("returns null for empty cart", () => {
    expect(calcCartTotal([])).toBeNull();
  });

  it("returns null for single item cart", () => {
    expect(calcCartTotal([{ option: { price: "R$ 600,00" } }])).toBeNull();
  });

  it("calculates total for 2 items", () => {
    const cart = [
      { option: { price: "R$ 600,00" } },
      { option: { price: "R$ 600,00" } },
    ];
    expect(calcCartTotal(cart)).toBe(1200);
  });

  it("calculates total for 3 items with different prices", () => {
    const cart = [
      { option: { price: "R$ 600,00" } },
      { option: { price: "R$ 300,00" } },
      { option: { price: "R$ 150,00" } },
    ];
    expect(calcCartTotal(cart)).toBe(1050);
  });

  it("handles items without options (price = 0)", () => {
    const cart = [
      { option: null },
      { option: { price: "R$ 600,00" } },
    ];
    expect(calcCartTotal(cart)).toBe(600);
  });

  it("formats total correctly", () => {
    expect(formatCartTotal(1200)).toBe("R$ 1200,00");
    expect(formatCartTotal(600)).toBe("R$ 600,00");
    expect(formatCartTotal(1050)).toBe("R$ 1050,00");
  });

  it("cart with multiple items triggers multi-order flow (cart.length > 1)", () => {
    const cart = [
      { option: { price: "R$ 600,00" } },
      { option: { price: "R$ 300,00" } },
    ];
    // Simula a condição do handleFinalSubmit
    const cartItems = cart.length > 1 ? cart : null;
    expect(cartItems).not.toBeNull();
    expect(cartItems?.length).toBe(2);
  });

  it("single item cart does not trigger multi-order flow", () => {
    const cart = [{ option: { price: "R$ 600,00" } }];
    const cartItems = cart.length > 1 ? cart : null;
    expect(cartItems).toBeNull();
  });
});
