import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Wallet, TrendingUp, ChevronDown, ChevronRight, Receipt, Percent, Pencil } from 'lucide-react';
import { IncomeEntry } from '../types';

type IncomeTab = 'net' | 'gross' | 'tax';

interface DisplayEntry {
    date: string;
    source: string;
    person: string;
    amount: number;
}

interface MonthlyData {
    month: string;
    year: number;
    entries: DisplayEntry[];
    rawEntries: IncomeEntry[]; // Added for editing
}

interface Props {
    incomeData: IncomeEntry[];
    onEditIncome?: (income: IncomeEntry) => Promise<void>;
    onDeleteIncome?: (id: string) => Promise<void>;
}

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// Helper to normalize person names
const normalizePerson = (name: string): 'royyan' | 'inez' => {
    const lower = name.toLowerCase();
    if (lower.includes('inez')) return 'inez';
    // Fallback to royyan for existing data or ambiguous entries
    return 'royyan';
};

// Helper to parse month from various formats
const parseMonthYear = (monthStr: string, dateStr?: string): { month: string; year: number } | null => {
    if (!monthStr && !dateStr) return null;

    // First, try to get year from DATE column (format: "2025-07-31")
    let yearFromDate: number | null = null;
    let monthFromDate: number | null = null;

    if (dateStr) {
        const dateMatch = dateStr.match(/^(\d{4})-(\d{2})/);
        if (dateMatch) {
            yearFromDate = parseInt(dateMatch[1]);
            monthFromDate = parseInt(dateMatch[2]) - 1;
        }
    }

    // Try format: "2025-07" or "2025-07-31" for monthStr
    const isoMatch = monthStr?.match(/^(\d{4})-(\d{2})/);
    if (isoMatch) {
        const year = parseInt(isoMatch[1]);
        const monthIndex = parseInt(isoMatch[2]) - 1;
        if (monthIndex >= 0 && monthIndex < 12) {
            return { month: MONTHS[monthIndex], year };
        }
    }

    // Try format: just month number "07" or "7"
    const monthOnlyMatch = monthStr?.match(/^(\d{1,2})$/);
    if (monthOnlyMatch && yearFromDate) {
        const monthIndex = parseInt(monthOnlyMatch[1]) - 1;
        if (monthIndex >= 0 && monthIndex < 12) {
            return { month: MONTHS[monthIndex], year: yearFromDate };
        }
    }

    // Try format: "July 2025" or "Jul 2025" or "January 2026"
    if (monthStr && typeof monthStr === 'string') {
        const lowerMonth = monthStr.toLowerCase();
        for (let i = 0; i < MONTHS.length; i++) {
            const m = MONTHS[i].toLowerCase();
            if (lowerMonth.includes(m) || lowerMonth.includes(m.substring(0, 3))) {
                const yearMatch = monthStr.match(/\d{4}/);
                const year = yearMatch ? parseInt(yearMatch[0]) : (yearFromDate || new Date().getFullYear());
                return { month: MONTHS[i], year };
            }
        }
    }

    // Fallback: use date column data if available
    if (yearFromDate !== null && monthFromDate !== null && monthFromDate >= 0 && monthFromDate < 12) {
        return { month: MONTHS[monthFromDate], year: yearFromDate };
    }

    return null;
};

