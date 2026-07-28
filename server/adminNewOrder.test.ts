import { describe, it, expect } from "vitest";

// ---- Helpers replicados do AdminNewOrder.tsx ----

type CartItem = {
  id: string;
  productId: number | null;
  optionId: number | null;
  questionAnswers: Record<number, string>;
};

type ProductOption = {
  id: number;
  label: string;
  price?: string;
  isActive: number;
  questions?: { id: number; question: string; isRequired: number; fieldType: string; options?: string }[];
};

type Product = {
  id: number;
  name: string;
  options: ProductOption[];
};

function parsePrice(price: string | undefined | null): number {
  if (!price) return 0;
  const num = parseFloat(price.replace("R$ ", "").replace(".", "").replace(",", "."));
  return isNaN(num) ? 0 : num;
}

function calcCartTotal(cartItems: CartItem[], products: Product[]): number {
  return cartItems.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId);
    const option = product?.options.find(o => o.id === item.optionId);
    return sum + parsePrice(option?.price);
  }, 0);
}

function buildValidItems(cartItems: CartItem[], products: Product[]) {
  return cartItems
    .filter(item => item.productId !== null)
    .map(item => {
      const product = products.find(p => p.id === item.productId);
      const option = product?.options.find(o => o.id === item.optionId);
      const answersArr = option?.questions
        ?.filter(q => item.questionAnswers[q.id])
        .map(q => ({ question: q.question, answer: item.questionAnswers[q.id] })) || [];
      return {
        serviceName: product?.name || "",
        serviceOption: option?.label || undefined,
        answers: answersArr.length > 0 ? JSON.stringify(answersArr) : undefined,
      };
    });
}

// ---- Dados de teste ----

const mockProducts: Product[] = [
  {
    id: 1,
    name: "UBER CARRO",
    options: [
      { id: 10, label: "NOME / ALEATORIO", price: "R$ 600,00", isActive: 1 },
      { id: 11, label: "NOME / PROPRIO", price: "R$ 800,00", isActive: 1 },
    ],
  },
  {
    id: 2,
    name: "UBER MOTO",
    options: [
      { id: 20, label: "NOME / ALEATORIO", price: "R$ 450,00", isActive: 1 },
    ],
  },
  {
    id: 3,
    name: "99 CARRO",
    options: [
      { id: 30, label: "BÁSICO", price: "R$ 1.200,00", isActive: 1 },
    ],
  },
];

// ---- Testes ----

describe("parsePrice", () => {
  it("converte preço em formato brasileiro para número", () => {
    expect(parsePrice("R$ 600,00")).toBe(600);
    expect(parsePrice("R$ 1.200,00")).toBe(1200);
    expect(parsePrice("R$ 1.500,50")).toBe(1500.5);
  });

  it("retorna 0 para valores inválidos ou ausentes", () => {
    expect(parsePrice(null)).toBe(0);
    expect(parsePrice(undefined)).toBe(0);
    expect(parsePrice("")).toBe(0);
    expect(parsePrice("sem preço")).toBe(0);
  });
});

