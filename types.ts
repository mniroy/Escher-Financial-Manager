export enum BudgetCategory {
  AssetAquire = 'Asset Aquire',
  Bill = 'Bill',
  DebtPayment = 'Debt Payment',
  Education = 'Education',
  Food = 'Food',
  Grocery = 'Grocery',
  HomeMaintenance = 'Home Maintenance',
  Mortgage = 'Mortgage',
  Shopping = 'Shopping',
  Tax = 'Tax',
  Transportation = 'Transportation',
  Vacation = 'Vacation',
  Other = 'Other'
}

export interface BudgetLineItem {
  category: string;
  name: string;
  amount: number;
  frequency: 'Monthly' | 'Yearly';
}

export interface BudgetRow {
  category: string;
  monthlyAllocation: number;
  yearlyAllocation: number;
}

export interface Expense {
  id: string;
  date: string; // ISO Date string
  category: string;
  amount: number;
  description: string;
  receiptUrl?: string;
  budgetItemName?: string; // Links to a specific BudgetLineItem name (e.g., "China Trip")
}

export interface ChartDataPoint {
  name: string;
  budget: number;
  spent: number;
}

export interface AnalysisResult {
  amount: number;
  category: string;
  merchant: string;
  date: string;
}

export interface IncomeAnalysisResult {
  date?: string;
  person?: string;
  source: string;
  category: string;
  baseIncome: number;
  allowance: number;
  totalIncome: number;
  deduction: number;
  takeHomePay: number;
  paymentMethod?: string;
}

export interface GoogleSheetsConfig {
  spreadsheetId: string;
}

export interface User {
  name: string;
  email: string;
  picture: string;
  accessToken: string; // OAuth access token
  refreshToken?: string; // Long-lived refresh token
  spreadsheetId?: string;
  tokenExpiry?: number; // Timestamp when the access token expires
}

export interface Notification {
  id: string;
  type: 'receipt' | 'budget-warning' | 'budget-exceeded';
  source: 'app' | 'whatsapp' | 'manual-edit';
  title: string;
  message: string;
  timestamp: string; // ISO date string
  read: boolean;
  expenseId?: string; // link to related expense
  category?: string; // for budget alerts
}

export interface WahaConfig {
  engine?: 'waha' | 'gowa';
  apiUrl: string;
  session: string; // Used for waha session and gowa device id
  allowedIds: string; // Legacy/General allowed IDs
  allowedReceiptSenders?: string; // Comma separated IDs
  allowedIncomeSenders?: string; // Comma separated IDs
  pushSubscription?: any; // To allow the backend to send push notifications
  gowaUsername?: string;
  gowaPassword?: string;
}

export interface IncomeEntry {
  date: string; // ISO Date string
  month: string; // e.g., "2025-07" or "July 2025"
  person: string; // e.g., "Royyan Wicaksono" or "Inez"
  source: string; // e.g., "PT Johnson & Johnson Indonesia"
  category: string; // e.g., "Salary"
  baseIncome: number;
  allowance: number;
  totalIncome: number;
  deduction: number;
  takeHomePay: number;
  paymentMethod?: string;
  id?: string;
}

export interface PeriodMode {
  id: string;
  startDate: string; // ISO Date YYYY-MM-DD
  endDate: string; // ISO Date YYYY-MM-DD
  budgetItemName: string; // Links to BudgetLineItem.name
}