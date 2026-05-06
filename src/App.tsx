/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, BookOpen, User, GraduationCap, Loader2, RefreshCw, Image as ImageIcon, X, FileText, Plus, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { v4 as uuidv4 } from 'uuid';
import { sendMessage, Message } from './services/gemini';

interface ChatSession {
  id: string;
  title: string;
  history: Message[];
  createdAt: number;
}

export default function App() {
  const [input, setInput] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ url: string, base64: string, type: string, name: string } | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize sessions from localStorage
  useEffect(() => {
    const savedSessions = localStorage.getItem('kurtubi_sessions');
    if (savedSessions) {
      try {
        const parsed = JSON.parse(savedSessions);
        setSessions(parsed);
        if (parsed.length > 0) {
          setCurrentSessionId(parsed[0].id);
        } else {
          createNewSession();
        }
      } catch (e) {
        console.error("Failed to parse sessions", e);
        createNewSession();
      }
    } else {
      createNewSession();
    }
  }, []);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('kurtubi_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const history = currentSession?.history || [];

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: uuidv4(),
      title: 'নতুন চ্যাট',
      history: [],
      createdAt: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    if (currentSessionId === id) {
      if (updated.length > 0) {
        setCurrentSessionId(updated[0].id);
      } else {
        createNewSession();
      }
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [history, isLoading]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('দয়া করে ছবি বা PDF ফাইল সিলেক্ট করো।');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setSelectedFile({
        url: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
        base64,
        type: file.type,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSendWithPrompt = async (forcedPrompt: string) => {
    if (isLoading || !currentSessionId || !selectedFile) return;

    const currentFile = selectedFile;
    setSelectedFile(null);
    setInput('');
    setError(null);
    
    const parts: any[] = [{ text: forcedPrompt }];
    parts.push({ 
      inlineData: { 
        mimeType: currentFile.type, 
        data: currentFile.base64 
      } 
    });

    const newUserMessage: Message = { role: 'user', parts };
    const updatedHistory = [...history, newUserMessage];
    
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        return { ...s, history: updatedHistory };
      }
      return s;
    }));

    setIsLoading(true);
    try {
      const fileData = { mimeType: currentFile.type, data: currentFile.base64 };
      const responseText = await sendMessage(forcedPrompt, history, fileData);
      const assistantMessage: Message = { role: 'model', parts: [{ text: responseText || 'দুঃখিত, আমি উত্তর খুঁজে পাচ্ছি না।' }] };

      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, history: [...s.history, newUserMessage, assistantMessage] };
        }
        return s;
      }));
    } catch (err) {
      setError('কিছু সমস্যা হয়েছে। আবার চেষ্টা করো!');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !selectedFile) || isLoading || !currentSessionId) return;

    const userMessage = input.trim();
    const currentFile = selectedFile;
    
    setInput('');
    setSelectedFile(null);
    setError(null);
    
    const parts: any[] = [{ text: userMessage || (currentFile?.type === 'application/pdf' ? "এই PDF ফাইলটি বিশ্লেষণ করো" : "এই ছবিটা বিশ্লেষণ করো") }];
    if (currentFile) {
      parts.push({ 
        inlineData: { 
          mimeType: currentFile.type, 
          data: currentFile.base64 
        } 
      });
    }

    const newUserMessage: Message = { 
      role: 'user', 
      parts
    };
    
    // Update local history for UI feel
    const updatedHistory = [...history, newUserMessage];
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        // Update title if it's the first message
        let title = s.title;
        if (s.history.length === 0 && userMessage) {
          title = userMessage.substring(0, 30) + (userMessage.length > 30 ? '...' : '');
        }
        return { ...s, history: updatedHistory, title };
      }
      return s;
    }));

    setIsLoading(true);

    try {
      const fileData = currentFile ? { mimeType: currentFile.type, data: currentFile.base64 } : undefined;
      const responseText = await sendMessage(userMessage || "ফাইলটি বিশ্লেষণ করো", history, fileData);
      
      const assistantMessage: Message = { 
        role: 'model', 
        parts: [{ text: responseText || 'দুঃখিত, আমি উত্তর খুঁজে পাচ্ছি না।' }] 
      };

      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, history: [...s.history, newUserMessage, assistantMessage] };
        }
        return s;
      }));
    } catch (err) {
      setError('কিছু সমস্যা হয়েছে। আবার চেষ্টা করো!');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4">
      <div className="mesh-bg" />

      <div className="glass-container relative z-10 w-full max-w-6xl h-[85vh] flex flex-row rounded-3xl overflow-hidden animate-in fade-in zoom-in duration-700">
        
        <aside className="hidden md:flex w-72 bg-black/20 border-r border-white/10 flex-col p-6 overflow-hidden">
          <div className="flex items-center gap-3 mb-8 group cursor-default">
            <div className="w-10 h-10 rounded-xl bg-glass-accent flex items-center justify-center shadow-[0_0_15px_-3px_rgba(251,191,36,0.6)]">
              <GraduationCap size={24} className="text-black" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">Kurtubi AI</h1>
          </div>

          <div className="flex items-center gap-2 mb-8 text-emerald-400 text-xs font-medium">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]" />
            অনলাইনে আছে
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-glass-muted mb-4 opacity-50">সাম্প্রতিক চ্যাট</p>
              <div className="space-y-2">
                {sessions.map((session) => (
                  <div 
                    key={session.id}
                    onClick={() => setCurrentSessionId(session.id)}
                    className={`group p-3 rounded-xl border transition-all text-xs flex items-center gap-2 cursor-pointer ${
                      currentSessionId === session.id 
                      ? 'bg-white/10 border-white/10 text-white shadow-lg' 
                      : 'border-transparent text-glass-muted hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <BookOpen size={14} className={currentSessionId === session.id ? 'text-glass-accent' : 'opacity-50'} />
                    <span className="truncate flex-1">{session.title}</span>
                    <button 
                      onClick={(e) => deleteSession(e, session.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-white/5">
            <button 
              onClick={createNewSession}
              className="w-full p-3 rounded-xl border border-white/10 border-dashed text-glass-muted hover:text-white hover:bg-white/5 transition-all text-sm flex items-center justify-center gap-2"
            >
              <Plus size={14} />
              নতুন চ্যাট শুরু করো
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 bg-transparent relative">
          <header className="md:hidden p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-glass-accent">
                <GraduationCap size={16} className="text-black" />
              </div>
              <h2 className="font-bold text-white">Kurtubi AI</h2>
            </div>
            <button onClick={createNewSession} className="p-2 text-glass-muted hover:text-white">
              <Plus size={18} />
            </button>
          </header>

          <main 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 scroll-smooth custom-scrollbar"
          >
            <AnimatePresence initial={false}>
              {history.length === 0 && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-start h-full text-center space-y-8 pt-20 pb-10"
                >
                  <div className="relative">
                    <div className="w-24 h-24 bg-glass-accent/30 rounded-full flex items-center justify-center blur-2xl absolute inset-0 animate-pulse" />
                    <div className="w-24 h-24 bg-glass-accent rounded-full flex items-center justify-center text-black relative shadow-[0_0_30px_-5px_rgba(251,191,36,0.6)]">
                      <GraduationCap size={44} />
                    </div>
                  </div>
                  
                  <div className="max-w-2xl space-y-4">
                    <h2 className="text-4xl font-bold text-white leading-tight">
                      Assalamu alaikum!
                    </h2>
                    <p className="text-glass-muted text-xl leading-relaxed">
                      আমি Kurtubi AI তোমার Friendly Study Helper <br />
                      বিজ্ঞান, গণিত, জীববিজ্ঞানসহ যেকোনো বিষয় খুব সহজ, মজার ও গভীরভাবে বুঝিয়ে দিতে পারি।
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg px-4">
                    {[
                      "নিউটন এর গতিসূত্র কী?",
                      "গণিত কেন কঠিন মনে হয়?",
                      "সালোকসংশ্লেষণ কী?",
                      "ভালো করে পড়ার ৫টা বাস্তব টিপস দাও?"
                    ].map((example) => (
                      <button
                        key={example}
                        onClick={() => setInput(example)}
                        className="p-3 text-sm text-center text-glass-muted bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 hover:border-white/20 hover:text-white transition-all backdrop-blur-sm"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {history.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex flex-col max-w-[85%] md:max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} gap-1`}>
                    <div className={`p-4 rounded-2xl ${
                      msg.role === 'user' 
                      ? 'bg-blue-600/30 border border-blue-500/20 text-white rounded-tr-none' 
                      : 'bg-white/10 border border-white/10 text-slate-200 rounded-tl-none'
                    }`}>
                      {msg.role === 'model' && (
                        <div className="flex items-center gap-2 mb-3 text-glass-accent font-bold text-[10px] uppercase tracking-widest">
                          <span className="w-4 h-4 rounded-full bg-glass-accent/20 flex items-center justify-center">🤖</span>
                          Kurtubi AI
                        </div>
                      )}
                      
                      {msg.parts.some(p => 'inlineData' in p) && (
                        <div className="mb-3 rounded-lg overflow-hidden border border-white/10">
                          {msg.parts.map((p, i) => {
                            if ('inlineData' in p) {
                              if (p.inlineData.mimeType.startsWith('image/')) {
                                return (
                                  <img 
                                    key={i}
                                    src={`data:${p.inlineData.mimeType};base64,${p.inlineData.data}`}
                                    alt="Uploaded"
                                    className="max-w-full h-auto max-h-60"
                                  />
                                );
                              } else if (p.inlineData.mimeType === 'application/pdf') {
                                return (
                                  <div key={i} className="bg-red-500/10 p-4 flex items-center gap-3">
                                    <FileText size={24} className="text-red-400" />
                                    <span className="text-xs text-white font-medium">PDF ফাইল যুক্ত করা হয়েছে</span>
                                  </div>
                                );
                              }
                            }
                            return null;
                          })}
                        </div>
                      )}

                      <div className="markdown-body text-[15px] leading-relaxed">
                        <ReactMarkdown>
                          {msg.parts
                            .filter((p): p is { text: string } => 'text' in p)
                            .map(p => p.text)
                            .join('\n')}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}

              {isLoading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                  <div className="flex items-center gap-3 py-2 px-4 rounded-full bg-white/5 border border-white/10 text-xs text-glass-muted">
                    <Loader2 className="animate-spin text-glass-accent" size={14} />
                    <span>Kurtubi is thinking...</span>
                  </div>
                </motion.div>
              )}

              {error && (
                <div className="py-3 px-6 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-center text-xs">
                  {error}
                </div>
              )}
            </AnimatePresence>
          </main>

          <footer className="p-4 md:p-8 pt-0">
            <div className="relative">
              <AnimatePresence>
                {selectedFile && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute bottom-full mb-3 left-0 p-2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl flex items-center gap-3 max-w-full overflow-hidden"
                  >
                    {selectedFile.type.startsWith('image/') ? (
                      <img src={selectedFile.url} alt="Preview" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 flex-shrink-0">
                        <FileText size={20} />
                      </div>
                    )}
                    <div className="text-xs text-white pr-8 truncate">
                      <p className="font-bold truncate">{selectedFile.name}</p>
                      <div className="flex gap-2 mt-1">
                        <p className="text-glass-muted opacity-60">ফাইল যুক্ত করা হয়েছে</p>
                        {selectedFile.type === 'application/pdf' && (
                          <button 
                            onClick={() => {
                              const summaryPrompt = "এই PDF ফাইলটির একটি বিস্তারিত কিন্তু সহজ সারাংশ (Summary) দাও। মূল পয়েন্টগুলো বুলেট আকারে লিখবে।";
                              handleSendWithPrompt(summaryPrompt);
                            }}
                            className="text-glass-accent font-bold hover:underline"
                          >
                            • সারাংশ করো
                          </button>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => setSelectedFile(null)}
                      className="absolute top-1 right-1 p-1 text-glass-muted hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="absolute inset-0 bg-glass-accent/5 blur-xl rounded-full opacity-50 -z-10" />
              <div className="flex items-end gap-2 p-2 pl-4 bg-white/5 border border-white/20 rounded-2xl backdrop-blur-md transition-all focus-within:border-glass-accent/50 group">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*,application/pdf"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 text-glass-muted hover:text-glass-accent transition-colors mb-1"
                  title="ছবি বা PDF আপলোড করো"
                >
                  <ImageIcon size={20} />
                </button>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={selectedFile ? "ফাইলের সাথে কোনো প্রশ্ন আছে?" : "তোমার প্রশ্নটি এখানে লেখো..."}
                  rows={1}
                  className="flex-1 bg-transparent py-3 pr-2 text-white placeholder-glass-muted focus:outline-none resize-none max-h-40 min-h-[48px] custom-scrollbar text-sm"
                />
                <button
                  onClick={handleSend}
                  disabled={(!input.trim() && !selectedFile) || isLoading}
                  className="p-3 bg-glass-accent text-black rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-30 flex items-center justify-center shadow-[0_0_15px_rgba(251,191,36,0.3)] mb-1"
                >
                  <Send size={18} strokeWidth={2.5} />
                </button>
              </div>
              <p className="text-[9px] text-center mt-4 text-glass-muted tracking-widest uppercase font-bold opacity-30">
                Create Study Helper | Al Khawarizmi Science Team
              </p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