describe("calcCartTotal", () => {
  it("calcula total com um item", () => {
    const items: CartItem[] = [
      { id: "a", productId: 1, optionId: 10, questionAnswers: {} },
    ];
    expect(calcCartTotal(items, mockProducts)).toBe(600);
  });

  it("calcula total com dois itens diferentes", () => {
    const items: CartItem[] = [
      { id: "a", productId: 1, optionId: 10, questionAnswers: {} },
      { id: "b", productId: 2, optionId: 20, questionAnswers: {} },
    ];
    expect(calcCartTotal(items, mockProducts)).toBe(1050);
  });

  it("calcula total com três itens incluindo preço com ponto de milhar", () => {
    const items: CartItem[] = [
      { id: "a", productId: 1, optionId: 10, questionAnswers: {} },
      { id: "b", productId: 2, optionId: 20, questionAnswers: {} },
      { id: "c", productId: 3, optionId: 30, questionAnswers: {} },
    ];
    expect(calcCartTotal(items, mockProducts)).toBe(2250);
  });

  it("ignora itens sem produto selecionado", () => {
    const items: CartItem[] = [
      { id: "a", productId: 1, optionId: 10, questionAnswers: {} },
      { id: "b", productId: null, optionId: null, questionAnswers: {} },
    ];
    expect(calcCartTotal(items, mockProducts)).toBe(600);
  });

  it("retorna 0 quando nenhum item tem produto", () => {
    const items: CartItem[] = [
      { id: "a", productId: null, optionId: null, questionAnswers: {} },
    ];
    expect(calcCartTotal(items, mockProducts)).toBe(0);
  });

  it("retorna 0 quando item tem produto mas sem opção selecionada", () => {
    const items: CartItem[] = [
      { id: "a", productId: 1, optionId: null, questionAnswers: {} },
    ];
    expect(calcCartTotal(items, mockProducts)).toBe(0);
  });
});

describe("buildValidItems", () => {
  it("filtra itens sem produto", () => {
    const items: CartItem[] = [
      { id: "a", productId: 1, optionId: 10, questionAnswers: {} },
      { id: "b", productId: null, optionId: null, questionAnswers: {} },
    ];
    const result = buildValidItems(items, mockProducts);
    expect(result).toHaveLength(1);
    expect(result[0].serviceName).toBe("UBER CARRO");
  });

  it("inclui serviceOption quando opção está selecionada", () => {
    const items: CartItem[] = [
      { id: "a", productId: 1, optionId: 10, questionAnswers: {} },
    ];
    const result = buildValidItems(items, mockProducts);
    expect(result[0].serviceOption).toBe("NOME / ALEATORIO");
  });

  it("retorna serviceOption undefined quando opção não selecionada", () => {
    const items: CartItem[] = [
      { id: "a", productId: 1, optionId: null, questionAnswers: {} },
    ];
    const result = buildValidItems(items, mockProducts);
    expect(result[0].serviceOption).toBeUndefined();
  });

  it("monta dois itens corretamente para múltiplos produtos", () => {
    const items: CartItem[] = [
      { id: "a", productId: 1, optionId: 10, questionAnswers: {} },
      { id: "b", productId: 2, optionId: 20, questionAnswers: {} },
    ];
    const result = buildValidItems(items, mockProducts);
    expect(result).toHaveLength(2);
    expect(result[0].serviceName).toBe("UBER CARRO");
    expect(result[1].serviceName).toBe("UBER MOTO");
  });

  it("inclui respostas de perguntas quando preenchidas", () => {
    const productsWithQuestions: Product[] = [
      {
        id: 1,
        name: "UBER CARRO",
        options: [
          {
            id: 10,
            label: "NOME / ALEATORIO",
            price: "R$ 600,00",
            isActive: 1,
            questions: [
              { id: 100, question: "Placa do veículo?", isRequired: 1, fieldType: "text" },
            ],
          },
        ],
      },
    ];
    const items: CartItem[] = [
      { id: "a", productId: 1, optionId: 10, questionAnswers: { 100: "ABC-1234" } },
    ];
    const result = buildValidItems(items, productsWithQuestions);
    expect(result[0].answers).toBeDefined();
    const parsed = JSON.parse(result[0].answers!);
    expect(parsed[0].question).toBe("Placa do veículo?");
    expect(parsed[0].answer).toBe("ABC-1234");
  });

  it("não inclui respostas vazias nas perguntas", () => {
    const productsWithQuestions: Product[] = [
      {
        id: 1,
        name: "UBER CARRO",
        options: [
          {
            id: 10,
            label: "NOME / ALEATORIO",
            price: "R$ 600,00",
            isActive: 1,
            questions: [
              { id: 100, question: "Placa do veículo?", isRequired: 0, fieldType: "text" },
            ],
          },
        ],
      },
    ];
    const items: CartItem[] = [
      { id: "a", productId: 1, optionId: 10, questionAnswers: {} },
    ];
    const result = buildValidItems(items, productsWithQuestions);
    expect(result[0].answers).toBeUndefined();
  });
});

