import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type, FunctionDeclaration, Tool } from "@google/genai";
import { Send, Bot, Sparkles, AlertCircle } from 'lucide-react';
import { BudgetCategory, Expense, BudgetLineItem } from '../types';
import { calculateBudgetSummary, formatCurrency } from '../constants';

interface ChatAssistantProps {
  onSaveExpense: (expense: Expense) => void;
  appMode: 'standard' | 'yearly';
  activePlanName: string;
  budgetItems: BudgetLineItem[];
  expenses: Expense[];
}

interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
}

const ChatAssistant: React.FC<ChatAssistantProps> = ({ 
    onSaveExpense,
    appMode,
    activePlanName,
    budgetItems,
    expenses
}) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 'init', role: 'model', text: "Hi! I'm Papion, your financial assistant. I can log expenses for you, or answer questions about your spending and budget. Try asking 'How much have I spent on Food?' or 'Log a taxi ride for 50k'." }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<any>(null);

  const activePlan = budgetItems.find(i => i.name === activePlanName);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Re-initialize Chat Session when Mode/Data changes
  useEffect(() => {
    const initChat = async () => {
      try {
        // We assume process.env.API_KEY is available as per environment configuration.
        // We do not check !process.env.API_KEY explicitly to avoid false positives if the environment handles it differently.
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const logExpenseTool: FunctionDeclaration = {
          name: "logExpense",
          description: "Logs a financial expense. Use this when the user mentions spending money.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              amount: { 
                type: Type.NUMBER, 
                description: "The numeric amount spent. If user says '50k', convert to 50000. If currency is not specified, assume user's local currency (IDR)." 
              },
              category: {
                type: Type.STRING,
                enum: Object.values(BudgetCategory),
                description: "The budget category."
              },
              description: { 
                type: Type.STRING, 
                description: "Short description of the item or service." 
              },
              date: { 
                type: Type.STRING, 
                description: "ISO 8601 date string (YYYY-MM-DD). Use today's date if not specified." 
              },
            },
            required: ["amount", "category", "description", "date"],
          },
        };

        const searchExpensesTool: FunctionDeclaration = {
          name: "searchExpenses",
          description: "Searches the user's transaction history. Use this when the user asks 'How much did I spend on X?' or 'Did I buy Y?'.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              searchTerm: {
                 type: Type.STRING,
                 description: "Keywords to match in description (e.g. 'Coffee', 'Uber'). Optional."
              },
              category: {
                type: Type.STRING,
                enum: Object.values(BudgetCategory),
                description: "Filter by category. Optional."
              },
              month: {
                type: Type.NUMBER,
                description: "Filter by month number (0-11) where 0 is January. Optional."
              }
            }
          }
        };

        const getBudgetSummaryTool: FunctionDeclaration = {
          name: "getBudgetSummary",
          description: "Gets the current status of the budget (Total Budget, Spent, Remaining) broken down by category. Use this when user asks 'How is my budget?' or 'Do I have money left for Food?'.",
          parameters: {
            type: Type.OBJECT,
            properties: {} // No params needed, calculates all
          }
        };

        const tools: Tool[] = [{ functionDeclarations: [logExpenseTool, searchExpensesTool, getBudgetSummaryTool] }];
        
        let contextInstruction = "";
        if (appMode === 'yearly' && activePlan) {
            contextInstruction = `
            IMPORTANT MODE ALERT: The user is currently in a special 'Yearly Plan Mode' for event "${activePlan.name}".
            ALL expenses logged MUST be categorized as "${activePlan.category}" automatically, unless the user strictly specifies otherwise.
            When calling 'logExpense', set the category to "${activePlan.category}" by default.
            acknowledge that this is for the "${activePlan.name}" plan in your response.
            `;
        }

        chatRef.current = ai.chats.create({
          model: 'gemini-3-flash-preview',
          config: {
            systemInstruction: `You are Papion, an intelligent financial assistant for the Escher Financial Manager app. 
            Your role is to help users log their expenses and analyze their spending habits.
            Today's date is ${new Date().toISOString().split('T')[0]}.
            ${contextInstruction}
            
            Guidelines:
            1. If the user states an expense, extract details and call 'logExpense'.
            2. If the user asks about past spending (e.g., 'How much on food?'), call 'searchExpenses' or 'getBudgetSummary'.
            3. If the user asks about budget status, call 'getBudgetSummary'.
            4. When presenting currency, use Indonesian Rupiah (IDR) formatting (e.g. Rp 50.000).
            5. Be concise, friendly, and professional.
            
            Valid Categories: ${Object.values(BudgetCategory).join(', ')}.`,
            tools: tools,
          }
        });
      } catch (error: any) {
        console.error("Chat Init Error", error);
        // We log it to chat so user can see why it failed
        setMessages(prev => [...prev, { 
            id: crypto.randomUUID(), 
            role: 'system', 
            text: `System Error: Failed to initialize AI. ${error.message || ''}` 
        }]);
      }
    };

    initChat();
  }, [appMode, activePlanName, budgetItems]);

  const handleSend = async () => {
    if (!input.trim()) return;

    // Guard against uninitialized chat
    if (!chatRef.current) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', text: "Chat system not initialized. Please refresh or check configuration." }]);
        return;
    }

    const userText = input;
    setInput('');
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', text: userText }]);
    setIsTyping(true);

    try {
      const response = await chatRef.current.sendMessage({ message: userText });
      const text = response.text;
      
      if (text) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: text }]);
      }

      // Handle Function Calls
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const functionResponses = [];
        
        for (const call of functionCalls) {
          // --- LOG EXPENSE ---
          if (call.name === 'logExpense') {
             const args = call.args as any;
             const finalCategory = (appMode === 'yearly' && activePlan) ? activePlan.category : (args.category as BudgetCategory);
             const finalPlanName = (appMode === 'yearly' && activePlan) ? activePlan.name : undefined;

             const newExpense: Expense = {
               id: crypto.randomUUID(),
               amount: args.amount,
               category: finalCategory,
               description: args.description,
               date: args.date,
               budgetItemName: finalPlanName
             };

             onSaveExpense(newExpense);

             functionResponses.push({
               functionResponse: {
                 name: call.name,
                 response: { result: `Expense logged: ${args.description} for ${args.amount}` },
                 id: call.id
               }
             });
          }
          
          // --- SEARCH EXPENSES ---
          else if (call.name === 'searchExpenses') {
             const args = call.args as any;
             
             // Client-side filtering
             const results = expenses.filter(e => {
                let match = true;
                if (args.searchTerm && !e.description.toLowerCase().includes(args.searchTerm.toLowerCase())) match = false;
                if (args.category && e.category !== args.category) match = false;
                if (args.month !== undefined && new Date(e.date).getMonth() !== args.month) match = false;
                return match;
             });

             const total = results.reduce((sum, e) => sum + e.amount, 0);
             const resultSummary = {
                count: results.length,
                totalAmount: total,
                transactions: results.slice(0, 10).map(r => `${r.date}: ${r.description} (${r.amount})`) // Limit payload
             };

             functionResponses.push({
               functionResponse: {
                 name: call.name,
                 response: { result: JSON.stringify(resultSummary) },
                 id: call.id
               }
             });
          }

          // --- GET BUDGET SUMMARY ---
          else if (call.name === 'getBudgetSummary') {
             const summary = calculateBudgetSummary(budgetItems);
             
             // Calculate actual spending vs budget for current context
             const currentMonth = new Date().getMonth();
             const currentYear = new Date().getFullYear();

             // Filter expenses for this month to check against monthly budget
             const monthlyExpenses = expenses.filter(e => {
                 const d = new Date(e.date);
                 return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
             });

             const data = summary.map(row => {
                 const spent = monthlyExpenses
                    .filter(e => e.category === row.category)
                    .reduce((sum, e) => sum + e.amount, 0);
                 
                 return {
                    category: row.category,
                    monthlyBudget: row.monthlyAllocation,
                    spentThisMonth: spent,
                    remaining: row.monthlyAllocation - spent
                 };
             });

             functionResponses.push({
               functionResponse: {
                 name: call.name,
                 response: { result: JSON.stringify(data) },
                 id: call.id
               }
             });
          }
        }

        // Send function results back to model to complete the turn
        if (functionResponses.length > 0) {
           // Correctly pass function responses using the 'message' parameter
           const nextResponse = await chatRef.current.sendMessage({ message: functionResponses });
           if (nextResponse.text) {
             setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'model', text: nextResponse.text }]);
           }
        }
      }

    } catch (error: any) {
      console.error("Chat Error", error);
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', text: `Error: ${error.message || "Failed to process request"}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-180px)] bg-gray-100 rounded-xl overflow-hidden shadow-inner border border-gray-200">
      
      {/* Messages Area - WhatsApp Style */}
      <div 
        className="flex-grow overflow-y-auto p-4 space-y-3"
        style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px' }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] md:max-w-[70%] px-4 py-2 text-sm shadow-sm relative ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-none'
                  : msg.role === 'system'
                  ? 'bg-orange-100 text-orange-800 border border-orange-200 rounded-lg text-center w-full mx-auto'
                  : 'bg-white text-gray-800 rounded-2xl rounded-tl-none border border-gray-100'
              }`}
            >
              {msg.role === 'model' && (
                  <div className="flex items-center gap-2 mb-1 border-b border-gray-50 pb-1">
                      <Bot className="w-3 h-3 text-indigo-500" />
                      <span className="text-[10px] font-bold text-indigo-500 uppercase">Papion</span>
                  </div>
              )}
              {msg.role === 'system' && <AlertCircle className="w-4 h-4 inline mr-2 -mt-1" />}
              <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex justify-start w-full animate-in fade-in zoom-in duration-300">
            <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2">
               <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" />
               <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
               </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white border-t border-gray-200">
        <div className="flex items-center gap-2 bg-gray-50 rounded-full px-2 py-2 border border-gray-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={appMode === 'yearly' && activePlan ? `Ask about ${activePlan.name}...` : "Type a message..."}
            className="flex-grow bg-transparent text-gray-900 px-4 py-2 focus:outline-none text-sm placeholder-gray-400"
            autoFocus
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2.5 rounded-full transition-colors shadow-sm flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatAssistant;