import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ExpenseLogger from './components/ExpenseLogger';
import BudgetTable from './components/BudgetTable';
import Settings from './components/Settings';
import ChatAssistant from './components/ChatAssistant';
import { getExpenses, saveExpense as saveLocalExpense } from './services/storageService';
import { fetchSheetValues, appendSheetRow, parseBudgetFromSheet, parseExpensesFromSheet } from './services/googleSheetsService';
import { Expense, BudgetLineItem, GoogleSheetsConfig } from './types';
import { DEFAULT_BUDGET_ITEMS } from './constants';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'log' | 'budget' | 'settings'>('dashboard');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetLineItem[]>(DEFAULT_BUDGET_ITEMS);
  const [loading, setLoading] = useState(false);
  const [sheetsConfig, setSheetsConfig] = useState<GoogleSheetsConfig | null>(() => {
    const stored = localStorage.getItem('google_sheets_config');
    return stored ? JSON.parse(stored) : null;
  });

  const loadData = async () => {
    if (sheetsConfig) {
      setLoading(true);
      try {
        // Sync Budget
        const budgetData = await fetchSheetValues(sheetsConfig, 'Budget!A:D');
        const parsedBudget = parseBudgetFromSheet(budgetData.values);
        if (parsedBudget.length > 0) {
           setBudgetItems(parsedBudget);
        }

        // Sync Expenses
        const expensesData = await fetchSheetValues(sheetsConfig, 'Expenses!A:F');
        const parsedExpenses = parseExpensesFromSheet(expensesData.values);
        setExpenses(parsedExpenses);

      } catch (error) {
        console.error("Failed to sync with Google Sheets", error);
        // Silent fail on refresh to not annoy user, just log
        if (expenses.length === 0) {
             alert("Failed to sync with Google Sheets. Check your Settings/Token. Falling back to local data.");
        }
        setExpenses(getExpenses()); // Fallback
      } finally {
        setLoading(false);
      }
    } else {
      // Local Mode
      setExpenses(getExpenses());
      setBudgetItems(DEFAULT_BUDGET_ITEMS);
    }
  };

  useEffect(() => {
    loadData();
  }, [sheetsConfig]);

  const handleExpenseSave = async (expense: Expense) => {
    if (sheetsConfig) {
       // Save to Sheets
       setLoading(true);
       try {
         // Headers: ID, Date, Category, Description, Amount, ReceiptUrl
         const row = [
           expense.id,
           expense.date,
           expense.category,
           expense.description,
           expense.amount,
           expense.receiptUrl || ''
         ];
         await appendSheetRow(sheetsConfig, 'Expenses!A:F', row);
         // Refresh to get latest
         await loadData();
       } catch (error) {
         console.error("Failed to save to sheet", error);
         alert("Failed to save to Google Sheet. Please check your connection.");
       } finally {
         setLoading(false);
         // Stay on dashboard if called from there (handled by activeTab state not changing if already 'dashboard')
       }
    } else {
      // Save Local
      saveLocalExpense(expense);
      loadData();
    }
  };

  const handleConfigSave = (config: GoogleSheetsConfig | null) => {
    if (config) {
      localStorage.setItem('google_sheets_config', JSON.stringify(config));
    } else {
      localStorage.removeItem('google_sheets_config');
    }
    setSheetsConfig(config);
    setActiveTab('dashboard');
  };

  if (loading && expenses.length === 0) {
    return (
       <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
             <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-4" />
             <p className="text-gray-600 font-medium">Syncing with Google Sheets...</p>
          </div>
       </div>
    );
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} onRefresh={loadData}>
      {activeTab === 'dashboard' && <Dashboard expenses={expenses} budgetItems={budgetItems} onSaveExpense={handleExpenseSave} />}
      {activeTab === 'log' && <ExpenseLogger onSave={(e) => { handleExpenseSave(e); setActiveTab('dashboard'); }} />}
      {activeTab === 'budget' && <BudgetTable budgetItems={budgetItems} />}
      {activeTab === 'settings' && <Settings onSave={handleConfigSave} currentConfig={sheetsConfig} />}
      
      {/* Floating Chat Assistant */}
      <ChatAssistant onSaveExpense={handleExpenseSave} />
    </Layout>
  );
}