import { BudgetCategory, BudgetRow, BudgetLineItem } from './types';

// Default budget items are cleared for privacy and GitHub availability.
// To populate this data, please connect your Google Sheet via the Settings tab.
export const DEFAULT_BUDGET_ITEMS: BudgetLineItem[] = [];

export const calculateBudgetSummary = (items: BudgetLineItem[]): BudgetRow[] => {
  return Object.values(BudgetCategory).map(cat => {
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