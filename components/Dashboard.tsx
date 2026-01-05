import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { calculateBudgetSummary, formatCurrency } from '../constants';
import { Expense, BudgetLineItem } from '../types';
import { exportToCSV } from '../services/storageService';
import { Download, Calendar, TrendingUp, ChevronLeft, ChevronRight, Camera, X, Plane, CreditCard, AlertTriangle } from 'lucide-react';
import ExpenseLogger from './ExpenseLogger';

interface DashboardProps {
  expenses: Expense[];
  budgetItems: BudgetLineItem[];
  onSaveExpense: (expense: Expense) => void;
  appMode: 'standard' | 'yearly';
  activePlan: string;
  onModeChange: (mode: 'standard' | 'yearly', plan: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
    expenses, 
    budgetItems, 
    onSaveExpense,
    appMode,
    activePlan,
    onModeChange
}) => {
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showLogger, setShowLogger] = useState(false);

  const displayedMonth = selectedDate.getMonth();
  const displayedYear = selectedDate.getFullYear();

  // Filter only Yearly items for the dropdown
  const yearlyBudgetItems = useMemo(() => {
    return budgetItems.filter(item => item.frequency === 'Yearly');
  }, [budgetItems]);

  const activePlanDetails = useMemo(() => {
      return yearlyBudgetItems.find(i => i.name === activePlan);
  }, [activePlan, yearlyBudgetItems]);

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
      
      {/* GLOBAL MODE SELECTOR */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
             <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Expense Logging Context</h2>
          </div>
          <div className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                  {/* Standard Mode Button */}
                  <button 
                      onClick={() => onModeChange('standard', '')}
                      className={`flex-1 p-4 rounded-xl border-2 text-left transition-all ${
                          appMode === 'standard' 
                          ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-200' 
                          : 'border-gray-100 hover:border-gray-200 bg-white'
                      }`}
                  >
                      <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${appMode === 'standard' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                             <CreditCard className="w-6 h-6" />
                          </div>
                          <div>
                              <div className={`font-bold ${appMode === 'standard' ? 'text-indigo-900' : 'text-gray-700'}`}>Standard Monthly</div>
                              <div className="text-xs text-gray-500">Regular daily spending</div>
                          </div>
                          {appMode === 'standard' && (
                              <div className="ml-auto">
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                      Active
                                  </span>
                              </div>
                          )}
                      </div>
                  </button>

                  {/* Yearly Mode Button/Select */}
                  <div className={`flex-1 rounded-xl border-2 transition-all flex flex-col ${
                      appMode === 'yearly' 
                          ? 'border-purple-600 bg-purple-50 ring-1 ring-purple-200' 
                          : 'border-gray-100 hover:border-gray-200 bg-white'
                  }`}>
                      <div 
                        className="flex-1 p-4 cursor-pointer"
                        onClick={() => {
                             if (appMode !== 'yearly') {
                                 // Default to first item if available
                                 const defaultPlan = yearlyBudgetItems[0]?.name || '';
                                 onModeChange('yearly', defaultPlan);
                             }
                        }}
                      >
                          <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-full ${appMode === 'yearly' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                 <Plane className="w-6 h-6" />
                              </div>
                              <div className="flex-grow">
                                  <div className={`font-bold ${appMode === 'yearly' ? 'text-purple-900' : 'text-gray-700'}`}>Event / Trip Mode</div>
                                  <div className="text-xs text-gray-500">Log to a specific yearly plan</div>
                              </div>
                              {appMode === 'yearly' && (
                                  <div className="ml-auto">
                                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                          Active
                                      </span>
                                  </div>
                              )}
                          </div>
                      </div>
                      
                      {/* Dropdown for Yearly Plan */}
                      {appMode === 'yearly' && (
                          <div className="px-4 pb-4 animate-in slide-in-from-top-1">
                              <select 
                                  value={activePlan}
                                  onChange={(e) => onModeChange('yearly', e.target.value)}
                                  className="w-full mt-2 rounded-lg border-purple-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 py-2 px-3 bg-white text-purple-900 font-medium text-sm"
                              >
                                  <option value="">-- Select Active Plan --</option>
                                  {yearlyBudgetItems.map((item, idx) => (
                                      <option key={idx} value={item.name}>{item.name} ({formatCurrency(item.amount)})</option>
                                  ))}
                              </select>
                              {activePlanDetails && (
                                  <div className="mt-2 text-xs text-purple-700 bg-white/50 p-2 rounded border border-purple-200">
                                      Expenses will be logged to category: <strong>{activePlanDetails.category}</strong>
                                  </div>
                              )}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      </div>

      {/* Persistent Mode Banner (Sticky if needed, or just visual reinforcement) */}
      {appMode === 'yearly' && activePlanDetails && (
          <div className="bg-purple-600 text-white p-3 rounded-lg shadow-md flex items-center justify-between animate-in fade-in slide-in-from-top-2">
               <div className="flex items-center gap-2">
                   <Plane className="w-5 h-5 animate-pulse" />
                   <span className="font-medium text-sm">
                       Currently logging all expenses to: <strong>{activePlanDetails.name}</strong>
                   </span>
               </div>
               <button 
                  onClick={() => onModeChange('standard', '')}
                  className="bg-white/20 hover:bg-white/30 p-1.5 rounded-full transition-colors"
                  title="Switch back to Standard Mode"
               >
                   <X className="w-4 h-4" />
               </button>
          </div>
      )}


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
             <ExpenseLogger 
                onSave={(e) => {
                    onSaveExpense(e);
                    setShowLogger(false);
                }} 
                budgetItems={budgetItems}
                appMode={appMode}
                activePlan={activePlan}
                onModeChange={onModeChange}
             />
           </div>
        </div>
      ) : (
        <button
          onClick={() => setShowLogger(true)}
          className={`w-full p-5 rounded-xl shadow-md flex items-center justify-center gap-3 text-xl font-bold transition-all transform hover:scale-[1.01] ${
              appMode === 'yearly' 
              ? 'bg-purple-600 hover:bg-purple-700 text-white' 
              : 'bg-emerald-500 hover:bg-emerald-600 text-white'
          }`}
        >
          <Camera className="w-8 h-8" />
          {appMode === 'yearly' && activePlanDetails 
             ? `Log to ${activePlanDetails.name}` 
             : "Input Expense"}
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
                                {expense.budgetItemName && (
                                    <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold border border-purple-100">
                                        {expense.budgetItemName}
                                    </span>
                                )}
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
                        <div className="flex flex-col items-start gap-1">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {expense.category}
                            </span>
                            {expense.budgetItemName && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800">
                                    {expense.budgetItemName}
                                </span>
                            )}
                        </div>
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