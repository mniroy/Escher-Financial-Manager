import React, { useMemo, useState, useEffect } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from 'recharts';
import { Expense, BudgetCategory, BudgetLineItem } from '../types';
import { formatCurrency } from '../constants';
import { ArrowUpDown, Pencil, Trash2, X, Save, Check, BarChart3, Calendar, Plane, RefreshCw } from 'lucide-react';

interface TransactionListProps {
    expenses: Expense[];
    onEditExpense: (expense: Expense) => Promise<void>;
    onDeleteExpense: (expenseId: string) => Promise<void>;
    onRefresh?: () => Promise<void>;
    budgetItems?: BudgetLineItem[];
}

const TransactionList: React.FC<TransactionListProps> = ({
    expenses,
    onEditExpense,
    onDeleteExpense,
    onRefresh,
    budgetItems = [],
}) => {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedDate] = useState(new Date());
    const [sortBy, setSortBy] = useState<'date' | 'category' | 'submission'>('submission');
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [chartRange, setChartRange] = useState<'1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL'>('1M');
    const [showChart, setShowChart] = useState(true);

    // Automatically refresh data from Google Sheets when entering this page
    useEffect(() => {
        let isMounted = true;

        const refreshData = async () => {
            if (onRefresh && isMounted) {
                setIsRefreshing(true);
                try {
                    await onRefresh();
                } catch (error) {
                    console.error('Failed to refresh transactions:', error);
                } finally {
                    if (isMounted) {
                        setIsRefreshing(false);
                    }
                }
            }
        };

        refreshData();

        return () => {
            isMounted = false;
        };
    }, [onRefresh]); // Include onRefresh in dependencies

    // Get days for range
    const getRangeDays = (range: typeof chartRange) => {
        switch (range) {
            case '1D': return 1;
            case '1W': return 7;
            case '1M': return 30;
            case '3M': return 90;
            case '1Y': return 365;
            case 'ALL': return 9999;
        }
    };

    // Filter expenses based on chartRange
    const filteredExpenses = useMemo(() => {
        const today = selectedDate;
        const days = getRangeDays(chartRange);

        return expenses.filter(e => {
            const d = new Date(e.date);
            const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
            if (chartRange === 'ALL') return true;
            return diffDays >= 0 && diffDays < days;
        });
    }, [expenses, chartRange, selectedDate]);

    // Sort expenses
    const sortedExpenses = useMemo(() => {
        if (sortBy === 'submission') {
            return [...filteredExpenses].reverse();
        }
        return [...filteredExpenses].sort((a, b) => {
            if (sortBy === 'category') {
                return a.category.localeCompare(b.category);
            }
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
    }, [filteredExpenses, sortBy]);

    const totalSpent = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Chart data - spending based on range
    const chartData = useMemo(() => {
        const today = selectedDate;
        let days = 7;
        switch (chartRange) {
            case '1D': days = 1; break;
            case '1W': days = 7; break;
            case '1M': days = 30; break;
            case '3M': days = 90; break;
            case '1Y': days = 365; break;
            case 'ALL': days = 9999; break;
        }
        const data = [];
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - days + 1);

        // For ALL, find earliest expense
        let effectiveDays = days;
        if (chartRange === 'ALL' && expenses.length > 0) {
            const sortedDates = expenses.map(e => new Date(e.date).getTime()).sort((a, b) => a - b);
            const earliest = new Date(sortedDates[0]);
            effectiveDays = Math.ceil((today.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        }

        // Group by appropriate interval
        const interval = effectiveDays <= 7 ? 1 : effectiveDays <= 30 ? 1 : effectiveDays <= 90 ? 7 : 30;
        const groupedData: { [key: string]: number } = {};

        for (let i = effectiveDays - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const groupKey = interval === 1 ? dateStr :
                Math.floor(i / interval).toString();

            if (!groupedData[groupKey]) groupedData[groupKey] = 0;
            const dayTotal = expenses
                .filter(e => e.date === dateStr)
                .reduce((sum, e) => sum + e.amount, 0);
            groupedData[groupKey] += dayTotal;
        }

        // Convert to array for chart
        for (let i = Math.min(effectiveDays, chartRange === '1D' ? 24 : 30) - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i * (interval === 1 ? 1 : interval));
            const dateStr = date.toISOString().split('T')[0];

            const dayTotal = expenses
                .filter(e => {
                    const eDate = new Date(e.date);
                    const diff = Math.floor((date.getTime() - eDate.getTime()) / (1000 * 60 * 60 * 24));
                    return interval === 1 ? e.date === dateStr : diff >= 0 && diff < interval;
                })
                .reduce((sum, e) => sum + e.amount, 0);

            data.push({
                date: dateStr,
                label: date.toLocaleDateString('default', { day: 'numeric', month: 'short' }),
                shortLabel: date.toLocaleDateString('default', { day: 'numeric' }),
                amount: dayTotal,
            });
        }
        return data.slice(-30); // Limit to last 30 points for display
    }, [expenses, selectedDate, chartRange]);

    const chartTotal = chartData.reduce((sum, d) => sum + d.amount, 0);
    const chartAvg = chartData.length > 0 ? chartTotal / chartData.filter(d => d.amount > 0).length || 0 : 0;

    const handleEdit = (expense: Expense) => {
        setEditingExpense({ ...expense });
        setIsModalOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editingExpense) return;
        setIsRefreshing(true); // Using existing refreshing state for a simpler loading UI or add a new one
        try {
            await onEditExpense(editingExpense);
            setIsModalOpen(false);
            setEditingExpense(null);
        } catch (error) {
            console.error('Failed to update expense:', error);
            alert('Failed to update expense. Please try again.');
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleDelete = async (expenseId: string) => {
        if (window.confirm('Delete this transaction?')) {
            try {
                await onDeleteExpense(expenseId);
                // Close modal if we are deleting the currently edited expense
                if (isModalOpen && editingExpense?.id === expenseId) {
                    setIsModalOpen(false);
                    setEditingExpense(null);
                }
            } catch (error) {
                console.error('Failed to delete expense:', error);
                alert('Failed to delete expense. Please try again.');
            }
        }
    };

    return (
        <div className="flex flex-col flex-1 bg-gray-50 overflow-visible">

            {/* TOP: Chart & Controls (Collapse when editing to save space on small screens, or keep fixed height) */}
            <div className="shrink-0 p-4 pb-0 flex flex-col gap-4 animate-in slide-in-from-top-4 duration-500">
                {/* Chart Section */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h2 className="text-base font-bold text-gray-800">Spending Overview</h2>
                                {onRefresh && (
                                    <button
                                        onClick={async () => {
                                            setIsRefreshing(true);
                                            try { await onRefresh(); } finally { setIsRefreshing(false); }
                                        }}
                                        disabled={isRefreshing}
                                        className={`p-1.5 rounded-lg transition-all ${isRefreshing ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:bg-gray-100'}`}
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                                    </button>
                                )}
                            </div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-extrabold text-gray-900 tracking-tight">{formatCurrency(chartTotal)}</span>
                                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Spent</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            <div className="flex p-1 bg-gray-100/80 rounded-xl">
                                {(['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const).map((range) => (
                                    <button
                                        key={range}
                                        onClick={() => setChartRange(range)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${chartRange === range
                                            ? 'bg-white text-indigo-600 shadow-sm'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                    >
                                        {range}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-lg border border-gray-100 self-start md:self-end">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2">Sort</span>
                                <button
                                    onClick={() => setSortBy('submission')}
                                    className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${sortBy === 'submission'
                                        ? 'bg-white text-indigo-600 shadow-sm border border-gray-200'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    Submission
                                </button>
                                <button
                                    onClick={() => setSortBy('date')}
                                    className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${sortBy === 'date'
                                        ? 'bg-white text-indigo-600 shadow-sm border border-gray-200'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    Date
                                </button>
                                <button
                                    onClick={() => setSortBy('category')}
                                    className={`px-2 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-all ${sortBy === 'category'
                                        ? 'bg-white text-indigo-600 shadow-sm border border-gray-200'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    Category
                                </button>
                                <div className="w-px h-4 bg-gray-300 mx-1"></div>
                                <button
                                    onClick={() => setIsEditMode(!isEditMode)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${isEditMode
                                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                >
                                    {isEditMode ? (
                                        <>
                                            <Check className="w-3.5 h-3.5" />
                                            <span>Save</span>
                                        </>
                                    ) : (
                                        <>
                                            <Pencil className="w-3.5 h-3.5" />
                                            <span>Manage</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Chart */}
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorSpending" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="shortLabel"
                                    itemStyle={{ fontSize: 10 }}
                                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                                    tickLine={false}
                                    axisLine={false}
                                    interval="preserveStartEnd"
                                />
                                <Tooltip
                                    cursor={{ stroke: '#e5e7eb' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="amount"
                                    stroke="#6366f1"
                                    strokeWidth={3}
                                    fill="url(#colorSpending)"
                                    animationDuration={1000}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    <div className="text-center mt-2">
                        <p className="text-xs text-gray-400 font-medium">{filteredExpenses.length} transactions • Avg {formatCurrency(chartAvg)}/day</p>
                    </div>
                </div>
            </div>

            {/* BOTTOM: Transaction List & Edit Panel Container */}
            <div className="flex-1 flex min-h-0 p-2 md:p-6 gap-6 overflow-visible relative">

                {/* List Container - Flex Grow/Shrink based on modal state */}
                <div className={`flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-visible transition-all duration-300 ease-in-out flex-1 min-w-0`}>
                    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 block shrink-0">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            History
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">{sortedExpenses.length}</span>
                        </h3>
                    </div>

                    <div className="flex-1 overflow-visible bg-white min-h-0">
                        {sortedExpenses.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-400 h-full">
                                <Calendar className="w-12 h-12 mb-3 opacity-20" />
                                <p className="font-medium">No transactions found</p>
                                <p className="text-sm">Try adjusting the filter range</p>
                            </div>
                        ) : (
                            <>
                                {/* MOBILE LIST VIEW: Shows for small screens, hidden on md+ */}
                                <div className="md:hidden divide-y divide-gray-100">
                                    {sortedExpenses.map((expense) => {
                                        const expDate = new Date(expense.date);
                                        const isEditingThis = editingExpense?.id === expense.id;
                                        return (
                                            <div
                                                key={expense.id}
                                                onClick={() => handleEdit(expense)}
                                                className={`flex items-center p-3 gap-3 transition-colors cursor-pointer ${isEditingThis ? 'bg-indigo-50/50' : 'active:bg-gray-50'}`}
                                            >
                                                {/* Date Block */}
                                                <div className="w-10 h-10 shrink-0 bg-gray-50 rounded-lg flex flex-col items-center justify-center border border-gray-100 font-medium">
                                                    <span className="text-[8px] uppercase text-gray-400 leading-none">{expDate.toLocaleString('default', { month: 'short' })}</span>
                                                    <span className="text-sm font-bold text-gray-700 leading-none mt-0.5">{expDate.getDate()}</span>
                                                </div>

                                                {/* Content Area */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start gap-2 mb-0.5">
                                                        <span className="text-xs font-medium text-gray-900 truncate" title={expense.description}>
                                                            {expense.description}
                                                        </span>
                                                        <span className="text-xs font-bold text-gray-900 whitespace-nowrap font-mono">
                                                            {formatCurrency(expense.amount)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-gray-100 text-gray-500 border border-gray-100">
                                                            {expense.category}
                                                        </span>
                                                        {expense.budgetItemName && (
                                                            <div className="flex items-center gap-1 text-[9px] text-purple-600 font-bold truncate">
                                                                <Plane className="w-2.5 h-2.5 shrink-0" />
                                                                {expense.budgetItemName}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Edit Mode Actions (Optional: only if you want quick delete) */}
                                                {isEditMode && (
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(expense.id); }}
                                                            className="p-1.5 text-red-300 hover:text-red-500 rounded-lg"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* DESKTOP TABLE VIEW: Shows for md+ screens, hidden on small */}
                                <table className="hidden md:table min-w-full divide-y divide-gray-100 table-auto">
                                    <thead className="bg-gray-50/80 sticky top-0 z-10 backdrop-blur-sm">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-24">Date</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Details</th>
                                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Category</th>
                                            <th className="px-6 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Amount</th>
                                            {isEditMode && <th className="px-6 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Actions</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-50">
                                        {sortedExpenses.map((expense) => {
                                            const expDate = new Date(expense.date);
                                            const isEditingThis = editingExpense?.id === expense.id;
                                            return (
                                                <tr
                                                    key={expense.id}
                                                    onClick={() => handleEdit(expense)}
                                                    className={`group transition-colors cursor-pointer ${isEditingThis ? 'bg-indigo-50/50' : 'hover:bg-gray-50/80'}`}
                                                >
                                                    <td className="px-6 py-4 whitespace-nowrap align-top">
                                                        <div className="flex items-center">
                                                            <div className={`w-9 h-9 rounded-lg flex flex-col items-center justify-center font-medium border transition-colors ${isEditingThis ? 'bg-white border-indigo-200 text-indigo-600' : 'bg-gray-50 border-gray-100 text-gray-500 group-hover:bg-white group-hover:border-indigo-200 group-hover:text-indigo-600'}`}>
                                                                <span className="text-[10px] uppercase leading-none">{expDate.toLocaleString('default', { month: 'short' })}</span>
                                                                <span className="text-sm font-bold leading-none">{expDate.getDate()}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 align-top">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-semibold text-gray-900">{expense.description}</span>
                                                            {expense.budgetItemName && (
                                                                <span className="inline-flex items-center gap-1 mt-1 text-xs text-purple-600 font-medium">
                                                                    <Plane className="w-3 h-3" />
                                                                    {expense.budgetItemName}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap align-top">
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 group-hover:bg-indigo-50 group-hover:text-indigo-700 group-hover:border-indigo-100 transition-colors">
                                                            {expense.category}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right align-top">
                                                        <span className="text-sm font-bold text-gray-900 font-mono tracking-tight">
                                                            {formatCurrency(expense.amount)}
                                                        </span>
                                                    </td>
                                                    {isEditMode && (
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm align-top">
                                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleEdit(expense); }}
                                                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                                                >
                                                                    <Pencil className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(expense.id); }}
                                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </>
                        )}
                    </div>
                </div>

                {/* Edit Panel (Side/Bottom) - Compact & Integrated */}
                {isModalOpen && editingExpense && (
                    <React.Fragment>
                        {/* Backdrop for Mobile */}
                        <div
                            className="fixed inset-0 bg-black/40 z-[55] md:hidden animate-in fade-in duration-300"
                            onClick={() => { setIsModalOpen(false); setEditingExpense(null); }}
                        />
                        <div className={`w-[95%] max-w-lg md:w-2/5 lg:w-1/3 bg-white rounded-3xl md:rounded-2xl shadow-2xl border border-gray-200 flex flex-col animate-in slide-in-from-bottom-8 md:slide-in-from-right-8 duration-300 fixed md:relative left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 bottom-4 md:bottom-auto top-auto md:top-0 max-h-[90vh] md:h-full z-[60]`}>
                            {/* Drag Indicator for Mobile Drawer feel */}
                            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 mb-1 md:hidden shrink-0" />
                            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-bold text-gray-800 text-lg">Edit Transaction</h3>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleSaveEdit}
                                        disabled={isRefreshing}
                                        className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        Save
                                    </button>
                                    <button onClick={() => { setIsModalOpen(false); setEditingExpense(null); }} className="p-2 -mr-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="p-4 overflow-y-auto custom-scrollbar space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Date</label>
                                        <input
                                            type="date"
                                            value={editingExpense.date}
                                            onChange={(e) => setEditingExpense({ ...editingExpense, date: e.target.value })}
                                            className="w-full rounded-xl border-gray-200 bg-gray-50/50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 text-xs font-semibold"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Amount</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2 text-gray-400 font-bold text-[10px]">Rp</span>
                                            <input
                                                type="number"
                                                value={editingExpense.amount}
                                                onChange={(e) => setEditingExpense({ ...editingExpense, amount: Number(e.target.value) })}
                                                className="pl-8 w-full rounded-xl border-gray-200 bg-gray-50/50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 text-xs font-bold text-gray-900"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Category</label>
                                    <select
                                        value={editingExpense.category}
                                        onChange={(e) => setEditingExpense({ ...editingExpense, category: e.target.value as BudgetCategory })}
                                        className="w-full rounded-xl border-gray-200 bg-gray-50/50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 bg-white text-xs font-semibold"
                                    >
                                        {Object.values(BudgetCategory).map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Description</label>
                                    <textarea
                                        value={editingExpense.description}
                                        onChange={(e) => setEditingExpense({ ...editingExpense, description: e.target.value })}
                                        rows={2}
                                        className="w-full rounded-xl border-gray-200 bg-gray-50/50 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 px-3 text-xs font-medium resize-none"
                                        placeholder="What was this for?"
                                    />
                                </div>

                                {/* Compact Annual Spend Option */}
                                <div className="pt-3 border-t border-gray-100">
                                    <label className="flex items-center justify-between cursor-pointer group">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-purple-50 rounded-lg text-purple-600">
                                                <Plane className="w-3.5 h-3.5" />
                                            </div>
                                            <span className="text-xs font-bold text-gray-700">Link to Event Plan</span>
                                        </div>
                                        <div className="relative flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={!!editingExpense.budgetItemName}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        const firstYearly = budgetItems.find(i => i.frequency === 'Yearly');
                                                        if (firstYearly) {
                                                            setEditingExpense({
                                                                ...editingExpense,
                                                                budgetItemName: firstYearly.name,
                                                                category: firstYearly.category
                                                            });
                                                        } else {
                                                            alert("No yearly plans found in your budget. Please add one first.");
                                                        }
                                                    } else {
                                                        setEditingExpense({ ...editingExpense, budgetItemName: undefined });
                                                    }
                                                }}
                                                className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-gray-300 transition-all checked:border-purple-500 checked:bg-purple-500"
                                            />
                                            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100">
                                                <Check className="w-3.5 h-3.5" />
                                            </div>
                                        </div>
                                    </label>

                                    {editingExpense.budgetItemName && (
                                        <div className="animate-in fade-in slide-in-from-top-2">
                                            <select
                                                value={editingExpense.budgetItemName}
                                                onChange={(e) => {
                                                    const item = budgetItems.find(i => i.name === e.target.value);
                                                    if (item) {
                                                        setEditingExpense({
                                                            ...editingExpense,
                                                            budgetItemName: item.name,
                                                            category: item.category
                                                        });
                                                    }
                                                }}
                                                className="w-full rounded-xl border-purple-200 shadow-sm focus:border-purple-500 focus:ring-purple-500 py-2.5 border px-3 bg-purple-50/30 text-purple-900 text-sm font-semibold"
                                            >
                                                {budgetItems.filter(i => i.frequency === 'Yearly').map(item => (
                                                    <option key={item.name} value={item.name}>{item.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-2 flex flex-col gap-3">
                                    <button
                                        onClick={handleSaveEdit}
                                        disabled={isRefreshing}
                                        className="w-full bg-indigo-600 text-white py-3 px-4 rounded-xl font-bold hover:bg-indigo-700 flex items-center justify-center gap-2 text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.98] disabled:bg-gray-400"
                                    >
                                        {isRefreshing ? (
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Save className="w-4 h-4" />
                                        )}
                                        {isRefreshing ? 'Saving...' : 'Save Changes'}
                                    </button>

                                    <button
                                        onClick={() => handleDelete(editingExpense.id)}
                                        disabled={isRefreshing}
                                        className="w-full bg-red-50 text-red-600 py-3 px-4 rounded-xl font-bold hover:bg-red-100 flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.98] disabled:opacity-50"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Delete Transaction
                                    </button>
                                </div>
                            </div>
                        </div>
                    </React.Fragment>
                )}
            </div>
        </div>
    );
};

export default TransactionList;
