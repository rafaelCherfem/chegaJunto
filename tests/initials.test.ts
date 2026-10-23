import { describe, expect, it } from "vitest";
import { initials } from "@/utils/initials";

describe("iniciais do avatar", () => {
  it("usa a primeira letra do primeiro e do último nome", () => {
    expect(initials("Ana Paula Souza")).toBe("AS");
  });
  it("ignora conectivos, inclusive no fim do nome", () => {
    expect(initials("Maria da Silva")).toBe("MS");
    expect(initials("João dos")).toBe("J");
  });
  it("nome de uma palavra só tem uma letra", () => {
    expect(initials("Carlos")).toBe("C");
  });
  it("sai sempre em maiúsculas e tolera espaços sobrando", () => {
    expect(initials("  pedro   henrique ")).toBe("PH");
  });
  it("nome vazio ou só com conectivos vira interrogação", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
    expect(initials("de da")).toBe("?");
  });
});
