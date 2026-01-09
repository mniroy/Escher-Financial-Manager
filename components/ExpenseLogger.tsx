import React, { useState, useRef, useMemo } from 'react';
import { Camera, Upload, Loader2, CheckCircle2, AlertCircle, X, CreditCard, Plane } from 'lucide-react';
import { fileToGenerativePart, analyzeReceipt } from '../services/geminiService';
import { BudgetCategory, Expense, BudgetLineItem } from '../types';
import { formatCurrency } from '../constants';

interface ExpenseLoggerProps {
    onSave: (expense: Expense) => void;
    budgetItems?: BudgetLineItem[];
    appMode: 'standard' | 'yearly';
    activePlan: string;
    onModeChange: (mode: 'standard' | 'yearly', plan: string) => void;
}

interface LogTask {
    id: string;
    status: 'processing' | 'success' | 'error';
    message: string;
    detail?: string;
}

const ExpenseLogger: React.FC<ExpenseLoggerProps> = ({
    onSave,
    budgetItems = [],
    appMode,
    activePlan,
}) => {
    const [tasks, setTasks] = useState<LogTask[]>([]);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);

    // Derived active plan based on global props
    const activeYearlyPlan = useMemo(() => {
        if (appMode === 'yearly' && activePlan) {
            return budgetItems.find(i => i.name === activePlan);
        }
        return null;
    }, [appMode, activePlan, budgetItems]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const taskId = crypto.randomUUID();

            // 1. Immediate UI Feedback (Non-blocking)
            const newTask: LogTask = {
                id: taskId,
                status: 'processing',
                message: 'Photo received. AI analyzing in background...'
            };

            // Prepend new task
            setTasks(prev => [newTask, ...prev]);

            // Clear input immediately so user can upload another or leave
            e.target.value = '';

            // 2. Background Process
            try {
                const base64Data = await fileToGenerativePart(file);
                const mimeType = file.type;

                // AI Analysis
                const result = await analyzeReceipt(base64Data, mimeType);

                // Logic & categorization
                const finalCategory = activeYearlyPlan ? activeYearlyPlan.category : (result.category as BudgetCategory);
                const finalPlanName = activeYearlyPlan ? activeYearlyPlan.name : undefined;
                const expenseDate = result.date || new Date().toISOString().split('T')[0];
                const description = result.merchant || 'Receipt Expense';

                // Generate human-readable ID: YYYYMMDD-Category-description
                const dateSlug = expenseDate.replace(/-/g, '');
                const descSlug = description.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
                const expenseId = `${dateSlug}-${finalCategory.replace(/\s+/g, '')}-${descSlug}`;

                const newExpense: Expense = {
                    id: expenseId,
                    amount: result.amount,
                    category: finalCategory,
                    date: expenseDate,
                    description: description,
                    receiptUrl: `data:${mimeType};base64,${base64Data}`,
                    budgetItemName: finalPlanName
                };

                // Save
                await onSave(newExpense);

                // Update Task Status to Success
                setTasks(prev => prev.map(t =>
                    t.id === taskId
                        ? {
                            ...t,
                            status: 'success',
                            message: 'Saved!',
                            detail: `${newExpense.description} - ${formatCurrency(newExpense.amount)}`
                        }
                        : t
                ));

            } catch (error: any) {
                console.error(error);
                // Update Task Status to Error
                setTasks(prev => prev.map(t =>
                    t.id === taskId
                        ? { ...t, status: 'error', message: 'Failed to process', detail: error.message || 'Unknown error' }
                        : t
                ));
            }
        }
    };

    const removeTask = (id: string) => {
        setTasks(prev => prev.filter(t => t.id !== id));
    };

    return (
        <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

            {/* Context Banner */}
            <div className={`p-4 border-b ${appMode === 'yearly' ? 'bg-purple-50 border-purple-100' : 'bg-indigo-50 border-indigo-100'
                }`}>
                {activeYearlyPlan ? (
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-purple-100 rounded-full text-purple-700">
                            <Plane className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-purple-900 text-sm">Mode: {activeYearlyPlan.name}</h3>
                            <p className="text-xs text-purple-700">Auto-logging to: <strong>{activeYearlyPlan.category}</strong></p>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-indigo-100 rounded-full text-indigo-700">
                            <CreditCard className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-indigo-900 text-sm">Mode: Standard Spending</h3>
                            <p className="text-xs text-indigo-700">Auto-categorization active.</p>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-6">

                {/* Hidden Input for Camera */}
                <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    ref={cameraInputRef}
                    onChange={handleFileSelect}
                />

                {/* Hidden Input for File Upload */}
                <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={uploadInputRef}
                    onChange={handleFileSelect}
                />

                {/* TRIGGER AREA */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    {/* Camera Button */}
                    <div
                        onClick={() => cameraInputRef.current?.click()}
                        className={`group cursor-pointer flex flex-col items-center justify-center p-6 md:p-8 border-2 border-dashed rounded-2xl transition-all ${appMode === 'yearly' && !activeYearlyPlan
                                ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                                : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 active:scale-95'
                            }`}
                        style={{ pointerEvents: (appMode === 'yearly' && !activeYearlyPlan) ? 'none' : 'auto' }}
                    >
                        <div className="bg-white p-3 md:p-4 rounded-full shadow-sm mb-3 md:mb-4 group-hover:scale-110 transition-transform">
                            <Camera className={`w-6 h-6 md:w-8 md:h-8 ${appMode === 'yearly' ? 'text-purple-600' : 'text-indigo-600'}`} />
                        </div>
                        <h3 className="text-sm md:text-lg font-bold text-gray-800 mb-1">Take Photo</h3>
                    </div>

                    {/* Upload Button */}
                    <div
                        onClick={() => uploadInputRef.current?.click()}
                        className={`group cursor-pointer flex flex-col items-center justify-center p-6 md:p-8 border-2 border-dashed rounded-2xl transition-all ${appMode === 'yearly' && !activeYearlyPlan
                                ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                                : 'border-indigo-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 active:scale-95'
                            }`}
                        style={{ pointerEvents: (appMode === 'yearly' && !activeYearlyPlan) ? 'none' : 'auto' }}
                    >
                        <div className="bg-indigo-50 p-3 md:p-4 rounded-full shadow-sm mb-3 md:mb-4 group-hover:scale-110 transition-transform">
                            <Upload className={`w-6 h-6 md:w-8 md:h-8 ${appMode === 'yearly' ? 'text-purple-600' : 'text-indigo-600'}`} />
                        </div>
                        <h3 className="text-sm md:text-lg font-bold text-gray-800 mb-1">Upload File</h3>
                    </div>

                    <div className="col-span-2 text-center">
                        <p className="text-xs text-gray-500">
                            AI will process receipt in background.<br />
                            You can close this or add more.
                        </p>
                    </div>

                    {appMode === 'yearly' && !activeYearlyPlan && (
                        <div className="col-span-2 bg-orange-50 text-orange-800 p-4 rounded-lg flex items-center gap-3 text-sm">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            Please select an active Yearly Plan in the Dashboard to start logging expenses for it.
                        </div>
                    )}
                </div>

                {/* BACKGROUND TASKS LIST */}
                {tasks.length > 0 && (
                    <div className="space-y-3">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Recent Activity</h4>
                        {tasks.map((task) => (
                            <div key={task.id} className="bg-white border border-gray-100 shadow-sm rounded-lg p-3 flex items-start gap-3 animate-in slide-in-from-bottom-2">
                                {task.status === 'processing' && (
                                    <div className="p-2 bg-indigo-50 rounded-full">
                                        <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                                    </div>
                                )}
                                {task.status === 'success' && (
                                    <div className="p-2 bg-emerald-50 rounded-full">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                    </div>
                                )}
                                {task.status === 'error' && (
                                    <div className="p-2 bg-red-50 rounded-full">
                                        <X className="w-4 h-4 text-red-600" />
                                    </div>
                                )}

                                <div className="flex-grow">
                                    <p className={`text-sm font-medium ${task.status === 'error' ? 'text-red-700' : 'text-gray-900'
                                        }`}>
                                        {task.message}
                                    </p>
                                    {task.detail && (
                                        <p className="text-xs text-gray-500 mt-0.5">{task.detail}</p>
                                    )}
                                </div>

                                {task.status !== 'processing' && (
                                    <button
                                        onClick={() => removeTask(task.id)}
                                        className="text-gray-300 hover:text-gray-500 p-1"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

            </div>
        </div>
    );
};

export default ExpenseLogger;