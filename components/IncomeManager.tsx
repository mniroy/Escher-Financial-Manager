import React, { useState, useMemo } from 'react';
import { Wallet, TrendingUp, ChevronDown, ChevronRight, Receipt, Percent } from 'lucide-react';
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
}

interface Props {
    incomeData: IncomeEntry[];
}

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// Helper to normalize person names
const normalizePerson = (name: string): 'royyan' | 'inez' | 'other' => {
    const lower = name.toLowerCase();
    if (lower.includes('royyan')) return 'royyan';
    if (lower.includes('inez')) return 'inez';
    return 'other';
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

    // Try format: "July 2025" or "Jul 2025"
    if (monthStr) {
        for (let i = 0; i < MONTHS.length; i++) {
            if (monthStr.toLowerCase().includes(MONTHS[i].toLowerCase().substring(0, 3))) {
                const yearMatch = monthStr.match(/\d{4}/);
                if (yearMatch) {
                    return { month: MONTHS[i], year: parseInt(yearMatch[0]) };
                }
            }
        }
    }

    // Fallback: use date column data if available
    if (yearFromDate !== null && monthFromDate !== null && monthFromDate >= 0 && monthFromDate < 12) {
        return { month: MONTHS[monthFromDate], year: yearFromDate };
    }

    return null;
};

