/** A teaching model, not a platform tariff, financial forecast or net profit. */
export function calculateEconomics(input = {}) {
  const number = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };
  const price = number(input.price);
  const cost = number(input.cost);
  const orders = number(input.orders);
  const redemptionRate = Math.min(100, number(input.redemptionRate)) / 100;
  const feeRate = Math.min(100, number(input.feeRate)) / 100;
  const fixed = number(input.marketing) + number(input.operations);
  const redeemed = orders * redemptionRate;
  const revenue = redeemed * price;
  const unitContribution = price * (1 - feeRate) - cost;
  const contribution = redeemed * unitContribution - fixed;
  const breakEvenOrders =
    unitContribution > 0 && redemptionRate > 0
      ? Math.ceil(fixed / unitContribution / redemptionRate)
      : null;
  return { redeemed, revenue, contribution, breakEvenOrders, unitContribution };
}
