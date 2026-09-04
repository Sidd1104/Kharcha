/**
 * Debt-simplification / settlement algorithm.
 *
 * Given each participant's net balance in a group (positive = they are owed
 * money, negative = they owe money), this computes the MINIMUM number
 * of transactions required to settle all debts — instead of everyone
 * paying back everyone individually.
 *
 * Approach: greedy matching. Repeatedly match the person who is owed
 * the most with the person who owes the most, settle as much as
 * possible between them, and repeat until everyone's balance is ~0.
 *
 * This is the standard greedy solution to the "optimal account
 * balancing" problem and produces a minimal (though not always
 * provably optimal in every edge case) transaction count in
 * near-linear time relative to the number of participants.
 */

const EPSILON = 0.01; // treat balances smaller than this as settled (avoids floating point noise)

/**
 * @param {Array<{ participantId: number|string, balance: number }>} balances
 *   Net balance per participant. Positive = owed to them, negative = they owe.
 * @returns {Array<{ from: number|string, to: number|string, amount: number }>}
 *   Minimal list of transactions that settle the group.
 */
function computeSettlements(balances) {
  // Work on a copy, rounded to 2 decimal places (currency-safe)
  const people = balances
    .map((b) => ({ participantId: b.participantId, balance: Math.round(b.balance * 100) / 100 }))
    .filter((b) => Math.abs(b.balance) > EPSILON);

  const transactions = [];

  while (people.length > 0) {
    // Sort so the biggest creditor (most owed) and biggest debtor (owes most) are at the ends
    people.sort((a, b) => a.balance - b.balance);

    const debtor = people[0];             // most negative balance
    const creditor = people[people.length - 1]; // most positive balance

    if (debtor.balance >= -EPSILON || creditor.balance <= EPSILON) {
      break; // No valid debtors or creditors left to settle
    }

    const amount = Math.min(-debtor.balance, creditor.balance);
    const roundedAmount = Math.round(amount * 100) / 100;

    transactions.push({
      from: debtor.participantId,
      to: creditor.participantId,
      amount: roundedAmount,
    });

    debtor.balance += roundedAmount;
    creditor.balance -= roundedAmount;

    // Remove anyone now settled
    people.splice(
      0,
      people.length,
      ...people.filter((p) => Math.abs(p.balance) > EPSILON)
    );
  }

  return transactions;
}

/**
 * Computes each participant's net balance in a group from raw expense + split rows.
 *
 * @param {Array<{ participant_id: number, amount: number }>} expenses
 *   Each expense row with the paying participant_id and amount.
 * @param {Array<{ participant_id: number, share_amount: number }>} splits
 *   Each split row with the owing participant_id and share_amount.
 * @returns {Map<number, number>} participantId -> net balance
 */
function computeBalances(expenses, splits) {
  const balances = new Map();

  const addBalance = (participantId, delta) => {
    balances.set(participantId, Math.round(((balances.get(participantId) || 0) + delta) * 100) / 100);
  };

  // Whoever paid gets credited the full amount
  for (const expense of expenses) {
    addBalance(expense.participant_id, Number(expense.amount));
  }

  // Whoever owes a share gets debited that share
  for (const split of splits) {
    addBalance(split.participant_id, -Number(split.share_amount));
  }

  return balances;
}

module.exports = { computeSettlements, computeBalances };