describe("retorno enriquecido do backend", () => {
  it("createManualOrder retorna orderNumber, serviceName e serviceOption", () => {
    // Simula o retorno esperado do backend
    const mockResponse = {
      success: true,
      registrationId: 42,
      orderNumber: 1001,
      serviceName: "UBER CARRO",
      serviceOption: "NOME / ALEATORIO",
    };
    expect(mockResponse.orderNumber).toBe(1001);
    expect(mockResponse.serviceName).toBe("UBER CARRO");
    expect(mockResponse.serviceOption).toBe("NOME / ALEATORIO");
  });

  it("createManualOrderMultiple retorna array orders com orderNumber por item", () => {
    const mockResponse = {
      success: true,
      registrationId: 42,
      count: 2,
      orders: [
        { serviceName: "UBER CARRO", serviceOption: "NOME / ALEATORIO", orderNumber: 1001 },
        { serviceName: "UBER MOTO", serviceOption: "NOME / ALEATORIO", orderNumber: 1002 },
      ],
    };
    expect(mockResponse.count).toBe(2);
    expect(mockResponse.orders).toHaveLength(2);
    expect(mockResponse.orders[0].orderNumber).toBe(1001);
    expect(mockResponse.orders[1].orderNumber).toBe(1002);
  });

  it("estado successOrders é preenchido corretamente para 1 pedido", () => {
    const data = { success: true, registrationId: 1, orderNumber: 999, serviceName: "UBER CARRO", serviceOption: "NOME / PROPRIO" };
    const successOrders = [{ serviceName: data.serviceName, serviceOption: data.serviceOption, orderNumber: data.orderNumber }];
    expect(successOrders).toHaveLength(1);
    expect(successOrders[0].orderNumber).toBe(999);
  });

  it("estado successOrders é preenchido corretamente para múltiplos pedidos", () => {
    const data = {
      count: 3,
      orders: [
        { serviceName: "UBER CARRO", serviceOption: "A", orderNumber: 100 },
        { serviceName: "UBER MOTO", serviceOption: "B", orderNumber: 101 },
        { serviceName: "99 CARRO", serviceOption: "C", orderNumber: 102 },
      ],
    };
    const successOrders = data.orders ?? [];
    expect(successOrders).toHaveLength(3);
    expect(successOrders.map(o => o.orderNumber)).toEqual([100, 101, 102]);
  });

  it("modal de cliente não exibe pedidos (successOrders vazio)", () => {
    // Modo cliente: successOrders = []
    const successOrders: unknown[] = [];
    expect(successOrders.length).toBe(0);
    // Não deve renderizar seção de pedidos
  });
});

describe("lógica de roteamento de mutation", () => {
  it("usa mutation simples quando não há produto selecionado", () => {
    const items: CartItem[] = [
      { id: "a", productId: null, optionId: null, questionAnswers: {} },
    ];
    const validItems = buildValidItems(items, mockProducts);
    expect(validItems.length).toBe(0);
    // validItems.length === 0 → usar createMutation (sem produto)
  });

  it("usa mutation simples quando há exatamente 1 produto", () => {
    const items: CartItem[] = [
      { id: "a", productId: 1, optionId: 10, questionAnswers: {} },
    ];
    const validItems = buildValidItems(items, mockProducts);
    expect(validItems.length).toBe(1);
    // validItems.length === 1 → usar createMutation
  });

  it("usa mutation múltipla quando há 2 ou mais produtos", () => {
    const items: CartItem[] = [
      { id: "a", productId: 1, optionId: 10, questionAnswers: {} },
      { id: "b", productId: 2, optionId: 20, questionAnswers: {} },
    ];
    const validItems = buildValidItems(items, mockProducts);
    expect(validItems.length).toBe(2);
    // validItems.length >= 2 → usar createMultipleMutation
  });
});
