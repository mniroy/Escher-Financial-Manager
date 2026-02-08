import { BudgetCategory, BudgetRow, BudgetLineItem } from './types';

// Default budget items populated from the user's initial plan.
// Monthly items are calculated by dividing the Annual Total from the plan by 12.
export const DEFAULT_BUDGET_ITEMS: BudgetLineItem[] = [
  { category: BudgetCategory.AssetAquire, name: 'Asset Acquisition', amount: 150000000, frequency: 'Yearly' },
  { category: BudgetCategory.Bill, name: 'General Bills', amount: 4180000, frequency: 'Monthly' }, // 50,160,000 / 12
  { category: BudgetCategory.DebtPayment, name: 'Debt Repayment', amount: 210000000, frequency: 'Yearly' },
  { category: BudgetCategory.Education, name: 'Education Fund', amount: 10000000, frequency: 'Yearly' },
  { category: BudgetCategory.Food, name: 'Food & Dining', amount: 7000000, frequency: 'Monthly' }, // 84,000,000 / 12
  { category: BudgetCategory.Grocery, name: 'Groceries', amount: 2000000, frequency: 'Monthly' }, // 24,000,000 / 12
  { category: BudgetCategory.HomeMaintenance, name: 'Home Maintenance', amount: 1600000, frequency: 'Monthly' }, // 19,200,000 / 12
  { category: BudgetCategory.Mortgage, name: 'Mortgage Payment', amount: 24000000, frequency: 'Monthly' }, // 288,000,000 / 12
  { category: BudgetCategory.Shopping, name: 'Shopping', amount: 2000000, frequency: 'Monthly' }, // 24,000,000 / 12
  { category: BudgetCategory.Tax, name: 'Tax Obligations', amount: 18000000, frequency: 'Yearly' },
  { category: BudgetCategory.Transportation, name: 'Transportation', amount: 3000000, frequency: 'Monthly' }, // 36,000,000 / 12
  { category: BudgetCategory.Vacation, name: 'Vacation Fund (Monthly)', amount: 1666667, frequency: 'Monthly' }, // 20,000,000 / 12
  { category: BudgetCategory.Vacation, name: 'Vacation (Yearly Plan)', amount: 150000000, frequency: 'Yearly' },
];

export const calculateBudgetSummary = (items: BudgetLineItem[]): BudgetRow[] => {
  // Get all unique categories from items and default categories
  const defaultCategories = Object.values(BudgetCategory) as string[];
  const itemCategories = items.map(i => i.category);
  const allCategories = Array.from(new Set([...defaultCategories, ...itemCategories]));

  return allCategories.map(cat => {
    const catItems = items.filter(item => item.category === cat);

    const monthlyAllocation = catItems
      .filter(item => item.frequency === 'Monthly')
      .reduce((sum, item) => sum + item.amount, 0);

    const yearlyAllocation = catItems
      .filter(item => item.frequency === 'Yearly')
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      category: cat,
      monthlyAllocation,
      yearlyAllocation
    };
  });
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};