import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Camera, Upload, Loader2, CheckCircle2, AlertCircle, X, CreditCard, Plane } from 'lucide-react';
import { fileToGenerativePart, analyzeReceipt } from '../services/geminiService';
import { getWahaConfig } from '../services/wahaService';
import { BudgetCategory, Expense, BudgetLineItem, PeriodMode } from '../types';
import { formatCurrency } from '../constants';


interface ExpenseLoggerProps {
    onSave: (expense: Expense) => Promise<void>;
    onUploadReceipt: (base64Data: string, mimeType: string, fileName: string, expenseDate: string) => Promise<string>;
    budgetItems?: BudgetLineItem[];
    appMode: 'standard' | 'yearly';
    activePlan: string;
    onModeChange: (mode: 'standard' | 'yearly', plan: string) => void;
    initialData?: any;
    periodModes?: PeriodMode[];
}

interface LogTask {
    id: string;
    status: 'processing' | 'success' | 'error';
    message: string;
    detail?: string;
}

const ExpenseLogger: React.FC<ExpenseLoggerProps> = ({
    onSave,
    onUploadReceipt,
    budgetItems = [],
    appMode,
    activePlan,
    onModeChange,
    initialData,
    periodModes = []
}) => {
    const [tasks, setTasks] = useState<LogTask[]>([]);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const [pendingMode, setPendingMode] = useState<'standard' | 'yearly' | null>(null);

    // Helper to find matching period mode
    const findMatchingPeriod = (dateStr: string): PeriodMode | undefined => {
        if (!dateStr) return undefined;
        return periodModes.find(mode => {
            return dateStr >= mode.startDate && dateStr <= mode.endDate;
        });
    };

    // Effect to handle initialData (from WhatsApp bridge)
    useEffect(() => {
        if (initialData) {
            processInitialData(initialData);
        }
    }, [initialData]);

    // Derived active plan info
    const yearlyBudgetItems = useMemo(() => budgetItems.filter(item => item.frequency === 'Yearly'), [budgetItems]);
    const activeYearlyPlan = useMemo(() => {
        if (activePlan) return budgetItems.find(i => i.name === activePlan);
        return null;
    }, [activePlan, budgetItems]);

    const processInitialData = async (data: any) => {
        const taskId = crypto.randomUUID();
        setTasks(prev => [{ id: taskId, status: 'processing', message: 'Logging WhatsApp receipt...' }, ...prev]);

        try {
            const { amount, merchant, date, category, base64Image, messageId, mimeType } = data;

            const expenseDate = date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

            // Period Mode Detection
            const matchingPeriod = findMatchingPeriod(expenseDate);
            let plan = activeYearlyPlan || (appMode === 'yearly' && activePlan ? budgetItems.find(i => i.name === activePlan) : null);

            if (matchingPeriod) {
                const periodPlan = budgetItems.find(i => i.name === matchingPeriod.budgetItemName);
                if (periodPlan) {
                    plan = periodPlan;
                    onModeChange('yearly', periodPlan.name);
                }
            }

            const finalCategory = plan ? plan.category : (category as BudgetCategory);
            const finalPlanName = plan ? plan.name : undefined;
            const description = merchant || 'WhatsApp Receipt';
            const dateSlug = expenseDate.replace(/-/g, '');
            const descSlug = description.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
            const expenseId = `${dateSlug}-${finalCategory.replace(/\s+/g, '')}-${descSlug}`;

            let finalBase64 = base64Image;
            if (messageId && !finalBase64) {
                const waha = getWahaConfig();
                if (waha.apiUrl) {
                    try {
                        const wUrl = `${waha.apiUrl}/api/${waha.session || 'default'}/messages/${messageId}/download`;
                        const res = await fetch(wUrl);
                        if (res.ok) {
                            const buffer = await res.arrayBuffer();
                            const blob = new Blob([buffer], { type: mimeType || 'image/jpeg' });
                            const reader = new FileReader();
                            finalBase64 = await new Promise((resolve) => {
                                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                                reader.readAsDataURL(blob);
                            });
                        }
                    } catch (e) { console.error(e); }
                }
            }

            let receiptUrl = '';
            if (finalBase64) {
                const fileName = `receipt-${expenseId}.${mimeType?.split('/')[1] || 'jpg'}`;
                try {
                    receiptUrl = await onUploadReceipt(finalBase64, mimeType || 'image/jpeg', fileName, expenseDate);
                } catch (e) { receiptUrl = 'upload-failed'; }
            }

            await onSave({
                id: expenseId,
                amount,
                category: finalCategory,
                date: expenseDate,
                description,
                receiptUrl: receiptUrl === 'upload-failed' ? '' : receiptUrl,
                budgetItemName: finalPlanName
            });

            setTasks(prev => prev.map(t => t.id === taskId ? {
                ...t, status: 'success', message: 'Saved!', detail: `${description} - ${formatCurrency(amount)}`
            } : t));
        } catch (error: any) {
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'error', message: 'Failed', detail: error.message } : t));
        }
    };

    const triggerUpload = (mode: 'standard' | 'yearly', type: 'camera' | 'file') => {
        if (mode === 'yearly' && !activePlan) {
            alert("Please select an Annual Plan context first.");
            return;
        }
        setPendingMode(mode);
        if (type === 'camera') cameraInputRef.current?.click();
        else uploadInputRef.current?.click();
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            const taskId = crypto.randomUUID();
            const loggingMode = pendingMode;

            setTasks(prev => [{ id: taskId, status: 'processing', message: 'Analyzing photo...' }, ...prev]);
            e.target.value = '';

            try {
                const base64Data = await fileToGenerativePart(file);

                // Extract custom categories from budgetItems
                const customCategories = Array.from(new Set(budgetItems.map(i => i.category)));
                const result = await analyzeReceipt(base64Data, file.type, customCategories);

                const expenseDate = result.date || new Date().toISOString().split('T')[0];
                const description = result.merchant || 'Receipt';

                let finalCategory: BudgetCategory;
                let finalPlanName: string | undefined;

                // Period Mode Detection
                const matchingPeriod = findMatchingPeriod(expenseDate);

                if (matchingPeriod) {
                    const plan = budgetItems.find(i => i.name === matchingPeriod.budgetItemName);
                    finalCategory = plan ? plan.category : (result.category as BudgetCategory);
                    finalPlanName = plan?.name;
                    if (finalPlanName) onModeChange('yearly', finalPlanName);
                } else if (loggingMode === 'yearly' && activePlan) {
                    const plan = budgetItems.find(i => i.name === activePlan);
                    finalCategory = plan ? plan.category : (result.category as BudgetCategory);
                    finalPlanName = plan?.name;
                    onModeChange('yearly', activePlan);
                } else {
                    finalCategory = result.category as BudgetCategory;
                    onModeChange('standard', '');
                }

                const expenseId = `${expenseDate.replace(/-/g, '')}-${finalCategory.replace(/\s+/g, '')}-${description.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 20)}`;
                const fileName = `receipt-${expenseId}.${file.type.split('/')[1] || 'jpg'}`;

                let receiptUrl = '';
                try {
                    receiptUrl = await onUploadReceipt(base64Data, file.type, fileName, expenseDate);
                } catch (e) { receiptUrl = 'upload-failed'; }

                await onSave({
                    id: expenseId,
                    amount: result.amount,
                    category: finalCategory,
                    date: expenseDate,
                    description,
                    receiptUrl: receiptUrl === 'upload-failed' ? '' : receiptUrl,
                    budgetItemName: finalPlanName
                });

                setTasks(prev => prev.map(t => t.id === taskId ? {
                    ...t, status: 'success', message: 'Saved!', detail: `${description} - ${formatCurrency(result.amount)}`
                } : t));
            } catch (error: any) {
                setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'error', message: 'Error', detail: error.message } : t));
            } finally {
                setPendingMode(null);
            }
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Input Panels */}
            <div className="bg-white rounded-[2rem] shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">

                    {/* Standard Section */}
                    <div className="p-8 md:p-10 bg-gradient-to-b from-white to-gray-50/30">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-4 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
                                <CreditCard className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-gray-900">Daily Spending</h2>
                                <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest">Standard Entry</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => triggerUpload('standard', 'camera')}
                                className="flex flex-col items-center justify-center p-6 bg-white border-2 border-dashed border-indigo-100 rounded-3xl hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md transition-all active:scale-95 group"
                            >
                                <Camera className="w-8 h-8 text-indigo-600 mb-3 group-hover:scale-110 transition-transform" />
                                <span className="text-sm font-bold text-gray-700">Scan</span>
                            </button>
                            <button
                                onClick={() => triggerUpload('standard', 'file')}
                                className="flex flex-col items-center justify-center p-6 bg-white border-2 border-dashed border-indigo-100 rounded-3xl hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md transition-all active:scale-95 group"
                            >
                                <Upload className="w-8 h-8 text-indigo-600 mb-3 group-hover:scale-110 transition-transform" />
                                <span className="text-sm font-bold text-gray-700">Upload</span>
                            </button>
                        </div>
                    </div>

                    {/* Annual Section */}
                    <div className="p-8 md:p-10 bg-gradient-to-b from-white to-gray-50/30">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-4 bg-purple-600 rounded-2xl text-white shadow-lg shadow-purple-100">
                                <Plane className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-gray-900">Events & Plans</h2>
                                <p className="text-[10px] text-purple-500 font-bold uppercase tracking-widest">Annual Budgeting</p>
                            </div>
                        </div>

                        <div className="mb-6 space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Assigned Plan</label>
                            <select
                                value={activePlan}
                                onChange={(e) => onModeChange('yearly', e.target.value)}
                                className="w-full rounded-2xl border-purple-100 shadow-sm focus:border-purple-500 focus:ring-purple-500 py-3.5 px-4 bg-white text-purple-900 font-bold text-sm transition-all cursor-pointer"
                            >
                                <option value="">-- Choose Accountable Plan --</option>
                                {yearlyBudgetItems.map((item, idx) => (
                                    <option key={idx} value={item.name}>{item.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => triggerUpload('yearly', 'camera')}
                                className={`flex flex-col items-center justify-center p-6 bg-white border-2 border-dashed rounded-3xl transition-all group ${!activePlan ? 'opacity-30 cursor-not-allowed grayscale' : 'border-purple-100 hover:border-purple-500 hover:bg-purple-50 active:scale-95 shadow-sm'}`}
                            >
                                <Camera className="w-8 h-8 text-purple-600 mb-3 group-hover:scale-110 transition-transform" />
                                <span className="text-sm font-bold text-gray-700">Scan</span>
                            </button>
                            <button
                                onClick={() => triggerUpload('yearly', 'file')}
                                className={`flex flex-col items-center justify-center p-6 bg-white border-2 border-dashed rounded-3xl transition-all group ${!activePlan ? 'opacity-30 cursor-not-allowed grayscale' : 'border-purple-100 hover:border-purple-500 hover:bg-purple-50 active:scale-95 shadow-sm'}`}
                            >
                                <Upload className="w-8 h-8 text-purple-600 mb-3 group-hover:scale-110 transition-transform" />
                                <span className="text-sm font-bold text-gray-700">Upload</span>
                            </button>
                        </div>
                    </div>
                </div>

                <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleFileSelect} />
                <input type="file" accept="image/*" className="hidden" ref={uploadInputRef} onChange={handleFileSelect} />
            </div>

            {/* Task Tracker */}
            {tasks.length > 0 && (
                <div className="max-w-2xl mx-auto space-y-3">
                    {tasks.map((task) => (
                        <div key={task.id} className="bg-white/80 backdrop-blur-md border border-gray-100 p-4 rounded-2xl flex items-center gap-4 shadow-sm animate-in slide-in-from-bottom-2">
                            {task.status === 'processing' ? <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" /> :
                                task.status === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> :
                                    <AlertCircle className="w-5 h-5 text-rose-500" />}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">{task.message}</p>
                                {task.detail && <p className="text-xs text-gray-500 font-medium truncate">{task.detail}</p>}
                            </div>
                            {task.status !== 'processing' && (
                                <button onClick={() => setTasks(prev => prev.filter(t => t.id !== task.id))} className="text-gray-300 hover:text-gray-500 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ExpenseLogger;