import { Prisma } from "@prisma/client";

export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;
export type DecimalValue = Prisma.Decimal.Value;

export function D(value: DecimalValue | null | undefined): Decimal {
  if (value == null || value === "") return new Decimal(0);
  try {
    return value instanceof Decimal ? value : new Decimal(value);
  } catch {
    return new Decimal(0);
  }
}

export function add(...values: Array<DecimalValue | null | undefined>): Decimal {
  return values.reduce<Decimal>((acc, value) => acc.add(D(value)), new Decimal(0));
}

export function sub(a: DecimalValue | null | undefined, b: DecimalValue | null | undefined): Decimal {
  return D(a).sub(D(b));
}

export function mul(a: DecimalValue | null | undefined, b: DecimalValue | null | undefined): Decimal {
  return D(a).mul(D(b));
}

export function div(a: DecimalValue | null | undefined, b: DecimalValue | null | undefined): Decimal {
  const den = D(b);
  if (den.isZero()) return new Decimal(0);
  return D(a).div(den);
}

export function pct(part: DecimalValue | null | undefined, total: DecimalValue | null | undefined): Decimal {
  return mul(div(part, total), 100);
}

export function roundMoney(value: DecimalValue | null | undefined, dp = 2): Decimal {
  return D(value).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP);
}

export function roundQty(value: DecimalValue | null | undefined, dp = 4): Decimal {
  return D(value).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP);
}

export function toJsonNumber(value: Decimal): string {
  return value.toFixed();
}

export function calcularItem(quantidade: DecimalValue, custoUnitario: DecimalValue): Decimal {
  return roundMoney(mul(quantidade, custoUnitario));
}
