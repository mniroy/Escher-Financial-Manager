import { Expense, User, PeriodMode } from '../types';

const STORAGE_KEY = 'budget_app_expenses';
const USER_SESSION_KEY = 'escher_user_session';
const APP_MODE_KEY = 'escher_app_mode';

// --- Expenses Storage ---

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

// --- User Session Storage ---

export const saveUserSession = (user: User): void => {
  localStorage.setItem(USER_SESSION_KEY, JSON.stringify(user));
};

export const getUserSession = (): User | null => {
  const stored = localStorage.getItem(USER_SESSION_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse user session", e);
    localStorage.removeItem(USER_SESSION_KEY);
    return null;
  }
};

export const clearUserSession = (): void => {
  localStorage.removeItem(USER_SESSION_KEY);
  localStorage.removeItem(APP_MODE_KEY);
};

// --- App Mode Storage ---

export const saveAppMode = (mode: 'standard' | 'yearly', planName: string) => {
  localStorage.setItem(APP_MODE_KEY, JSON.stringify({ mode, planName }));
};

export const getAppMode = (): { mode: 'standard' | 'yearly', planName: string } => {
  const stored = localStorage.getItem(APP_MODE_KEY);
  if (!stored) return { mode: 'standard', planName: '' };
  try {
    return JSON.parse(stored);
  } catch {
  }
};

// --- Period Mode Storage ---

const PERIOD_MODES_KEY = 'escher_period_modes';

export const getPeriodModes = (): PeriodMode[] => {
  const stored = localStorage.getItem(PERIOD_MODES_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
};

export const savePeriodModes = (modes: PeriodMode[]): void => {
  localStorage.setItem(PERIOD_MODES_KEY, JSON.stringify(modes));
};
