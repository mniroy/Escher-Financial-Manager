import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ExpenseLogger from './components/ExpenseLogger';
import BudgetTable from './components/BudgetTable';
import ChatAssistant from './components/ChatAssistant';
import Login from './components/Login';
import { getExpenses, saveExpense as saveLocalExpense } from './services/storageService';
import { fetchSheetValues, appendSheetRow, parseBudgetFromSheet, parseExpensesFromSheet } from './services/googleSheetsService';
import { Expense, BudgetLineItem, User } from './types';
import { DEFAULT_BUDGET_ITEMS } from './constants';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'log' | 'budget'>('dashboard');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetLineItem[]>(DEFAULT_BUDGET_ITEMS);
  const [loading, setLoading] = useState(false);

  const loadData = async (currentUser: User) => {
    setLoading(true);
    try {
      // Sync Budget
      const budgetData = await fetchSheetValues(currentUser, 'Budget!A:D');
      const parsedBudget = parseBudgetFromSheet(budgetData.values);
      if (parsedBudget.length > 0) {
          setBudgetItems(parsedBudget);
      }

      // Sync Expenses
      const expensesData = await fetchSheetValues(currentUser, 'Expenses!A:F');
      const parsedExpenses = parseExpensesFromSheet(expensesData.values);
      setExpenses(parsedExpenses);

    } catch (error: any) {
      console.error("Sync Error", error);
      if (error.message === 'TOKEN_EXPIRED') {
        alert("Session expired. Please log in again.");
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData(user);
    }
  }, [user]);

  const handleExpenseSave = async (expense: Expense) => {
    if (user) {
       setLoading(true);
       try {
         const row = [
           expense.id,
           expense.date,
           expense.category,
           expense.description,
           expense.amount,
           expense.receiptUrl || ''
         ];
         await appendSheetRow(user, 'Expenses!A:F', row);
         await loadData(user);
       } catch (error: any) {
         console.error("Save Error", error);
         if (error.message === 'TOKEN_EXPIRED') {
            alert("Session expired. Please log in again.");
            setUser(null);
         } else {
            alert("Failed to save to Google Sheet.");
         }
       } finally {
         setLoading(false);
       }
    } else {
       // Fallback logic mostly unreachable if we enforce login, but kept for safety
       saveLocalExpense(expense);
       setExpenses(getExpenses());
    }
  };

  if (!user) {
    return <Login onLoginSuccess={setUser} />;
  }

  if (loading && expenses.length === 0) {
    return (
       <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
             <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-4" />
             <p className="text-gray-600 font-medium">Syncing with your Financial Database...</p>
          </div>
       </div>
    );
  }

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      onRefresh={() => loadData(user)}
      user={user}
      onLogout={() => setUser(null)}
    >
      {activeTab === 'dashboard' && <Dashboard expenses={expenses} budgetItems={budgetItems} onSaveExpense={handleExpenseSave} />}
      {activeTab === 'log' && <ExpenseLogger onSave={(e) => { handleExpenseSave(e); setActiveTab('dashboard'); }} />}
      {activeTab === 'budget' && <BudgetTable budgetItems={budgetItems} />}
      
      {/* Floating Chat Assistant */}
      <ChatAssistant onSaveExpense={handleExpenseSave} />
    </Layout>
  );
}