const IncomeManager: React.FC<Props> = ({ incomeData }) => {
    const currentYear = new Date().getFullYear();
    const [activeTab, setActiveTab] = useState<IncomeTab>('net');
    const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
    const [selectedYear, setSelectedYear] = useState(currentYear);

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
                entries: []
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

    const totals = useMemo(() => {
        let royyanTotal = 0;
        let inezTotal = 0;
        processedData.forEach(monthData => {
            monthData.entries.forEach(entry => {
                const normalized = normalizePerson(entry.person);
                if (normalized === 'royyan') royyanTotal += entry.amount;
                else if (normalized === 'inez') inezTotal += entry.amount;
            });
        });
        return {
            royyan: royyanTotal,
            inez: inezTotal,
            joint: royyanTotal + inezTotal
        };
    }, [processedData]);

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

    const getTabConfig = () => {
        switch (activeTab) {
            case 'net':
                return {
                    title: 'Net Income',
                    gradient: 'from-indigo-600 via-indigo-500 to-violet-500',
                    shadow: 'shadow-indigo-200',
                    icon: <Wallet className="w-5 h-5" />
                };
            case 'gross':
                return {
                    title: 'Gross Income',
                    gradient: 'from-emerald-600 via-emerald-500 to-teal-500',
                    shadow: 'shadow-emerald-200',
                    icon: <Receipt className="w-5 h-5" />
                };
            case 'tax':
                return {
                    title: 'Tax Deductions',
                    gradient: 'from-rose-600 via-rose-500 to-pink-500',
                    shadow: 'shadow-rose-200',
                    icon: <Percent className="w-5 h-5" />
                };
        }
    };

    const tabConfig = getTabConfig();

    return (
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
            {/* Tab Navigation */}
            <div className="px-4 pt-4 pb-2 bg-white border-b border-gray-100">
                <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                    <button
                        onClick={() => { setActiveTab('net'); setExpandedMonth(null); }}
                        className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all ${activeTab === 'net'
                            ? 'bg-white text-indigo-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Net Income
                    </button>
                    <button
                        onClick={() => { setActiveTab('gross'); setExpandedMonth(null); }}
                        className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all ${activeTab === 'gross'
                            ? 'bg-white text-emerald-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Gross Income
                    </button>
                    <button
                        onClick={() => { setActiveTab('tax'); setExpandedMonth(null); }}
                        className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all ${activeTab === 'tax'
                            ? 'bg-white text-rose-600 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Tax
                    </button>
                </div>
            </div>

            {/* Balance Card */}
            <div className={`mx-4 mt-4 bg-gradient-to-br ${tabConfig.gradient} rounded-3xl p-6 text-white shadow-xl ${tabConfig.shadow}`}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                            {tabConfig.icon}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-white/80 text-sm font-medium">{tabConfig.title}</span>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                className="bg-white/20 px-2 py-0.5 rounded-md text-xs font-semibold border-0 focus:ring-0 cursor-pointer"
                            >
                                {availableYears.map(year => (
                                    <option key={year} value={year} className="text-gray-900">YTD {year}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <button className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-white/30 transition-colors">
                        <TrendingUp className="w-4 h-4" />
                    </button>
                </div>

                <p className="text-4xl font-bold tracking-tight">
                    Rp {formatCurrency(totals.joint)}
                </p>
            </div>

            {/* Income Table */}
            <div className="flex-1 overflow-y-auto mt-4 px-4 pb-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {/* Table Header */}
                    <div className="flex bg-gray-50 border-b border-gray-200 px-3 py-3">
                        <div className="w-5 shrink-0"></div>
                        <div className="w-16 shrink-0 text-xs font-semibold text-gray-500 uppercase tracking-wide">Month</div>
                        <div className="flex-1 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right pr-4">Royyan</div>
                        <div className="flex-1 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right pr-4">Inez</div>
                        <div className="w-28 shrink-0 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Total</div>
                    </div>

                    {/* Table Body */}
                    <div className="divide-y divide-gray-50">
                        {processedData.map((monthData) => {
                            const monthTotals = getMonthTotals(monthData.entries);
                            const hasData = monthData.entries.length > 0;
                            const isExpanded = expandedMonth === monthData.month;

                            return (
                                <div key={monthData.month}>
                                    {/* Month Row */}
                                    <div
                                        onClick={() => hasData && toggleMonth(monthData.month)}
                                        className={`flex px-3 py-3 transition-colors ${hasData ? 'cursor-pointer hover:bg-indigo-50/50' : 'opacity-40'} ${isExpanded ? 'bg-indigo-50/70' : ''}`}
                                    >
                                        <div className="w-5 shrink-0 flex items-center justify-center">
                                            {hasData && (
                                                isExpanded
                                                    ? <ChevronDown className="w-4 h-4 text-indigo-500" />
                                                    : <ChevronRight className="w-4 h-4 text-gray-400" />
                                            )}
                                        </div>
                                        <div className="w-16 shrink-0 text-sm font-medium text-gray-700 whitespace-nowrap">
                                            {monthData.month.substring(0, 3)} '{String(selectedYear).slice(-2)}
                                        </div>
                                        <div className={`flex-1 text-sm tabular-nums text-right pr-4 ${hasData ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                                            {formatCurrency(monthTotals.royyan)}
                                        </div>
                                        <div className={`flex-1 text-sm tabular-nums text-right pr-4 ${hasData ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
                                            {formatCurrency(monthTotals.inez)}
                                        </div>
                                        <div className={`w-28 shrink-0 text-sm tabular-nums font-semibold text-right ${hasData ? 'text-indigo-600' : 'text-gray-400'}`}>
                                            {formatCurrency(monthTotals.total)}
                                        </div>
                                    </div>

                                    {/* Expanded Detail */}
                                    {isExpanded && hasData && (
                                        <div className="bg-gray-50/80 border-t border-gray-100">
                                            {monthData.entries.map((entry, idx) => {
                                                const normalized = normalizePerson(entry.person);
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="flex px-3 py-2 hover:bg-white/50 transition-colors"
                                                    >
                                                        <div className="w-5 shrink-0"></div>
                                                        <div className="w-16 shrink-0 flex items-start">
                                                            <span className="text-xs text-gray-400 font-mono">{entry.date}</span>
                                                        </div>
                                                        <div className="flex-1 pr-4">
                                                            {normalized === 'royyan' ? (
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-xs text-blue-600 font-medium tabular-nums">{formatCurrency(entry.amount)}</span>
                                                                    <span className="text-[10px] text-gray-400 truncate max-w-[120px] text-right" title={entry.source}>{entry.source}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-300 text-xs block text-right">-</span>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 pr-4">
                                                            {normalized === 'inez' ? (
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-xs text-pink-600 font-medium tabular-nums">{formatCurrency(entry.amount)}</span>
                                                                    <span className="text-[10px] text-gray-400 truncate max-w-[120px] text-right" title={entry.source}>{entry.source}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-300 text-xs block text-right">-</span>
                                                            )}
                                                        </div>
                                                        <div className="w-28 shrink-0 text-right">
                                                            <span className="text-xs text-gray-400 tabular-nums">{formatCurrency(entry.amount)}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Table Footer - Totals */}
                    <div className="flex px-3 py-3.5 bg-gradient-to-r from-indigo-50 to-violet-50 border-t-2 border-indigo-100">
                        <div className="w-5 shrink-0"></div>
                        <div className="w-16 shrink-0 text-sm font-bold text-gray-800">Total</div>
                        <div className="flex-1 text-sm tabular-nums font-bold text-blue-600 text-right pr-4">
                            {formatCurrency(totals.royyan)}
                        </div>
                        <div className="flex-1 text-sm tabular-nums font-bold text-pink-600 text-right pr-4">
                            {formatCurrency(totals.inez)}
                        </div>
                        <div className="w-28 shrink-0 text-sm tabular-nums font-bold text-indigo-600 text-right">
                            {formatCurrency(totals.joint)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IncomeManager;
