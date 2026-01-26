import React, { useMemo, useState, useEffect } from 'react';
import { calculateBudgetSummary, formatCurrency } from '../constants';
import { Expense, BudgetLineItem, User } from '../types';
import { Calendar, TrendingUp, ChevronLeft, ChevronRight, ChevronDown, Plane, Receipt, Wallet, CalendarDays, BarChart3, Tag, PieChart, ArrowUp, ArrowDown } from 'lucide-react';

// Royalty-free landscape photos from Unsplash - direct CDN links for reliability
const LANDSCAPE_BACKGROUNDS = [
  'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1555400038-63f5ba517a47?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1604999333679-b86d54738315?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1528127269322-539801943592?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1557750255-c76072a7aad1?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1513415564515-763d91423bdd?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1596402184320-417e7178b2cd?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1588668214407-6ea9a6d8c272?w=800&h=600&fit=crop&q=80',
  'https://images.unsplash.com/photo-1565967511849-76a60a516170?w=800&h=600&fit=crop&q=80',
];

const getRandomBackgroundImage = (): string => {
  const imageIndex = Math.floor(Math.random() * LANDSCAPE_BACKGROUNDS.length);
  return LANDSCAPE_BACKGROUNDS[imageIndex];
};

interface DashboardProps {
  expenses: Expense[];
  budgetItems: BudgetLineItem[];
  user: User;
}

