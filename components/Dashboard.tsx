import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { calculateBudgetSummary, formatCurrency } from '../constants';
import { Expense, BudgetLineItem } from '../types';
import { exportToCSV } from '../services/storageService';
import { Download, Calendar, TrendingUp, ChevronLeft, ChevronRight, Camera, X } from 'lucide-react';
import ExpenseLogger from './ExpenseLogger';

interface DashboardProps {
  expenses: Expense[];
  budgetItems: BudgetLineItem[];
  onSaveExpense: (expense: Expense) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ expenses, budgetItems, onSaveExpense }) => {
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showLogger, setShowLogger] = useState(false);

  const displayedMonth = selectedDate.getMonth();
  const displayedYear = selectedDate.getFullYear();

  // Navigation handlers
  const handlePrev = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'monthly') {
        d.setMonth(d.getMonth() - 1);
      } else {
        d.setFullYear(d.getFullYear() - 1);
      }
      return d;
    });
  };

  const handleNext = () => {
    setSelectedDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'monthly') {
        d.setMonth(d.getMonth() + 1);
      } else {
        d.setFullYear(d.getFullYear() + 1);
      }
      return d;
    });
  };

  const dateLabel = useMemo(() => {
    if (viewMode === 'monthly') {
      return selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    }
    return `Year ${displayedYear}`;
  }, [viewMode, selectedDate, displayedYear]);

  // Filter expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const d = new Date(e.date);
      if (viewMode === 'monthly') {
        return d.getMonth() === displayedMonth && d.getFullYear() === displayedYear;
      } else {
        return d.getFullYear() === displayedYear;
      }
    });
  }, [expenses, viewMode, displayedMonth, displayedYear]);

  // Calculate Chart Data based on view mode and current budgetItems
  const chartData = useMemo(() => {
    const budgetSummary = calculateBudgetSummary(budgetItems);

    return budgetSummary.map(row => {
      let budget = 0;
      let spent = 0;

      if (viewMode === 'monthly') {
        // In monthly mode, we only care about monthly allocations
        budget = row.monthlyAllocation;
        spent = filteredExpenses
          .filter(e => e.category === row.category)
          .reduce((sum, e) => sum + e.amount, 0);
      } else {
        // In yearly mode, we care about (Monthly * 12) + Yearly Allocation
        budget = (row.monthlyAllocation * 12) + row.yearlyAllocation;
        spent = filteredExpenses
          .filter(e => e.category === row.category)
          .reduce((sum, e) => sum + e.amount, 0);
      }

      return {
        category: row.category,
        budget,
        spent,
        remaining: budget - spent
      };
    }).filter(item => item.budget > 0 || item.spent > 0); 
  }, [viewMode, filteredExpenses, budgetItems]);

  const totalSpent = chartData.reduce((acc, curr) => acc + curr.spent, 0);
  const totalBudget = chartData.reduce((acc, curr) => acc + curr.budget, 0);
  const totalRemaining = totalBudget - totalSpent;

  return (
    <div className="space-y-6">
      {/* Quick Action: Log Expense */}
      {showLogger ? (
        <div className="bg-white rounded-xl shadow-lg border-2 border-indigo-100 overflow-hidden relative animate-in fade-in slide-in-from-top-4 duration-300">
           <div className="absolute top-4 right-4 z-10">
              <button 
                onClick={() => setShowLogger(false)}
                className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
           </div>
           <div className="p-2">
             <ExpenseLogger onSave={(e) => {
               onSaveExpense(e);
               setShowLogger(false);
             }} />
           </div>
        </div>
      ) : (
        <button
          onClick={() => setShowLogger(true)}
          className="w-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white p-5 rounded-xl shadow-md flex items-center justify-center gap-3 text-xl font-bold transition-all transform hover:scale-[1.01]"
        >
          <Camera className="w-8 h-8" />
          Input Expense
        </button>
      )}

      {/* View Toggle & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="w-full md:w-auto flex items-center justify-between gap-4">
           {/* Date Navigation */}
           <div className="flex items-center justify-between w-full md:w-auto bg-gray-50 rounded-lg p-1 border border-gray-200">
              <button onClick={handlePrev} className="p-2 hover:bg-gray-200 rounded-md transition-colors">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="px-4 py-1 min-w-[120px] text-center font-bold text-gray-800 text-sm md:text-base">
                {dateLabel}
              </div>
              <button onClick={handleNext} className="p-2 hover:bg-gray-200 rounded-md transition-colors">
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
           </div>
        </div>
        
        <div className="w-full md:w-auto bg-gray-100 p-1 rounded-lg flex shadow-inner">
          <button
            onClick={() => setViewMode('monthly')}
            className={`flex-1 md:flex-none justify-center px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${
              viewMode === 'monthly' 
                ? 'bg-white text-indigo-700 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Monthly
          </button>
          <button
            onClick={() => setViewMode('yearly')}
            className={`flex-1 md:flex-none justify-center px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${
              viewMode === 'yearly' 
                ? 'bg-white text-indigo-700 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Yearly
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-row md:flex-col justify-between items-center md:items-start">
          <p className="text-sm text-gray-500 font-medium">{viewMode === 'monthly' ? 'Budget' : 'Annual Budget'}</p>
          <h3 className="text-xl md:text-2xl font-bold text-emerald-600">{formatCurrency(totalBudget)}</h3>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-row md:flex-col justify-between items-center md:items-start">
          <p className="text-sm text-gray-500 font-medium">Spent</p>
          <h3 className="text-xl md:text-2xl font-bold text-gray-900">
            {formatCurrency(totalSpent)}
          </h3>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
           <div>
              <p className="text-sm text-gray-500 font-medium">Remaining</p>
              <h3 className={`text-xl md:text-2xl font-bold ${totalRemaining < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                {formatCurrency(totalRemaining)}
              </h3>
           </div>
           <button 
            onClick={exportToCSV}
            className="p-3 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
            title="Export to CSV"
           >
             <Download className="w-5 h-5 text-gray-600" />
           </button>
        </div>
      </div>

      {/* Main Chart */}
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold mb-6">Spending vs Budget</h3>
        <div className="h-[300px] md:h-[500px] w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} stroke="#f0f0f0" />
                <XAxis type="number" hide />
                <YAxis 
                  type="category" 
                  dataKey="category" 
                  width={80} 
                  tick={{fontSize: 10, fill: '#4b5563'}}
                  interval={0}
                />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  cursor={{fill: '#f9fafb'}}
                />
                <Legend wrapperStyle={{paddingTop: '20px', fontSize: '12px'}} />
                {/* Budget is Green, Spent is Black */}
                <Bar dataKey="budget" name="Budget" fill="#10b981" radius={[0, 4, 4, 0]} barSize={15} />
                <Bar dataKey="spent" name="Spent" fill="#000000" radius={[0, 4, 4, 0]} barSize={15} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-2">
              <TrendingUp className="w-12 h-12 opacity-20" />
              <p className="font-medium text-center">No budget data available</p>
              <p className="text-xs text-center">Configure Google Sheets in Settings to load your plan</p>
            </div>
          )}
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold">Transactions ({dateLabel})</h3>
        </div>
        
        {/* Mobile View: Card List */}
        <div className="md:hidden">
            {filteredExpenses.length === 0 ? (
                 <div className="p-6 text-center text-gray-500 text-sm">No expenses found for {dateLabel}.</div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {filteredExpenses
                        .slice()
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((expense) => (
                        <div key={expense.id} className="p-4 flex flex-col gap-2">
                            <div className="flex justify-between items-start">
                                <span className="font-semibold text-gray-900">{expense.description}</span>
                                <span className="font-bold text-gray-900">{formatCurrency(expense.amount)}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-gray-500">
                                <div className="flex items-center gap-2">
                                    <span>{expense.date}</span>
                                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                                        {expense.category}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredExpenses.length === 0 ? (
                <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No expenses found for {dateLabel}.</td>
                </tr>
              ) : (
                filteredExpenses
                  .slice()
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((expense) => (
                    <tr key={expense.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{expense.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {expense.category}
                        </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{expense.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                        {formatCurrency(expense.amount)}
                    </td>
                    </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;