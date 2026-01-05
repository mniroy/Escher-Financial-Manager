import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ExpenseLogger from './components/ExpenseLogger';
import BudgetTable from './components/BudgetTable';
import ChatAssistant from './components/ChatAssistant';
import Login from './components/Login';
import { getExpenses, saveExpense as saveLocalExpense } from './services/storageService';
import { fetchSheetValues, appendSheetRow, parseBudgetFromSheet, parseExpensesFromSheet, saveBudgetToSheet } from './services/googleSheetsService';
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
      // Even if empty, we set it so we can see an empty table
      setBudgetItems(parsedBudget);

      // Sync Expenses
      const expensesData = await fetchSheetValues(currentUser, 'Expenses!A:G'); // Extended range for budgetItemName
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
           expense.receiptUrl || '',
           expense.budgetItemName || '' // Save the linked plan name
         ];
         await appendSheetRow(user, 'Expenses!A:G', row);
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
       // Fallback logic
       saveLocalExpense(expense);
       setExpenses(getExpenses());
    }
  };

  const handleBudgetUpdate = async (newBudgetItems: BudgetLineItem[]) => {
      if (!user) return;
      setLoading(true);
      try {
          // Optimistic update
          setBudgetItems(newBudgetItems);
          await saveBudgetToSheet(user, newBudgetItems);
      } catch (error: any) {
          console.error("Budget Save Error", error);
          if (error.message === 'TOKEN_EXPIRED') {
            alert("Session expired. Please log in again.");
            setUser(null);
         } else {
            alert("Failed to update budget in Google Sheets.");
            // Revert changes by reloading
            loadData(user);
         }
      } finally {
          setLoading(false);
      }
  };

  if (!user) {
    return <Login onLoginSuccess={setUser} />;
  }

  if (loading && expenses.length === 0 && budgetItems.length === 0) {
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
      {activeTab === 'dashboard' && (
        <Dashboard 
            expenses={expenses} 
            budgetItems={budgetItems} 
            onSaveExpense={handleExpenseSave} 
        />
      )}
      {activeTab === 'log' && (
        <ExpenseLogger 
            onSave={(e) => { handleExpenseSave(e); setActiveTab('dashboard'); }} 
            budgetItems={budgetItems} // Pass budget items here
        />
      )}
      {activeTab === 'budget' && <BudgetTable budgetItems={budgetItems} onUpdateBudget={handleBudgetUpdate} />}
      
      {/* Floating Chat Assistant */}
      <ChatAssistant onSaveExpense={handleExpenseSave} />
    </Layout>
  );
}