const Dashboard: React.FC<DashboardProps> = ({
  expenses,
  budgetItems,
  user
}) => {
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly-only' | 'yearly'>('monthly');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedAnnualPlan, setSelectedAnnualPlan] = useState<string | null>(null);

  const yearlyItems = useMemo(() => {
    return budgetItems.filter(item => item.frequency === 'Yearly');
  }, [budgetItems]);

  useEffect(() => {
    if (viewMode === 'yearly-only' && yearlyItems.length > 0 && !selectedAnnualPlan) {
      setSelectedAnnualPlan(yearlyItems[0].name);
    }
  }, [viewMode, yearlyItems, selectedAnnualPlan]);

  const displayedMonth = selectedDate.getMonth();
  const displayedYear = selectedDate.getFullYear();

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
    if (viewMode === 'yearly-only') {
      return `Annual Events ${displayedYear}`;
    }
    return `Year ${displayedYear}`;
  }, [viewMode, selectedDate, displayedYear]);

  const yearlyBudgetItemNames = useMemo(() => {
    return new Set(budgetItems.filter(item => item.frequency === 'Yearly').map(item => item.name));
  }, [budgetItems]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const d = new Date(e.date);
      const yearMatch = d.getFullYear() === displayedYear;

      if (viewMode === 'monthly') {
        const isYearlyExpense = e.budgetItemName && yearlyBudgetItemNames.has(e.budgetItemName);
        return d.getMonth() === displayedMonth && yearMatch && !isYearlyExpense;
      } else if (viewMode === 'yearly-only') {
        return yearMatch && e.budgetItemName && yearlyBudgetItemNames.has(e.budgetItemName);
      } else {
        return yearMatch;
      }
    });
  }, [expenses, viewMode, displayedMonth, displayedYear, yearlyBudgetItemNames]);

  const chartData = useMemo(() => {
    if (viewMode === 'yearly-only') {
      const yearlyItems = budgetItems.filter(item => item.frequency === 'Yearly');
      return yearlyItems.map(item => {
        const spent = filteredExpenses
          .filter(e => e.budgetItemName === item.name)
          .reduce((sum, e) => sum + e.amount, 0);
        return {
          category: item.name,
          budget: item.amount,
          spent,
          remaining: item.amount - spent
        };
      }).filter(item => item.budget > 0 || item.spent > 0);
    }

    const budgetSummary = calculateBudgetSummary(budgetItems);

    return budgetSummary.map(row => {
      let budget = 0;
      let spent = 0;

      if (viewMode === 'monthly') {
        budget = row.monthlyAllocation;
        spent = filteredExpenses
          .filter(e => e.category === row.category)
          .reduce((sum, e) => sum + e.amount, 0);
      } else {
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

  const periodStats = useMemo(() => {
    const periodExpenses = viewMode === 'monthly'
      ? expenses.filter(e => {
        const d = new Date(e.date);
        const isYearlyExpense = e.budgetItemName && yearlyBudgetItemNames.has(e.budgetItemName);
        return d.getMonth() === displayedMonth && d.getFullYear() === displayedYear && !isYearlyExpense;
      })
      : viewMode === 'yearly-only'
        ? expenses.filter(e => {
          const d = new Date(e.date);
          return d.getFullYear() === displayedYear && e.budgetItemName && yearlyBudgetItemNames.has(e.budgetItemName);
        })
        : expenses.filter(e => {
          const d = new Date(e.date);
          return d.getFullYear() === displayedYear;
        });

    const totalReceipts = periodExpenses.length;
    const now = new Date();
    let daysInPeriod = 1;
    if (viewMode === 'monthly') {
      if (displayedMonth === now.getMonth() && displayedYear === now.getFullYear()) {
        daysInPeriod = now.getDate();
      } else {
        daysInPeriod = new Date(displayedYear, displayedMonth + 1, 0).getDate();
      }
    } else {
      if (displayedYear === now.getFullYear()) {
        const startOfYear = new Date(displayedYear, 0, 1);
        daysInPeriod = Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
      } else {
        daysInPeriod = 365;
      }
    }

    const totalSpent = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
    const avgDailySpend = daysInPeriod > 0 ? totalSpent / daysInPeriod : 0;

    const nonYearlyExpenses = expenses.filter(e => {
      const isYearlyExpense = e.budgetItemName && yearlyBudgetItemNames.has(e.budgetItemName);
      return !isYearlyExpense;
    });
    const allMonths = new Set(nonYearlyExpenses.map(e => {
      const d = new Date(e.date);
      return `${d.getFullYear()}-${d.getMonth()}`;
    }));
    const monthCount = Math.max(allMonths.size, 1);
    const avgMonthlySpend = nonYearlyExpenses.reduce((sum, e) => sum + e.amount, 0) / monthCount;

    const categoryTotals: Record<string, number> = {};
    periodExpenses.forEach(e => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
    });

    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    const topCategoryName = topCategory ? topCategory[0] : '-';

    return {
      totalReceipts,
      avgDailySpend,
      avgMonthlySpend,
      topCategoryName,
    };
  }, [expenses, yearlyBudgetItemNames, viewMode, displayedMonth, displayedYear]);

  return (
    <div className="flex flex-col gap-4 p-4 flex-1 md:p-6 lg:max-w-full">

      {/* Grid Container for Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">

        {/* --- HEADER / CONTROLS (Spans Full) --- */}
        <div className="lg:col-span-3 bg-white p-2 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Date Navigation */}
          <div className="flex items-center w-full sm:w-auto bg-gray-50 rounded-lg border border-gray-200">
            <button onClick={handlePrev} className="p-2 hover:bg-gray-200 rounded-l-md flex-1 sm:flex-none flex justify-center">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="px-4 py-2 min-w-[140px] text-center font-bold text-gray-800 text-sm">
              {dateLabel}
            </div>
            <button onClick={handleNext} className="p-2 hover:bg-gray-200 rounded-r-md flex-1 sm:flex-none flex justify-center">
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* View Toggle */}
          <div className="w-full sm:w-auto bg-gray-100 p-1 rounded-lg flex shadow-inner">
            {(['monthly', 'yearly-only', 'yearly'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${viewMode === mode
                  ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {mode === 'monthly' && <Calendar className="w-3.5 h-3.5" />}
                {mode === 'yearly-only' && <Plane className="w-3.5 h-3.5" />}
                {mode === 'yearly' && <TrendingUp className="w-3.5 h-3.5" />}
                <span className="capitalize">{mode === 'yearly-only' ? 'Annual Events' : mode}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Annual Plan Selector (Conditional) */}
        {viewMode === 'yearly-only' && yearlyItems.length > 0 && (
          <div className="lg:col-span-3 bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
              <Plane className="w-5 h-5" />
            </div>
            <select
              value={selectedAnnualPlan || ''}
              onChange={(e) => setSelectedAnnualPlan(e.target.value)}
              className="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 hover:border-purple-400 transition-colors cursor-pointer"
            >
              {yearlyItems.map(item => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* --- LEFT COL: BALANCE CARD (Spans 2 on Desktop) --- */}
        <div className="lg:col-span-2">
          {(() => {
            let cardBudget = totalBudget;
            let cardSpent = totalSpent;
            let cardRemaining = totalRemaining;

            if (viewMode === 'yearly-only' && selectedAnnualPlan) {
              const selectedItem = yearlyItems.find(item => item.name === selectedAnnualPlan);
              cardBudget = selectedItem?.amount || 0;
              cardSpent = filteredExpenses
                .filter(e => e.budgetItemName === selectedAnnualPlan)
                .reduce((sum, e) => sum + e.amount, 0);
              cardRemaining = cardBudget - cardSpent;
            }

            return (
              <div
                className="h-full rounded-2xl p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-center min-h-[200px]"
                style={{
                  backgroundImage: `url(${getRandomBackgroundImage()})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-gray-900/80 via-gray-900/50 to-gray-900/70" />

                <div className="relative z-10 w-full max-w-lg mx-auto">
                  <div className="text-center mb-6">
                    <p className="text-gray-300 text-xs font-bold uppercase tracking-[0.2em] mb-2">
                      {viewMode === 'yearly-only' && selectedAnnualPlan ? 'Event Budget' : 'Total Balance'}
                    </p>
                    <p className={`text-4xl md:text-5xl font-bold tracking-tight ${cardRemaining < 0 ? 'text-red-300' : 'text-white'}`}>
                      {formatCurrency(cardRemaining)}
                    </p>
                    <p className="text-gray-300 text-sm mt-1 font-medium">Remaining</p>
                  </div>

                  <div className="grid grid-cols-2 gap-px bg-white/20 rounded-xl overflow-hidden backdrop-blur-sm border border-white/10">
                    <div className="p-4 text-center hover:bg-white/5 transition-colors">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-[10px] text-gray-300 uppercase font-bold tracking-wider">Budget</span>
                      </div>
                      <p className="text-lg font-semibold">{formatCurrency(cardBudget)}</p>
                    </div>
                    <div className="p-4 text-center hover:bg-white/5 transition-colors">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <ArrowDown className="w-3.5 h-3.5 text-red-400" />
                        <span className="text-[10px] text-gray-300 uppercase font-bold tracking-wider">Spent</span>
                      </div>
                      <p className="text-lg font-semibold">{formatCurrency(cardSpent)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* --- RIGHT COL: STATS (Spans 1 on Desktop) --- */}
        <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
            <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-gray-800">Overview</h3>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 flex-1">
            <div className="bg-emerald-50/50 rounded-xl p-3 border border-emerald-100/50 flex flex-col justify-center hover:bg-emerald-50 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-emerald-700">Receipts</span>
                <Receipt className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <p className="text-xl font-bold text-emerald-900">{periodStats.totalReceipts}</p>
            </div>

            <div className="bg-violet-50/50 rounded-xl p-3 border border-violet-100/50 flex flex-col justify-center hover:bg-violet-50 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-violet-700">Top Category</span>
                <Tag className="w-3.5 h-3.5 text-violet-400" />
              </div>
              <p className="text-sm font-bold text-violet-900 truncate capitalize" title={periodStats.topCategoryName}>
                {periodStats.topCategoryName}
              </p>
            </div>

            <div className="bg-amber-50/50 rounded-xl p-3 border border-amber-100/50 flex flex-col justify-center hover:bg-amber-50 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-amber-700">Daily Avg</span>
                <CalendarDays className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <p className="text-lg font-bold text-amber-900">{formatCurrency(periodStats.avgDailySpend)}</p>
            </div>

            <div className="bg-purple-50/50 rounded-xl p-3 border border-purple-100/50 flex flex-col justify-center hover:bg-purple-50 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-purple-700">Monthly Avg</span>
                <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <p className="text-lg font-bold text-purple-900">{formatCurrency(periodStats.avgMonthlySpend)}</p>
            </div>
          </div>
        </div>

        {/* --- BOTTOM ROW: CONTENT (Spans Full) --- */}
        <div className="lg:col-span-3">
          {viewMode === 'yearly-only' && selectedAnnualPlan ? (
            // Annual Events Content
            (() => {
              const selectedBudgetItem = yearlyItems.find(item => item.name === selectedAnnualPlan);
              const planExpenses = filteredExpenses.filter(e => e.budgetItemName === selectedAnnualPlan);
              const totalSpentOnPlan = planExpenses.reduce((sum, e) => sum + e.amount, 0);
              const budget = selectedBudgetItem?.amount || 0;
              const remaining = budget - totalSpentOnPlan;
              const percentage = budget > 0 ? (totalSpentOnPlan / budget) * 100 : 0;
              const isOverBudget = percentage > 100;
              const isNearBudget = percentage >= 80 && percentage <= 100;

              const barColor = isOverBudget ? 'bg-red-500' : isNearBudget ? 'bg-amber-500' : 'bg-emerald-500';
              const textColor = isOverBudget ? 'text-red-600' : isNearBudget ? 'text-amber-600' : 'text-emerald-600';

              return (
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Left: Summary */}
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Plane className="w-5 h-5 text-purple-500" />
                        Budget Progress
                      </h3>
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <div className="flex items-end justify-between mb-2">
                          <span className={`text-2xl font-bold ${textColor}`}>{percentage.toFixed(0)}%</span>
                          <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Used</span>
                        </div>
                        <div className="h-4 bg-gray-200 rounded-full overflow-hidden mb-4">
                          <div
                            className={`h-full ${barColor} rounded-full transition-all duration-500 ease-out`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-sm">
                          <div className="flex flex-col">
                            <span className="text-xs text-gray-400">Spent</span>
                            <span className="font-bold text-gray-700">{formatCurrency(totalSpentOnPlan)}</span>
                          </div>
                          <div className="flex flex-col text-right">
                            <span className="text-xs text-gray-400">Total Budget</span>
                            <span className="font-bold text-gray-700">{formatCurrency(budget)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Transactions */}
                    <div className="flex-[2] border-t md:border-t-0 md:border-l border-gray-100 md:pl-6 pt-6 md:pt-0">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <Receipt className="w-4 h-4" />
                        Recent Activity
                      </h4>
                      {planExpenses.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {planExpenses
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((expense, idx) => (
                              <div key={expense.id || idx} className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-100/50">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 truncate">
                                    {expense.description || expense.category}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {new Date(expense.date).toLocaleDateString('en-US', {
                                      month: 'short', day: 'numeric', year: 'numeric'
                                    })}
                                  </p>
                                </div>
                                <span className="text-sm font-bold text-gray-900 ml-3">
                                  {formatCurrency(expense.amount)}
                                </span>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                          <p>No transactions recorded yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            // Monthly/Yearly Content
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-indigo-500" />
                  Spending vs Budget
                </h3>
                <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                  {chartData.length} Categories
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {chartData.length > 0 ? (
                  chartData.map((item, index) => {
                    const percentage = item.budget > 0 ? Math.min((item.spent / item.budget) * 100, 150) : 0;
                    const displayPercentage = item.budget > 0 ? (item.spent / item.budget) * 100 : 0;
                    const isOverBudget = displayPercentage > 100;
                    const isNearBudget = displayPercentage >= 80 && displayPercentage <= 100;

                    const barColor = isOverBudget ? 'bg-red-500' : isNearBudget ? 'bg-amber-500' : 'bg-emerald-500';
                    const textColor = isOverBudget ? 'text-red-600' : isNearBudget ? 'text-amber-600' : 'text-emerald-600';
                    const hoverBorder = isOverBudget ? 'hover:border-red-200' : 'hover:border-indigo-200';

                    return (
                      <div key={index} className={`p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:shadow-md transition-all duration-200 ${hoverBorder} group`}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-bold text-gray-900 text-sm truncate max-w-[120px]" title={item.category}>{item.category}</p>
                            <div className="flex items-baseline gap-1 mt-0.5">
                              <span className={`text-base font-bold ${textColor}`}>{formatCurrency(item.spent)}</span>
                              <span className="text-xs text-gray-400 font-medium">/ {formatCurrency(item.budget)}</span>
                            </div>
                          </div>
                          <div className={`px-2 py-1 rounded text-xs font-bold ${isOverBudget ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-600 group-hover:bg-indigo-50 group-hover:text-indigo-600'}`}>
                            {displayPercentage.toFixed(0)}%
                          </div>
                        </div>

                        <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden mt-2">
                          <div
                            className={`absolute left-0 top-0 h-full ${barColor} rounded-full transition-all duration-300`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                          />
                          {isOverBudget && (
                            <div
                              className="absolute right-0 top-0 h-full bg-red-300 rounded-r-full animate-pulse"
                              style={{ width: `${Math.min(percentage - 100, 50)}%` }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center py-12 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="font-bold text-gray-500">No Budget Data</p>
                    <p className="text-sm">Please set up your budget in Settings.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div >
  );
};

export default Dashboard;