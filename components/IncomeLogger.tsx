import React, { useState, useRef } from 'react';
import { Wallet, Landmark, Calendar, User, ArrowRight, Save, Loader2, CheckCircle2, Camera, Upload, AlertCircle, X } from 'lucide-react';
import { analyzeIncome, fileToGenerativePart } from '../services/geminiService';
import { IncomeEntry } from '../types';
import { formatCurrency } from '../constants';

interface IncomeLoggerProps {
    onSave: (income: IncomeEntry) => Promise<void>;
}

interface LogTask {
    id: string;
    status: 'processing' | 'success' | 'error';
    message: string;
    detail?: string;
}

const IncomeLogger: React.FC<IncomeLoggerProps> = ({ onSave }) => {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [tasks, setTasks] = useState<LogTask[]>([]);

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        person: 'Royyan',
        source: '',
        category: 'Salary',
        baseIncome: 0,
        allowance: 0,
        deduction: 0,
        paymentMethod: 'Bank Transfer'
    });

    const totalIncome = formData.baseIncome + formData.allowance;
    const takeHomePay = totalIncome - formData.deduction;

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            const taskId = crypto.randomUUID();

            setTasks(prev => [{ id: taskId, status: 'processing', message: 'Analyzing image...' }, ...prev]);
            e.target.value = '';

            try {
                const base64Data = await fileToGenerativePart(file);
                const result = await analyzeIncome(base64Data, file.type);

                // Populate form with AI results
                setFormData(prev => ({
                    ...prev,
                    date: result.date || prev.date,
                    person: (result.person as 'Royyan' | 'Inez') || prev.person,
                    source: result.source || prev.source,
                    category: result.category || prev.category,
                    baseIncome: result.baseIncome || 0,
                    allowance: result.allowance || 0,
                    deduction: result.deduction || 0,
                    paymentMethod: result.paymentMethod || prev.paymentMethod
                }));

                setTasks(prev => prev.map(t => t.id === taskId ? {
                    ...t, status: 'success', message: 'Analysis Complete!', detail: `Extracted ${formatCurrency(result.takeHomePay)} for ${result.person || 'Unknown'}`
                } : t));
            } catch (error: any) {
                setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'error', message: 'AI Analysis Failed', detail: error.message } : t));
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.source || totalIncome <= 0) {
            alert("Please provide source and valid amounts.");
            return;
        }

        setLoading(true);
        try {
            const entry: IncomeEntry = {
                id: crypto.randomUUID(),
                date: formData.date,
                month: formData.date.substring(0, 7), // YYYY-MM
                person: formData.person,
                source: formData.source,
                category: formData.category,
                baseIncome: formData.baseIncome,
                allowance: formData.allowance,
                totalIncome: totalIncome,
                deduction: formData.deduction,
                takeHomePay: takeHomePay,
                paymentMethod: formData.paymentMethod
            };

            await onSave(entry);
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                setFormData(prev => ({
                    ...prev,
                    source: '',
                    baseIncome: 0,
                    allowance: 0,
                    deduction: 0
                }));
            }, 3000);
        } catch (error) {
            console.error("Failed to save income", error);
            alert("Failed to save income.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">

            {/* AI Action Area */}
            <div className="bg-white rounded-[2.5rem] shadow-xl shadow-indigo-100/30 border border-gray-100 overflow-hidden">
                <div className="p-8 md:p-10 bg-gradient-to-br from-indigo-600 to-indigo-700 text-white relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl"></div>
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-5">
                            <div className="p-4 bg-white/20 rounded-[2rem] backdrop-blur-xl shadow-inner">
                                <Wallet className="w-10 h-10" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black tracking-tight">Income Submission</h2>
                                <p className="text-indigo-100 font-medium opacity-80">AI-powered recognition for payslips & bank transfers</p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => cameraInputRef.current?.click()}
                                className="flex items-center gap-3 bg-white/20 hover:bg-white/30 backdrop-blur-md px-6 py-3 rounded-2xl font-bold transition-all active:scale-95"
                            >
                                <Camera className="w-5 h-5" />
                                <span>Scan</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => uploadInputRef.current?.click()}
                                className="flex items-center gap-3 bg-white text-indigo-600 px-6 py-3 rounded-2xl font-bold shadow-lg shadow-indigo-900/20 active:scale-95 transition-all"
                            >
                                <Upload className="w-5 h-5" />
                                <span>Upload</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Form Section */}
                <form onSubmit={handleSubmit} className="p-8 md:p-12">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">

                        {/* Basic Info Column */}
                        <div className="space-y-8">
                            <div>
                                <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                                    <div className="w-8 h-[1px] bg-indigo-100"></div>
                                    Identity & Context
                                </h3>

                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-black text-gray-400 mb-3 ml-1 uppercase">Recipient</label>
                                            <div className="flex bg-gray-50 p-1.5 rounded-2xl border border-gray-100">
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, person: 'Royyan' })}
                                                    className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${formData.person === 'Royyan' ? 'bg-white text-indigo-600 shadow-md ring-1 ring-black/5' : 'text-gray-400'}`}
                                                >
                                                    Royyan
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, person: 'Inez' })}
                                                    className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${formData.person === 'Inez' ? 'bg-white text-emerald-600 shadow-md ring-1 ring-black/5' : 'text-gray-400'}`}
                                                >
                                                    Inez
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black text-gray-400 mb-3 ml-1 uppercase">Pay Date</label>
                                            <input
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-black text-gray-400 mb-3 ml-1 uppercase">Source Entity</label>
                                        <div className="relative group">
                                            <Landmark className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 group-focus-within:text-indigo-500 transition-colors" />
                                            <input
                                                type="text"
                                                placeholder="e.g. PT Johnson & Johnson Indonesia"
                                                value={formData.source}
                                                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                                                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-black text-gray-400 mb-3 ml-1 uppercase">Category</label>
                                            <select
                                                value={formData.category}
                                                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner"
                                            >
                                                <option value="Salary">Salary</option>
                                                <option value="Bonus">Bonus</option>
                                                <option value="THR">THR</option>
                                                <option value="Side Hustle">Side Hustle</option>
                                                <option value="Investment">Investment</option>
                                                <option value="Gift">Gift</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-black text-gray-400 mb-3 ml-1 uppercase">Method</label>
                                            <select
                                                value={formData.paymentMethod}
                                                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                                                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner"
                                            >
                                                <option value="Bank Transfer">Bank Transfer</option>
                                                <option value="Cash">Cash</option>
                                                <option value="E-Wallet">E-Wallet</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Financials Column */}
                        <div className="space-y-8">
                            <div>
                                <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                                    <div className="w-8 h-[1px] bg-indigo-100"></div>
                                    Financial Breakdown
                                </h3>

                                <div className="space-y-4">
                                    <div className="p-5 bg-gray-50/50 rounded-3xl border border-gray-100 space-y-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-gray-400 mb-2 ml-1 uppercase">Base Amount</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 font-black text-sm">Rp</span>
                                                <input
                                                    type="number"
                                                    value={formData.baseIncome || ''}
                                                    onChange={(e) => setFormData({ ...formData, baseIncome: Number(e.target.value) })}
                                                    className="w-full bg-white border border-gray-100 rounded-2xl py-4 pl-12 pr-4 text-xl font-black text-gray-900 focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                                    placeholder="0"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-[10px] font-black text-gray-400 mb-2 ml-1 uppercase">Allowance</label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-300 font-bold text-xs">Rp</span>
                                                    <input
                                                        type="number"
                                                        value={formData.allowance || ''}
                                                        onChange={(e) => setFormData({ ...formData, allowance: Number(e.target.value) })}
                                                        className="w-full bg-white border border-gray-100 rounded-2xl py-3 pl-10 pr-4 text-sm font-black text-emerald-600 focus:ring-2 focus:ring-emerald-500 shadow-sm"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-black text-gray-400 mb-2 ml-1 uppercase">Deduction</label>
                                                <div className="relative">
                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-rose-300 font-bold text-xs">Rp</span>
                                                    <input
                                                        type="number"
                                                        value={formData.deduction || ''}
                                                        onChange={(e) => setFormData({ ...formData, deduction: Number(e.target.value) })}
                                                        className="w-full bg-white border border-gray-100 rounded-2xl py-3 pl-10 pr-4 text-sm font-black text-rose-500 focus:ring-2 focus:ring-rose-500 shadow-sm"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Final Summary Card */}
                                    <div className="bg-indigo-600 rounded-[2rem] p-8 text-white shadow-xl shadow-indigo-200">
                                        <div className="flex justify-between items-center mb-6">
                                            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Estimation Result</span>
                                            <div className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase">Net Pay</div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-baseline">
                                                <span className="text-xs font-bold opacity-70">Gross Total</span>
                                                <span className="text-lg font-bold">{formatCurrency(totalIncome)}</span>
                                            </div>
                                            <div className="h-[1px] bg-white/10 my-4"></div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm font-black text-indigo-100">Take Home Pay</span>
                                                <span className="text-3xl font-black tracking-tighter">{formatCurrency(takeHomePay)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-16 flex justify-center">
                        <button
                            type="submit"
                            disabled={loading || success}
                            className={`
                                overflow-hidden group px-20 py-5 rounded-[2rem] font-black text-xl shadow-2xl transition-all active:scale-[0.98]
                                ${success
                                    ? 'bg-emerald-500 text-white shadow-emerald-200'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-300 shadow-indigo-600/30'}
                            `}
                        >
                            {loading ? <Loader2 className="w-7 h-7 animate-spin" /> :
                                success ? <CheckCircle2 className="w-7 h-7" /> :
                                    <span className="flex items-center gap-3">Register Income <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" /></span>}
                        </button>
                    </div>
                </form>

                {/* Hidden Inputs */}
                <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleFileSelect} />
                <input type="file" accept="image/*" className="hidden" ref={uploadInputRef} onChange={handleFileSelect} />
            </div>

            {/* AI Analysis Queue */}
            {tasks.length > 0 && (
                <div className="bg-white rounded-[2rem] shadow-lg border border-gray-100 overflow-hidden">
                    <div className="p-4 px-8 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Processing Intelligence</h4>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                            <span className="text-[10px] font-black text-indigo-500 uppercase">Live Queue</span>
                        </div>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {tasks.map((task) => (
                            <div key={task.id} className="p-5 px-8 flex items-center gap-5 hover:bg-gray-50/50 transition-colors">
                                {task.status === 'processing' ? <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" /> :
                                    task.status === 'success' ? <div className="p-1 bg-emerald-100 rounded-lg"><CheckCircle2 className="w-4 h-4 text-emerald-600" /></div> :
                                        <div className="p-1 bg-red-100 rounded-lg"><AlertCircle className="w-4 h-4 text-red-600" /></div>}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-black text-gray-900 truncate">{task.message}</p>
                                    {task.detail && <p className="text-xs text-gray-400 font-bold truncate mt-0.5">{task.detail}</p>}
                                </div>
                                <button type="button" onClick={() => setTasks(prev => prev.filter(t => t.id !== task.id))} className="text-gray-200 hover:text-gray-400 transition-colors p-2">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default IncomeLogger;
