import { Expense } from '../types';

const STORAGE_KEY = 'budget_app_expenses';

export const getExpenses = (): Expense[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse expenses", e);
    return [];
  }
};

export const saveExpense = (expense: Expense): void => {
  const expenses = getExpenses();
  expenses.push(expense);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
};

export const deleteExpense = (id: string): void => {
  const expenses = getExpenses();
  const filtered = expenses.filter(e => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
};

export const exportToCSV = (): void => {
  const expenses = getExpenses();
  if (expenses.length === 0) return;

  const headers = ['Date', 'Category', 'Description', 'Amount', 'ID'];
  const csvContent = [
    headers.join(','),
    ...expenses.map(e => `${e.date},"${e.category}","${e.description}",${e.amount},${e.id}`)
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'expenses_log.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