const IncomeManager: React.FC<Props> = ({ incomeData, onEditIncome, onDeleteIncome }) => {
    const currentYear = new Date().getFullYear();
    const [activeTab, setActiveTab] = useState<IncomeTab>('net');
    const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [editingIncome, setEditingIncome] = useState<IncomeEntry | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const editPanelRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (editPanelRef.current && !editPanelRef.current.contains(event.target as Node)) {
                setEditingIncome(null);
            }
        };

        if (editingIncome) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [editingIncome]);

    // Get available years from data (always include current year)
    const availableYears = useMemo(() => {
        const years = new Set<number>();
        years.add(currentYear); // Always include current year as default option
        incomeData.forEach(entry => {
            const parsed = parseMonthYear(entry.month, entry.date);
            if (parsed) years.add(parsed.year);
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [incomeData, currentYear]);

    // Transform raw income data into display format based on active tab
    const processedData = useMemo(() => {
        const monthlyMap = new Map<string, MonthlyData>();

        // Initialize all months for the selected year
        MONTHS.forEach(month => {
            const key = `${month}-${selectedYear}`;
            monthlyMap.set(key, {
                month,
                year: selectedYear,
                entries: [],
                rawEntries: []
            });
        });

        incomeData.forEach(entry => {
            const parsed = parseMonthYear(entry.month, entry.date);
            if (!parsed || parsed.year !== selectedYear) return;

            const key = `${parsed.month}-${parsed.year}`;
            const monthData = monthlyMap.get(key);
            if (!monthData) return;

            // Format date for display
            const dateObj = new Date(entry.date);
            const formattedDate = isNaN(dateObj.getTime())
                ? entry.date
                : `${String(dateObj.getDate()).padStart(2, '0')} ${parsed.month.substring(0, 3)}`;

            // Determine amount based on active tab
            let amount = 0;
            switch (activeTab) {
                case 'net':
                    amount = entry.takeHomePay;
                    break;
                case 'gross':
                    amount = entry.totalIncome;
                    break;
                case 'tax':
                    amount = entry.deduction;
                    break;
            }

            monthData.entries.push({
                date: formattedDate,
                source: entry.source || entry.category || 'Income',
                person: entry.person,
                amount
            });
            // Keep raw entry reference for editing, matched by index or simply pushed in parallel order
            monthData.rawEntries.push(entry);
        });

        return Array.from(monthlyMap.values());
    }, [incomeData, activeTab, selectedYear]);

    const getMonthTotals = (entries: DisplayEntry[]) => {
        const royyan = entries
            .filter(e => normalizePerson(e.person) === 'royyan')
            .reduce((sum, e) => sum + e.amount, 0);
        const inez = entries
            .filter(e => normalizePerson(e.person) === 'inez')
            .reduce((sum, e) => sum + e.amount, 0);
        return { royyan, inez, total: royyan + inez };
    };

    const formatCurrency = (amount: number) => {
        if (amount === 0) return '-';
        return new Intl.NumberFormat('id-ID', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    const toggleMonth = (month: string) => {
        setExpandedMonth(expandedMonth === month ? null : month);
    };

    const handleSaveEdit = async () => {
        if (!editingIncome || !onEditIncome) return;
        setIsSaving(true);
        try {
            // Auto-calculate derived fields
            const total = (editingIncome.baseIncome || 0) + (editingIncome.allowance || 0);
            const net = total - (editingIncome.deduction || 0);

            const updated = {
                ...editingIncome,
                totalIncome: total,
                takeHomePay: net
            };

            await onEditIncome(updated);
            setEditingIncome(null);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!editingIncome || !editingIncome.id || !onDeleteIncome) return;
        if (!confirm('Are you sure you want to delete this income entry?')) return;

        setIsSaving(true);
        try {
            await onDeleteIncome(editingIncome.id);
            setEditingIncome(null);
        } finally {
            setIsSaving(false);
        }
    };

    // Calculate totals for ALL types simultaneously for the summary cards
    const allTotals = useMemo(() => {
        let net = { royyan: 0, inez: 0, total: 0 };
        let gross = { royyan: 0, inez: 0, total: 0 };
        let tax = { royyan: 0, inez: 0, total: 0 };

        // Re-iterate raw data for global year totals
        incomeData.forEach(entry => {
            const parsed = parseMonthYear(entry.month, entry.date);
            if (!parsed || parsed.year !== selectedYear) return;

            const normalized = normalizePerson(entry.person);

            // Net
            if (normalized === 'royyan') net.royyan += entry.takeHomePay;
            else if (normalized === 'inez') net.inez += entry.takeHomePay;
            net.total += entry.takeHomePay;

            // Gross
            if (normalized === 'royyan') gross.royyan += entry.totalIncome;
            else if (normalized === 'inez') gross.inez += entry.totalIncome;
            gross.total += entry.totalIncome;

            // Tax
            if (normalized === 'royyan') tax.royyan += entry.deduction;
            else if (normalized === 'inez') tax.inez += entry.deduction;
            tax.total += entry.deduction;
        });

        return { net, gross, tax };
    }, [incomeData, selectedYear]);

    return (
        <div className="flex flex-col h-full bg-gray-50 overflow-hidden relative">

            {/* TOP SECTION: Summary Cards - Hide on mobile if editing */}
            <div className={`shrink-0 p-4 pb-0 md:p-6 md:pb-2 ${editingIncome ? 'hidden md:grid' : ''}`}>

                {/* MOBILE: Consolidated Summary Card */}
                <div className="md:hidden bg-gradient-to-br from-indigo-900 to-indigo-800 rounded-2xl p-5 text-white shadow-xl shadow-indigo-200/50 relative overflow-hidden mb-4">
                    {/* Decorative background elements */}
                    <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -mr-16 -mt-16 pointer-events-none blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/20 rounded-full -ml-10 -mb-10 pointer-events-none blur-2xl"></div>

                    <div className="relative z-10">
                        {/* Primary Stat: Net Income */}
                        <div className="flex flex-col mb-5">
                            <div className="flex items-center gap-2 mb-1 text-indigo-200">
                                <Wallet className="w-4 h-4" />
                                <span className="text-xs font-bold uppercase tracking-wider">Net Income YTD</span>
                            </div>
                            <div className="flex items-baseline justify-between">
                                <p className="text-3xl font-extrabold tracking-tight">
                                    Rp {formatCurrency(allTotals.net.total)}
                                </p>
                            </div>
                            {/* Breakdown of Net */}
                            <div className="flex gap-3 mt-2 text-xs font-medium text-indigo-200/80">
                                <span>R: {formatCurrency(allTotals.net.royyan)}</span>
                                <span className="w-1 h-1 bg-indigo-200/40 rounded-full self-center"></span>
                                <span>I: {formatCurrency(allTotals.net.inez)}</span>
                            </div>
                        </div>

                        {/* Secondary Stats: Gross & Tax */}
                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                            <div>
                                <div className="flex items-center gap-1.5 mb-1 text-emerald-300">
                                    <Receipt className="w-3 h-3" />
                                    <span className="text-[10px] font-bold uppercase tracking-wide">Gross</span>
                                </div>
                                <p className="text-sm font-bold font-mono text-emerald-50">Rp {formatCurrency(allTotals.gross.total)}</p>
                            </div>
                            <div className="text-right">
                                <div className="flex items-center justify-end gap-1.5 mb-1 text-rose-300">
                                    <span className="text-[10px] font-bold uppercase tracking-wide">Tax</span>
                                    <Percent className="w-3 h-3" />
                                </div>
                                <p className="text-sm font-bold font-mono text-rose-50">Rp {formatCurrency(allTotals.tax.total)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* DESKTOP: 3 Separate Cards */}
                <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Net Income Card */}
                    <div className="bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-500 rounded-2xl p-5 text-white shadow-lg shadow-indigo-200 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-10 -mt-10 pointer-events-none blur-2xl"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2 opacity-90">
                                <div className="p-1.5 bg-white/20 rounded-lg"><Wallet className="w-4 h-4" /></div>
                                <span className="text-xs font-bold uppercase tracking-wide">Net Income</span>
                            </div>
                            <p className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-4">
                                Rp {formatCurrency(allTotals.net.total)}
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-white/10 rounded px-2 py-1.5 backdrop-blur-sm">
                                    <span className="block opacity-70 mb-0.5">Royyan</span>
                                    <span className="font-mono font-bold">{formatCurrency(allTotals.net.royyan)}</span>
                                </div>
                                <div className="bg-white/10 rounded px-2 py-1.5 backdrop-blur-sm">
                                    <span className="block opacity-70 mb-0.5">Inez</span>
                                    <span className="font-mono font-bold">{formatCurrency(allTotals.net.inez)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Gross Income Card */}
                    <div className="bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 rounded-2xl p-5 text-white shadow-lg shadow-emerald-200 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-10 -mt-10 pointer-events-none blur-2xl"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2 opacity-90">
                                <div className="p-1.5 bg-white/20 rounded-lg"><Receipt className="w-4 h-4" /></div>
                                <span className="text-xs font-bold uppercase tracking-wide">Gross Income</span>
                            </div>
                            <p className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-4">
                                Rp {formatCurrency(allTotals.gross.total)}
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-white/10 rounded px-2 py-1.5 backdrop-blur-sm">
                                    <span className="block opacity-70 mb-0.5">Royyan</span>
                                    <span className="font-mono font-bold">{formatCurrency(allTotals.gross.royyan)}</span>
                                </div>
                                <div className="bg-white/10 rounded px-2 py-1.5 backdrop-blur-sm">
                                    <span className="block opacity-70 mb-0.5">Inez</span>
                                    <span className="font-mono font-bold">{formatCurrency(allTotals.gross.inez)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tax Card */}
                    <div className="bg-gradient-to-br from-rose-600 via-rose-500 to-pink-500 rounded-2xl p-5 text-white shadow-lg shadow-rose-200 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -mr-10 -mt-10 pointer-events-none blur-2xl"></div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2 opacity-90">
                                <div className="p-1.5 bg-white/20 rounded-lg"><Percent className="w-4 h-4" /></div>
                                <span className="text-xs font-bold uppercase tracking-wide">Tax Deductions</span>
                            </div>
                            <p className="text-2xl lg:text-3xl font-extrabold tracking-tight mb-4">
                                Rp {formatCurrency(allTotals.tax.total)}
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-white/10 rounded px-2 py-1.5 backdrop-blur-sm">
                                    <span className="block opacity-70 mb-0.5">Royyan</span>
                                    <span className="font-mono font-bold">{formatCurrency(allTotals.tax.royyan)}</span>
                                </div>
                                <div className="bg-white/10 rounded px-2 py-1.5 backdrop-blur-sm">
                                    <span className="block opacity-70 mb-0.5">Inez</span>
                                    <span className="font-mono font-bold">{formatCurrency(allTotals.tax.inez)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area: Split View for Editing */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">

                {/* List Container - Hidden on mobile if editing */}
                <div className={`flex flex-col flex-1 min-h-0 p-6 pt-2 overflow-hidden ${editingIncome ? 'hidden md:flex' : 'flex'}`}>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden">

                        {/* Header Controls (Tabs & Year) */}
                        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50">
                            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl self-start">
                                <button
                                    onClick={() => setActiveTab('net')}
                                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'net'
                                        ? 'bg-white text-indigo-700 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <Wallet className="w-3.5 h-3.5" />
                                    Net
                                </button>
                                <button
                                    onClick={() => setActiveTab('gross')}
                                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'gross'
                                        ? 'bg-white text-emerald-700 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <Receipt className="w-3.5 h-3.5" />
                                    Gross
                                </button>
                                <button
                                    onClick={() => setActiveTab('tax')}
                                    className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'tax'
                                        ? 'bg-white text-rose-700 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    <Percent className="w-3.5 h-3.5" />
                                    Tax
                                </button>
                            </div>

                            <div className="flex items-center gap-3">
                                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Year</label>
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                                    className="bg-white border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block px-3 py-2 font-bold cursor-pointer hover:border-indigo-300 transition-colors"
                                >
                                    {availableYears.map(year => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Mobile List View */}
                        <div className="md:hidden flex-1 overflow-y-auto">
                            <div className="divide-y divide-gray-50">
                                {processedData.map((monthData) => {
                                    const monthTotals = getMonthTotals(monthData.entries);
                                    const hasData = monthData.entries.length > 0;
                                    const isExpanded = expandedMonth === monthData.month;

                                    return (
                                        <div key={monthData.month} className="bg-white">
                                            {/* Month Row */}
                                            <div
                                                onClick={() => hasData && toggleMonth(monthData.month)}
                                                className={`flex px-3 py-3 transition-colors ${hasData ? 'cursor-pointer hover:bg-gray-50' : 'opacity-40'} ${isExpanded ? 'bg-indigo-50/50' : ''}`}
                                            >
                                                <div className="w-5 shrink-0 flex items-center justify-center">
                                                    {hasData && (isExpanded ? <ChevronDown className="w-4 h-4 text-indigo-500" /> : <ChevronRight className="w-4 h-4 text-gray-400" />)}
                                                </div>
                                                <div className="w-12 shrink-0 text-xs font-bold text-gray-700">{monthData.month.substring(0, 3)}</div>
                                                <div className="flex-1 text-xs text-right px-1 font-medium">{formatCurrency(monthTotals.royyan)}</div>
                                                <div className="flex-1 text-xs text-right px-1 font-medium">{formatCurrency(monthTotals.inez)}</div>
                                                <div className={`w-20 shrink-0 text-xs font-bold text-right ${hasData ? 'text-indigo-600' : 'text-gray-400'}`}>{formatCurrency(monthTotals.total)}</div>
                                            </div>

                                            {/* Detailed breakdown for Mobile */}
                                            {isExpanded && hasData && (
                                                <div className="bg-gray-50/50 border-y border-gray-100 shadow-inner">
                                                    {monthData.entries.map((entry, idx) => (
                                                        <div
                                                            key={idx}
                                                            onClick={() => setEditingIncome(monthData.rawEntries[idx])}
                                                            className="flex px-4 py-3 border-b border-gray-100 last:border-0 cursor-pointer active:bg-indigo-50 hover:bg-gray-50 group transition-colors items-center"
                                                        >
                                                            <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-bold text-gray-800 truncate">{entry.source}</span>
                                                                    <div className="bg-gray-100 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <Pencil className="w-3 h-3 text-gray-400" />
                                                                    </div>
                                                                </div>
                                                                <span className="text-[10px] mobile-sub-text font-medium text-gray-400">{entry.date} • {normalizePerson(entry.person)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-xs font-bold font-mono ${normalizePerson(entry.person) === 'royyan' ? 'text-blue-600' : 'text-emerald-600'}`}>
                                                                    {formatCurrency(entry.amount)}
                                                                </span>
                                                                <ChevronRight className="w-4 h-4 text-gray-300" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:flex flex-col h-full overflow-hidden">
                            <div className="overflow-auto flex-1">
                                <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="px-6 py-4 text-left font-bold text-gray-500 uppercase tracking-wider text-xs w-32">Month</th>
                                            <th className="px-6 py-4 text-left font-bold text-gray-500 uppercase tracking-wider text-xs">Breakdown</th>
                                            <th className="px-6 py-4 text-right font-bold text-blue-600 uppercase tracking-wider text-xs w-32">Royyan</th>
                                            <th className="px-6 py-4 text-right font-bold text-emerald-600 uppercase tracking-wider text-xs w-32">Inez</th>
                                            <th className="px-6 py-4 text-right font-bold text-indigo-600 uppercase tracking-wider text-xs w-40">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {processedData.map((monthData) => {
                                            const monthTotals = getMonthTotals(monthData.entries);
                                            // Handle case with no data if we want to show all months, but currently we filter
                                            if (monthData.entries.length === 0) return null;

                                            return (
                                                <React.Fragment key={monthData.month}>
                                                    {/* Month Summary Row */}
                                                    <tr className="bg-gray-50 border-b border-gray-100 cursor-default">
                                                        <td className="px-6 py-3 whitespace-nowrap font-bold text-gray-800 text-sm">
                                                            {monthData.month}
                                                        </td>
                                                        <td className="px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                                            Monthly Total
                                                        </td>
                                                        <td className="px-6 py-3 whitespace-nowrap text-right font-mono font-bold text-blue-700 text-sm">
                                                            {formatCurrency(monthTotals.royyan)}
                                                        </td>
                                                        <td className="px-6 py-3 whitespace-nowrap text-right font-mono font-bold text-emerald-700 text-sm">
                                                            {formatCurrency(monthTotals.inez)}
                                                        </td>
                                                        <td className="px-6 py-3 whitespace-nowrap text-right font-mono font-bold text-indigo-700 bg-indigo-50/30 text-sm">
                                                            {formatCurrency(monthTotals.total)}
                                                        </td>
                                                    </tr>

                                                    {/* Individual Entry Rows */}
                                                    {monthData.entries.map((entry, idx) => {
                                                        const isRoyyan = normalizePerson(entry.person) === 'royyan';
                                                        const isInez = normalizePerson(entry.person) === 'inez';

                                                        return (
                                                            <tr
                                                                key={idx}
                                                                onClick={() => setEditingIncome(monthData.rawEntries[idx])}
                                                                className={`group transition-colors cursor-pointer hover:bg-gray-50 ${editingIncome?.id === monthData.rawEntries[idx].id ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : 'bg-white'}`}
                                                            >
                                                                {/* Indent / Spacer */}
                                                                <td className="px-6 py-2 border-b border-gray-50"></td>

                                                                {/* Source & Actions */}
                                                                <td className="px-6 py-2 border-b border-gray-50">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className={`p-1 rounded-full ${isRoyyan ? 'bg-blue-100/50' : 'bg-emerald-100/50'}`}>
                                                                            <div className={`w-1.5 h-1.5 rounded-full ${isRoyyan ? 'bg-blue-500' : 'bg-emerald-500'}`}></div>
                                                                        </div>
                                                                        <span className="text-gray-600 font-medium text-xs truncate max-w-[200px]" title={entry.source}>
                                                                            {entry.source}
                                                                        </span>
                                                                        <Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                                    </div>
                                                                </td>

                                                                {/* Royyan Column */}
                                                                <td className="px-6 py-2 whitespace-nowrap text-right border-b border-gray-50">
                                                                    {isRoyyan && (
                                                                        <span className="font-mono text-xs font-medium text-blue-600">
                                                                            {formatCurrency(entry.amount)}
                                                                        </span>
                                                                    )}
                                                                </td>

                                                                {/* Inez Column */}
                                                                <td className="px-6 py-2 whitespace-nowrap text-right border-b border-gray-50">
                                                                    {isInez && (
                                                                        <span className="font-mono text-xs font-medium text-emerald-600">
                                                                            {formatCurrency(entry.amount)}
                                                                        </span>
                                                                    )}
                                                                </td>

                                                                {/* Entry Total Column (Same as amount) */}
                                                                <td className="px-6 py-2 whitespace-nowrap text-right border-b border-gray-50">
                                                                    <span className="font-mono text-xs font-medium text-gray-400 group-hover:text-gray-600">
                                                                        {formatCurrency(entry.amount)}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })}

                                        {/* Total Footer Row */}
                                        <tr className="bg-gray-100 border-t-2 border-gray-200 font-bold">
                                            <td className="px-6 py-4 uppercase text-xs text-gray-500">Year Total</td>
                                            <td className="px-6 py-4 text-right text-xs text-gray-400 uppercase">Sum of displayed months</td>
                                            <td className="px-6 py-4 text-right text-blue-700 font-mono text-base">
                                                {formatCurrency(processedData.reduce((acc, m) => acc + getMonthTotals(m.entries).royyan, 0))}
                                            </td>
                                            <td className="px-6 py-4 text-right text-emerald-700 font-mono text-base">
                                                {formatCurrency(processedData.reduce((acc, m) => acc + getMonthTotals(m.entries).inez, 0))}
                                            </td>
                                            <td className="px-6 py-4 text-right text-indigo-700 font-mono text-lg">
                                                {formatCurrency(processedData.reduce((acc, m) => acc + getMonthTotals(m.entries).total, 0))}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Edit Panel - Desktop Slide-in / Mobile Full Screen */}
                {editingIncome && (
                    <div ref={editPanelRef} className="w-full md:w-1/3 bg-white md:border-l border-gray-200 shadow-xl z-20 flex flex-col h-full absolute inset-0 md:static">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <h3 className="font-bold text-gray-800">Edit Income</h3>
                            <button onClick={() => setEditingIncome(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                                <ChevronRight className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="flex-1 p-6 overflow-y-auto space-y-4">
                            {/* Date */}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Date</label>
                                <input
                                    type="date"
                                    value={editingIncome.date} // Needs standard YYYY-MM-DD
                                    onChange={e => setEditingIncome({ ...editingIncome, date: e.target.value })}
                                    className="w-full border-gray-200 rounded-lg text-sm font-semibold"
                                />
                            </div>

                            {/* Source */}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Source / Description</label>
                                <input
                                    type="text"
                                    value={editingIncome.source}
                                    onChange={e => setEditingIncome({ ...editingIncome, source: e.target.value })}
                                    className="w-full border-gray-200 rounded-lg text-sm font-semibold"
                                />
                            </div>

                            {/* Person */}
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Person</label>
                                <select
                                    value={editingIncome.person}
                                    onChange={e => setEditingIncome({ ...editingIncome, person: e.target.value })}
                                    className="w-full border-gray-200 rounded-lg text-sm font-semibold"
                                >
                                    <option value="Royyan Wicaksono">Royyan Wicaksono</option>
                                    <option value="Inez">Inez</option>
                                </select>
                            </div>

                            <div className="pt-4 border-t border-gray-100 space-y-4">
                                {/* Base Income */}
                                <div>
                                    <label className="block text-xs font-bold text-blue-500 uppercase tracking-wider mb-1">Base Income</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-gray-400 text-sm">Rp</span>
                                        <input
                                            type="number"
                                            value={editingIncome.baseIncome}
                                            onChange={e => setEditingIncome({ ...editingIncome, baseIncome: Number(e.target.value) })}
                                            className="w-full pl-10 border-gray-200 rounded-lg text-sm font-mono font-bold"
                                        />
                                    </div>
                                </div>

                                {/* Allowance */}
                                <div>
                                    <label className="block text-xs font-bold text-emerald-500 uppercase tracking-wider mb-1">Allowance / Bonus</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-gray-400 text-sm">Rp</span>
                                        <input
                                            type="number"
                                            value={editingIncome.allowance}
                                            onChange={e => setEditingIncome({ ...editingIncome, allowance: Number(e.target.value) })}
                                            className="w-full pl-10 border-gray-200 rounded-lg text-sm font-mono font-bold"
                                        />
                                    </div>
                                </div>

                                {/* Deduction */}
                                <div>
                                    <label className="block text-xs font-bold text-rose-500 uppercase tracking-wider mb-1">Tax / Deductions</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-gray-400 text-sm">Rp</span>
                                        <input
                                            type="number"
                                            value={editingIncome.deduction}
                                            onChange={e => setEditingIncome({ ...editingIncome, deduction: Number(e.target.value) })}
                                            className="w-full pl-10 border-gray-200 rounded-lg text-sm font-mono font-bold"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Computed Preview */}
                            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="text-gray-500">Total Gross</span>
                                    <span className="font-bold">{formatCurrency((editingIncome.baseIncome || 0) + (editingIncome.allowance || 0))}</span>
                                </div>
                                <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                                    <span className="font-bold text-indigo-700">Net Take Home</span>
                                    <span className="font-bold text-indigo-700">{formatCurrency(((editingIncome.baseIncome || 0) + (editingIncome.allowance || 0)) - (editingIncome.deduction || 0))}</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-gray-50 border-t border-gray-200 flex gap-3">
                            <button
                                onClick={handleDelete}
                                disabled={isSaving}
                                className="px-4 py-3 bg-white border border-red-200 text-red-600 rounded-xl font-bold text-sm hover:bg-red-50 flex-1 transition-colors"
                            >
                                Delete
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={isSaving}
                                className="px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 flex-[2] transition-colors shadow-lg shadow-indigo-200"
                            >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default IncomeManager;
