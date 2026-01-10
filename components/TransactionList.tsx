import React, { useMemo, useState } from 'react';
import { Expense, BudgetCategory } from '../types';
import { formatCurrency } from '../constants';
import { Calendar, TrendingUp, ArrowUpDown, Pencil, Trash2, X, Save, ChevronLeft, ChevronRight, Plane, Check, Sun } from 'lucide-react';

interface TransactionListProps {
    expenses: Expense[];
    onEditExpense: (expense: Expense) => Promise<void>;
    onDeleteExpense: (expenseId: string) => Promise<void>;
}

const TransactionList: React.FC<TransactionListProps> = ({
    expenses,
    onEditExpense,
    onDeleteExpense,
}) => {
    const [viewMode, setViewMode] = useState<'daily' | 'monthly' | 'annual'>('monthly');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [sortBy, setSortBy] = useState<'date' | 'category'>('date');
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);

    const displayedDay = selectedDate.getDate();
    const displayedMonth = selectedDate.getMonth();
    const displayedYear = selectedDate.getFullYear();

    // Navigation handlers
    const handlePrev = () => {
        setSelectedDate(prev => {
            const d = new Date(prev);
            if (viewMode === 'daily') {
                d.setDate(d.getDate() - 1);
            } else if (viewMode === 'monthly') {
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
            if (viewMode === 'daily') {
                d.setDate(d.getDate() + 1);
            } else if (viewMode === 'monthly') {
                d.setMonth(d.getMonth() + 1);
            } else {
                d.setFullYear(d.getFullYear() + 1);
            }
            return d;
        });
    };

    const dateLabel = useMemo(() => {
        if (viewMode === 'daily') {
            return selectedDate.toLocaleDateString('default', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        }
        if (viewMode === 'monthly') {
            return selectedDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        }
        return `Year ${displayedYear}`;
    }, [viewMode, selectedDate, displayedYear]);

    // Filter expenses
    const filteredExpenses = useMemo(() => {
        return expenses.filter(e => {
            const d = new Date(e.date);
            const yearMatch = d.getFullYear() === displayedYear;

            if (viewMode === 'daily') {
                return d.getDate() === displayedDay && d.getMonth() === displayedMonth && yearMatch;
            } else if (viewMode === 'monthly') {
                return d.getMonth() === displayedMonth && yearMatch;
            } else {
                return yearMatch;
            }
        });
    }, [expenses, viewMode, displayedDay, displayedMonth, displayedYear]);

    // Sort expenses
    const sortedExpenses = useMemo(() => {
        return [...filteredExpenses].sort((a, b) => {
            if (sortBy === 'category') {
                return a.category.localeCompare(b.category);
            }
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
    }, [filteredExpenses, sortBy]);

    const totalSpent = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Calculate daily average for monthly view
    const dailyAverage = useMemo(() => {
        if (viewMode !== 'monthly' || filteredExpenses.length === 0) return 0;
        const uniqueDays = new Set(filteredExpenses.map(e => e.date)).size;
        return uniqueDays > 0 ? totalSpent / uniqueDays : 0;
    }, [viewMode, filteredExpenses, totalSpent]);

    const handleEdit = (expense: Expense) => {
        setEditingExpense({ ...expense });
        setIsModalOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editingExpense) return;
        try {
            await onEditExpense(editingExpense);
            setIsModalOpen(false);
            setEditingExpense(null);
        } catch (error) {
            console.error('Failed to update expense:', error);
            alert('Failed to update expense. Please try again.');
        }
    };

    const handleDelete = async (expenseId: string) => {
        if (window.confirm('Delete this transaction?')) {
            try {
                await onDeleteExpense(expenseId);
            } catch (error) {
                console.error('Failed to delete expense:', error);
                alert('Failed to delete expense. Please try again.');
            }
        }
    };

    return (
        <div className="p-3 space-y-3">
            {/* Compact Header with Stats */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Transactions</h2>
                            <p className="text-xs text-gray-500">{filteredExpenses.length} items</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {viewMode === 'monthly' && dailyAverage > 0 && (
                            <div className="text-right hidden sm:block">
                                <p className="text-[10px] text-gray-400 uppercase">Daily Avg</p>
                                <p className="text-sm font-semibold text-gray-600">{formatCurrency(dailyAverage)}</p>
                            </div>
                        )}
                        <div className="text-right">
                            <p className="text-[10px] text-gray-400 uppercase">Total</p>
                            <p className="text-lg font-bold text-gray-900">{formatCurrency(totalSpent)}</p>
                        </div>
                        {/* Edit Toggle */}
                        <button
                            onClick={() => setIsEditMode(!isEditMode)}
                            className={`p-2 rounded-full transition-all ${isEditMode
                                ? 'bg-emerald-500 text-white shadow-lg'
                                : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
                                }`}
                            title={isEditMode ? "Done Editing" : "Edit Mode"}
                        >
                            {isEditMode ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Controls - More Compact */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 bg-white p-2 rounded-xl shadow-sm border border-gray-100">
                {/* Date Navigation */}
                <div className="flex items-center bg-gray-50 rounded-lg border border-gray-200">
                    <button onClick={handlePrev} className="p-1.5 hover:bg-gray-200 rounded-l-md transition-colors">
                        <ChevronLeft className="w-4 h-4 text-gray-600" />
                    </button>
                    <div className="px-2 py-1 min-w-[100px] sm:min-w-[140px] text-center font-medium text-gray-800 text-xs sm:text-sm">
                        {dateLabel}
                    </div>
                    <button onClick={handleNext} className="p-1.5 hover:bg-gray-200 rounded-r-md transition-colors">
                        <ChevronRight className="w-4 h-4 text-gray-600" />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    {/* View Toggle - Compact */}
                    <div className="bg-gray-100 p-0.5 rounded-lg flex shadow-inner flex-1 sm:flex-none">
                        <button
                            onClick={() => setViewMode('daily')}
                            className={`flex-1 sm:flex-none px-2 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1 transition-all ${viewMode === 'daily'
                                ? 'bg-white text-orange-600 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <Sun className="w-3 h-3" />
                            <span className="hidden sm:inline">Daily</span>
                        </button>
                        <button
                            onClick={() => setViewMode('monthly')}
                            className={`flex-1 sm:flex-none px-2 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1 transition-all ${viewMode === 'monthly'
                                ? 'bg-white text-indigo-700 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <Calendar className="w-3 h-3" />
                            <span className="hidden sm:inline">Monthly</span>
                        </button>
                        <button
                            onClick={() => setViewMode('annual')}
                            className={`flex-1 sm:flex-none px-2 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1 transition-all ${viewMode === 'annual'
                                ? 'bg-white text-indigo-700 shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <TrendingUp className="w-3 h-3" />
                            <span className="hidden sm:inline">Annual</span>
                        </button>
                    </div>

                    {/* Sort Dropdown - Compact */}
                    <div className="flex items-center gap-1">
                        <ArrowUpDown className="w-3 h-3 text-gray-400" />
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as 'date' | 'category')}
                            className="text-xs border border-gray-200 rounded-lg px-1.5 py-1.5 bg-gray-50 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="date">Date</option>
                            <option value="category">Category</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Transaction List */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {sortedExpenses.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <Calendar className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        <p className="font-medium text-sm">No transactions</p>
                        <p className="text-xs mt-1">{dateLabel}</p>
                    </div>
                ) : (
                    <>
                        {/* Mobile View - Compact */}
                        <div className="md:hidden divide-y divide-gray-100 max-h-[65vh] overflow-y-auto">
                            {sortedExpenses.map((expense) => (
                                <div key={expense.id} className="p-3 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium text-gray-900 text-sm truncate">{expense.description}</span>
                                            <span className="font-bold text-gray-900 text-sm whitespace-nowrap">{formatCurrency(expense.amount)}</span>
                                        </div>
                                        <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-500 flex-wrap">
                                            <span>{expense.date}</span>
                                            <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                                                {expense.category}
                                            </span>
                                            {expense.budgetItemName && (
                                                <span className="px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
                                                    {expense.budgetItemName}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {isEditMode && (
                                        <div className="flex gap-1 animate-in fade-in slide-in-from-right-2">
                                            <button
                                                onClick={() => handleEdit(expense)}
                                                className="p-1.5 text-indigo-600 bg-indigo-50 rounded-md"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(expense.id)}
                                                className="p-1.5 text-red-600 bg-red-50 rounded-md"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Desktop View - Compact */}
                        <div className="hidden md:block overflow-x-auto max-h-[65vh] overflow-y-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                        {isEditMode && <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {sortedExpenses.map((expense) => (
                                        <tr key={expense.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">{expense.date}</td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm">
                                                <div className="flex flex-col items-start gap-0.5">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                                                        {expense.category}
                                                    </span>
                                                    {expense.budgetItemName && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-purple-100 text-purple-800">
                                                            <Plane className="w-2.5 h-2.5 mr-0.5" />
                                                            {expense.budgetItemName}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{expense.description}</td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                                                {formatCurrency(expense.amount)}
                                            </td>
                                            {isEditMode && (
                                                <td className="px-4 py-2 whitespace-nowrap text-right text-sm animate-in fade-in">
                                                    <button onClick={() => handleEdit(expense)} className="text-indigo-600 hover:text-indigo-900 mx-0.5">
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDelete(expense.id)} className="text-red-600 hover:text-red-900 mx-0.5">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* Edit Modal */}
            {isModalOpen && editingExpense && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden relative z-10">
                        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800">Edit Transaction</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
                                <input
                                    type="date"
                                    value={editingExpense.date}
                                    onChange={(e) => setEditingExpense({ ...editingExpense, date: e.target.value })}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3 text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                                <select
                                    value={editingExpense.category}
                                    onChange={(e) => setEditingExpense({ ...editingExpense, category: e.target.value as BudgetCategory })}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3 bg-white text-sm"
                                >
                                    {Object.values(BudgetCategory).map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                                <input
                                    type="text"
                                    value={editingExpense.description}
                                    onChange={(e) => setEditingExpense({ ...editingExpense, description: e.target.value })}
                                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3 text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2 text-gray-500 font-bold text-sm">Rp</span>
                                    <input
                                        type="number"
                                        value={editingExpense.amount}
                                        onChange={(e) => setEditingExpense({ ...editingExpense, amount: Number(e.target.value) })}
                                        className="pl-9 w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2 border px-3 text-sm"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleSaveEdit}
                                className="w-full bg-indigo-600 text-white py-2.5 px-4 rounded-lg font-medium hover:bg-indigo-700 flex items-center justify-center gap-2 text-sm"
                            >
                                <Save className="w-4 h-4" />
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransactionList;
