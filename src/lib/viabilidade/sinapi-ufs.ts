/** 27 UFs brasileiras — ordem alfabética pelo nome, com a UF do estudo à frente na UI. */
export const UFS_BRASIL = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export type UfBrasil = (typeof UFS_BRASIL)[number];

export function isUfBrasil(value: string): value is UfBrasil {
  return (UFS_BRASIL as readonly string[]).includes(value.toUpperCase());
}

export function ordenarUfsComPrioridade(prioridade?: string | null): string[] {
  const first = prioridade?.trim().toUpperCase();
  if (!first || !isUfBrasil(first)) return [...UFS_BRASIL];
  return [first, ...UFS_BRASIL.filter((uf) => uf !== first)];
}
