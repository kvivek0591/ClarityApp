import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { create } from 'zustand';
import { 
  FileText, 
  Upload, 
  AlertTriangle, 
  Clock, 
  Wrench, 
  ChevronRight, 
  ChevronDown, 
  CheckCircle2, 
  X,
  Menu,
  Database,
  Search,
  ArrowRight,
  ChevronLeft, 
  File,
  RotateCcw,
  Edit3,
  Check,
  Download,
  Loader2,
  Terminal,
  Filter,
  ShieldCheck,
  Lock,
  LogOut,
  Key,
  User
} from 'lucide-react';

// --- Types ---

type ViewState = 'login' | 'upload' | 'analyzing' | 'dashboard';
type ConflictType = 'TEMPORAL' | 'CONTRADICTION' | 'INTRA_DOC';
type ResolutionStatus = 'OPEN' | 'RESOLVED';
type WorkspaceMode = 'view' | 'resolve' | 'preview' | 'verifying' | 'resolved' | 'all_cleared';
type ManualAction = 'UPDATE' | 'CLARIFY' | 'ERROR' | 'KEEP';

interface Mention {
  id: string;
  docId: string;
  docName: string;
  page: number;
  section: string;
  text: string;
  date?: string; // For temporal
  sourceType?: 'Main' | 'Appendix' | 'Policy' | 'RFP';
}

interface Conflict {
  id: string;
  type: ConflictType;
  title: string;
  description: string;
  mentions: Mention[];
  status: ResolutionStatus;
  aiRecommendation?: string;
  resolvedAt?: string; // ISO String
}

interface ManualEdit {
  text: string;
  action: ManualAction;
  isDirty: boolean;
}

interface ResolutionDraft {
  conflictId: string;
  // Temporal Specifics
  selectedTemporalId?: string;
  keepHistory?: boolean;
  
  // Contradiction Specifics
  selectedCorrectId?: string; // or 'NEITHER'
  reasoning?: string;
  
  // Manual / Intra-doc Specifics
  edits: Record<string, ManualEdit>;
}

interface UploadFile {
  name: string;
  size: string;
  status: 'pending' | 'uploading' | 'complete' | 'error';
}

interface StoreState {
  view: ViewState;
  currentUser: string | null;
  files: UploadFile[];
  conflicts: Conflict[];
  selectedConflictId: string | null;
  
  // Resolution State
  workspaceMode: WorkspaceMode;
  resolutionDraft: ResolutionDraft | null;
  
  // Actions
  login: (username: string) => void;
  logout: () => void;
  setView: (view: ViewState) => void;
  setFiles: (files: UploadFile[]) => void;
  selectConflict: (id: string) => void;
  loadMockData: () => void;
  
  startResolution: () => void;
  cancelResolution: () => void;
  goToPreview: () => void;
  returnToEdit: () => void;
  submitResolution: () => void; // Starts verifying
  finalizeResolution: () => void; // Marks as resolved
  setAllCleared: () => void;
  
  updateDraft: (updates: Partial<ResolutionDraft>) => void;
  updateManualEdit: (mentionId: string, text: string, action: ManualAction) => void;
  initManualDraft: (conflict: Conflict) => void;
  
  downloadExport: () => void;
}

// --- Utils ---

// Simple word-level diff engine
const simpleDiff = (oldText: string, newText: string) => {
  const oldWords = oldText.split(/\s+/);
  const newWords = newText.split(/\s+/);
  
  if (oldText === newText) return <span className="text-ink/60">No changes detected.</span>;

  return (
    <div className="font-serif leading-relaxed">
      <span className="bg-red-100 text-red-900 line-through decoration-red-900/50 mr-2 px-1 select-none opacity-60">
        {oldText}
      </span>
      <span className="bg-green-100 text-green-900 px-1 font-medium border-b-2 border-green-500">
        {newText}
      </span>
    </div>
  );
};

// --- Mock Data Generator (Based on PRD) ---

const MOCK_CONFLICTS: Conflict[] = [
  {
    id: 'C-001',
    type: 'TEMPORAL',
    title: 'Security Certification Evolution',
    description: 'Multiple certification standards detected across RFP responses from different years.',
    status: 'OPEN',
    aiRecommendation: 'Mark HITRUST (2024) as current. Tag older versions as Historical.',
    mentions: [
      { id: 'm1', docId: 'd1', docName: '2022_Healthcare_RFP.pdf', page: 12, section: '3. Security', text: 'We are SOC 2 Type 1 certified', date: 'June 15, 2022' },
      { id: 'm2', docId: 'd2', docName: '2023_FinServ_RFP.docx', page: 8, section: '2. Compliance', text: 'We are SOC 2 Type 2 certified', date: 'March 20, 2023' },
      { id: 'm3', docId: 'd3', docName: '2024_Enterprise_RFP.pdf', page: 15, section: '4. Certifications', text: 'We are HITRUST certified', date: 'Jan 10, 2024' },
    ]
  },
  {
    id: 'C-002',
    type: 'CONTRADICTION',
    title: 'HIPAA Compliance Status',
    description: 'Direct contradiction between RFP response and internal policy document regarding BAA readiness.',
    status: 'OPEN',
    aiRecommendation: 'Verify correct status with Compliance Officer.',
    mentions: [
      { id: 'm4', docId: 'd3', docName: '2024_Enterprise_RFP.pdf', page: 22, section: '5.1 Privacy', text: 'We are HIPAA compliant and BAA-ready' },
      { id: 'm5', docId: 'd4', docName: '2024_Product_Specs.pdf', page: 4, section: 'Roadmap', text: 'HIPAA compliance certification pending Q2 2024' },
    ]
  },
  {
    id: 'C-003',
    type: 'INTRA_DOC',
    title: 'Service Pricing Inconsistency',
    description: 'Conflicting pricing figures detected within the same Master Services Agreement.',
    status: 'OPEN',
    aiRecommendation: 'Edit document to ensure consistent pricing value.',
    mentions: [
      { id: 'm6', docId: 'd5', docName: 'Enterprise_Services_Agreement.pdf', page: 12, section: '4. Fees', text: 'Monthly fee: $50,000 per month' },
      { id: 'm7', docId: 'd5', docName: 'Enterprise_Services_Agreement.pdf', page: 34, section: '9. Premium Tier', text: 'Customer will pay $45,000 monthly' },
      { id: 'm8', docId: 'd5', docName: 'Enterprise_Services_Agreement.pdf', page: 67, section: 'Appendix A', text: 'Total monthly recurring: $52,000' },
    ]
  }
];

// --- Store ---

const useStore = create<StoreState>((set, get) => ({
  view: 'login',
  currentUser: null,
  files: [],
  conflicts: [],
  selectedConflictId: null,
  workspaceMode: 'view',
  resolutionDraft: null,

  login: (username) => set({ 
    currentUser: username, 
    view: 'upload',
    // Reset state on new login
    files: [],
    conflicts: [],
    selectedConflictId: null,
    workspaceMode: 'view',
    resolutionDraft: null
  }),

  logout: () => set({ 
    currentUser: null, 
    view: 'login',
    files: [],
    conflicts: [],
    selectedConflictId: null,
    workspaceMode: 'view',
    resolutionDraft: null
  }),

  setView: (view) => set({ view }),
  setFiles: (files) => set({ files }),
  selectConflict: (id) => set({ selectedConflictId: id, workspaceMode: 'view', resolutionDraft: null }),
  loadMockData: () => set({ 
    conflicts: MOCK_CONFLICTS,
    selectedConflictId: MOCK_CONFLICTS[0].id
  }),

  startResolution: () => {
    const state = get();
    if (!state.selectedConflictId) return;
    
    set({ 
      workspaceMode: 'resolve',
      resolutionDraft: {
        conflictId: state.selectedConflictId,
        edits: {}
      }
    });
  },

  cancelResolution: () => set({ workspaceMode: 'view', resolutionDraft: null }),
  goToPreview: () => set({ workspaceMode: 'preview' }),
  returnToEdit: () => set({ workspaceMode: 'resolve' }),
  
  submitResolution: () => set({ workspaceMode: 'verifying' }),
  
  finalizeResolution: () => set((state) => ({
    workspaceMode: 'resolved',
    conflicts: state.conflicts.map(c => 
      c.id === state.selectedConflictId 
        ? { ...c, status: 'RESOLVED', resolvedAt: new Date().toISOString() } 
        : c
    )
  })),

  setAllCleared: () => set({ workspaceMode: 'all_cleared', selectedConflictId: null }),

  initManualDraft: (conflict) => {
    const edits: Record<string, ManualEdit> = {};
    conflict.mentions.forEach(m => {
      edits[m.id] = { text: m.text, action: 'UPDATE', isDirty: false };
    });
    set({
      workspaceMode: 'resolve',
      resolutionDraft: {
        conflictId: conflict.id,
        edits
      }
    });
  },

  updateDraft: (updates) => set((state) => ({
    resolutionDraft: state.resolutionDraft ? { ...state.resolutionDraft, ...updates } : null
  })),

  updateManualEdit: (mentionId, text, action) => set((state) => {
    if (!state.resolutionDraft) return {};
    const originalMention = state.conflicts
      .find(c => c.id === state.selectedConflictId)
      ?.mentions.find(m => m.id === mentionId);
    
    const isDirty = originalMention ? text !== originalMention.text : true;

    return {
      resolutionDraft: {
        ...state.resolutionDraft,
        edits: {
          ...state.resolutionDraft.edits,
          [mentionId]: { text, action, isDirty }
        }
      }
    };
  }),

  downloadExport: () => {
    const state = get();
    const exportData = {
      generatedAt: new Date().toISOString(),
      user: state.currentUser,
      summary: {
        totalConflicts: state.conflicts.length,
        resolved: state.conflicts.filter(c => c.status === 'RESOLVED').length,
      },
      auditLog: state.conflicts.map(c => ({
        id: c.id,
        title: c.title,
        status: c.status,
        resolvedAt: c.resolvedAt,
        type: c.type
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CogniSwitch_Clarity_Log_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}));

// --- UI Components ---

interface ButtonProps {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

const Button = ({ 
  children, 
  variant = 'primary', 
  onClick, 
  className = '',
  disabled = false,
  type = "button"
}: ButtonProps) => {
  const baseStyles = "font-mono text-sm uppercase tracking-wider px-6 py-3 border border-ink transition-all duration-100 flex items-center justify-center gap-2";
  
  const variants = {
    primary: "bg-ink text-paper hover:bg-electric hover:border-electric hover:shadow-hard-sm disabled:opacity-50 disabled:hover:shadow-none disabled:hover:bg-ink",
    secondary: "bg-transparent text-ink hover:bg-ink/5 disabled:opacity-50",
    ghost: "border-transparent hover:bg-ink/5 disabled:opacity-50",
    danger: "text-engineerRed border-engineerRed hover:bg-engineerRed/10 disabled:opacity-50"
  };

  return (
    <button 
      type={type}
      onClick={onClick} 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={disabled}
    >
      {children}
    </button>
  );
};

const TopBar = () => {
  const { view, conflicts, downloadExport, currentUser, logout } = useStore();
  const allResolved = conflicts.length > 0 && conflicts.every(c => c.status === 'RESOLVED');
  
  if (view === 'login') return null;

  return (
    <header className="h-16 border-b border-ink bg-paper flex items-center justify-between px-6 sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 bg-ink flex items-center justify-center text-paper font-serif italic font-bold">
          C
        </div>
        <h1 className="font-serif text-xl font-bold tracking-tight text-ink">
          COGNISWITCH <span className="font-normal italic text-electric">CLARITY</span>
        </h1>
        <span className="ml-4 px-2 py-0.5 border border-ink/30 text-[10px] font-mono uppercase text-ink/60">
          v1.0 BETA
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div className="hidden md:flex items-center gap-4 text-xs font-mono text-ink/60">
          <span className={view === 'upload' ? 'text-ink font-bold' : ''}>01. INGEST</span>
          <span>→</span>
          <span className={view === 'analyzing' ? 'text-ink font-bold' : ''}>02. DETECT</span>
          <span>→</span>
          <span className={view === 'dashboard' ? 'text-ink font-bold' : ''}>03. RESOLVE</span>
        </div>
        
        <div className="h-4 w-px bg-ink/30"></div>
        
        {view === 'dashboard' && (
           <Button 
             variant="ghost" 
             className={`h-8 px-3 text-xs ${allResolved ? 'text-electric font-bold' : 'opacity-50'}`}
             disabled={!allResolved}
             onClick={downloadExport}
           >
             <Download className="w-3 h-3 mr-2" />
             Export
           </Button>
        )}

        <div className="h-4 w-px bg-ink/30"></div>
        
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold font-mono uppercase">{currentUser || 'OPERATOR'}</div>
            <div className="text-[10px] font-mono text-ink/60">AUTHORIZED SESSION</div>
          </div>
          <button 
            onClick={logout}
            className="w-8 h-8 bg-ink/10 border border-ink flex items-center justify-center hover:bg-engineerRed hover:border-engineerRed hover:text-white transition-colors group"
            title="End Session"
          >
            <LogOut className="w-4 h-4 group-hover:stroke-current" />
          </button>
        </div>
      </div>
    </header>
  );
};

const LoginScreen = () => {
  const { login } = useStore();
  const [username, setUsername] = useState('Dr. A. Vance');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Credentials required');
      return;
    }

    setIsLoading(true);
    setError('');

    // Simulate network delay
    setTimeout(() => {
      login(username);
    }, 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-6 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#272048 1px, transparent 1px), linear-gradient(90deg, #272048 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      <div className="w-full max-w-md bg-white border border-ink shadow-hard z-10 animate-in fade-in zoom-in-95 duration-500">
        <div className="p-8 border-b border-ink bg-ink text-paper">
           <div className="flex items-center gap-3 mb-2">
             <Lock className="w-5 h-5 text-electric" />
             <span className="font-mono text-xs font-bold uppercase tracking-widest text-electric">Restricted Access</span>
           </div>
           <h1 className="font-serif text-3xl font-bold">CogniSwitch Clarity</h1>
           <p className="font-sans text-paper/60 mt-1">Enterprise AI Infrastructure Gateway</p>
        </div>

        <form onSubmit={handleLogin} className="p-8 space-y-6">
           <div className="space-y-2">
             <label className="flex items-center gap-2 font-mono text-xs font-bold uppercase text-ink/60">
               <User className="w-3 h-3" /> Operator ID
             </label>
             <input 
               type="text" 
               value={username}
               onChange={(e) => setUsername(e.target.value)}
               className="w-full h-12 px-4 border border-ink bg-paper focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric transition-all font-mono"
               placeholder="ENTER ID..."
             />
           </div>

           <div className="space-y-2">
             <label className="flex items-center gap-2 font-mono text-xs font-bold uppercase text-ink/60">
               <Key className="w-3 h-3" /> Access Key
             </label>
             <input 
               type="password" 
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               className="w-full h-12 px-4 border border-ink bg-paper focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric transition-all font-mono"
               placeholder="••••••••"
             />
           </div>

           {error && (
             <div className="bg-red-50 border border-red-200 p-3 flex items-center gap-2 text-engineerRed text-sm">
               <AlertTriangle className="w-4 h-4" />
               {error}
             </div>
           )}

           <Button 
             type="submit" 
             className="w-full h-14 text-lg"
             disabled={isLoading}
           >
             {isLoading ? (
               <>
                 <Loader2 className="w-5 h-5 animate-spin mr-2" />
                 Authenticating...
               </>
             ) : (
               <>
                 Authenticate Session <ArrowRight className="w-5 h-5 ml-2" />
               </>
             )}
           </Button>

           <div className="text-center">
             <p className="font-mono text-[10px] text-ink/30 uppercase">
               Unauthorized access is prohibited and monitored.
               <br/>System ID: CS-CLARITY-V1-PROD
             </p>
           </div>
        </form>
      </div>
    </div>
  );
};

const ConflictBadge = ({ type }: { type: ConflictType }) => {
  const config = {
    TEMPORAL: { icon: Clock, color: 'text-blue-700', bg: 'bg-blue-100', label: 'Temporal' },
    CONTRADICTION: { icon: AlertTriangle, color: 'text-orange-700', bg: 'bg-orange-100', label: 'Contradiction' },
    INTRA_DOC: { icon: Wrench, color: 'text-purple-700', bg: 'bg-purple-100', label: 'Intra-Doc' },
  }[type];

  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-2 px-3 py-1 ${config.bg} border border-ink/10`}>
      <Icon className={`w-3 h-3 ${config.color}`} />
      <span className={`font-mono text-[10px] uppercase tracking-wider font-bold ${config.color}`}>
        {config.label}
      </span>
    </div>
  );
};

const Sidebar = ({ isOpen, toggle }: { isOpen: boolean; toggle: () => void }) => {
  const { conflicts, selectedConflictId, selectConflict } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  
  if (!isOpen) return null;

  const filteredConflicts = conflicts.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = showPendingOnly ? c.status === 'OPEN' : true;
    return matchesSearch && matchesFilter;
  });

  const pendingCount = conflicts.filter(c => c.status === 'OPEN').length;

  return (
    <aside className="w-80 border-r border-ink bg-paper h-[calc(100vh-64px)] overflow-y-auto flex flex-col fixed md:relative z-40 animate-in slide-in-from-left duration-300">
      <div className="p-4 border-b border-ink bg-paper sticky top-0 z-10 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs font-bold tracking-widest text-ink/60 uppercase">
            Conflict Registry
          </h2>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 ${pendingCount > 0 ? 'bg-ink text-paper' : 'bg-green-100 text-green-700'}`}>
            {pendingCount} PENDING
          </span>
        </div>
        
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink/40" />
          <input 
            type="text" 
            placeholder="FILTER ID..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-ink py-2 pl-9 pr-2 text-xs font-mono placeholder-ink/40 focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
           <button 
             onClick={() => setShowPendingOnly(!showPendingOnly)}
             className={`
                flex items-center gap-2 text-[10px] font-mono uppercase px-2 py-1 border transition-colors
                ${showPendingOnly ? 'bg-ink text-paper border-ink' : 'bg-transparent text-ink/60 border-ink/20 hover:border-ink'}
             `}
           >
             <Filter className="w-3 h-3" />
             {showPendingOnly ? 'Showing Pending' : 'Show All'}
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredConflicts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center opacity-40 h-40">
            <Database className="w-8 h-8 mb-3" />
            <p className="font-mono text-[10px]">No Conflicts Found</p>
          </div>
        ) : (
          <ul className="divide-y divide-ink/10">
            {filteredConflicts.map(conflict => (
              <li 
                key={conflict.id}
                onClick={() => selectConflict(conflict.id)}
                className={`
                  p-4 cursor-pointer hover:bg-ink/5 transition-colors relative group
                  ${selectedConflictId === conflict.id ? 'bg-white' : ''}
                `}
              >
                {selectedConflictId === conflict.id && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-electric"></div>
                )}
                
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono text-[10px] text-ink/40 group-hover:text-ink/70 transition-colors">
                    {conflict.id}
                  </span>
                  {conflict.status === 'RESOLVED' ? (
                     <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-electric animate-pulse"></div>
                  )}
                </div>
                
                <h3 className={`font-sans font-bold text-sm mb-2 leading-snug ${conflict.status === 'RESOLVED' ? 'text-ink/60 line-through' : 'text-ink'}`}>
                  {conflict.title}
                </h3>
                
                <div className="flex items-center gap-2 opacity-80">
                  {conflict.type === 'TEMPORAL' && <Clock className="w-3 h-3 text-blue-600" />}
                  {conflict.type === 'CONTRADICTION' && <AlertTriangle className="w-3 h-3 text-orange-600" />}
                  {conflict.type === 'INTRA_DOC' && <Wrench className="w-3 h-3 text-purple-600" />}
                  <span className="text-[10px] font-mono text-ink/60 uppercase">
                    {conflict.type}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-4 border-t border-ink bg-ink/5">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span>SYSTEM STATUS</span>
          <span className="flex items-center gap-1.5 text-electric">
            <span className="w-1.5 h-1.5 bg-electric rounded-none animate-pulse"></span>
            ONLINE
          </span>
        </div>
      </div>
    </aside>
  );
};

const MentionCard: React.FC<{ mention: Mention; type: ConflictType }> = ({ mention, type }) => (
  <div className="border border-ink bg-white p-6 relative group hover:shadow-hard-xs transition-shadow duration-200">
    <div className="flex items-start justify-between mb-4 pb-3 border-b border-ink/10">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-ink/40" />
        <span className="font-mono text-xs font-bold text-ink/80">{mention.docName}</span>
      </div>
      <span className="font-mono text-[10px] text-ink/40 bg-ink/5 px-2 py-1">
        PG {mention.page} • {mention.section}
      </span>
    </div>

    <div className="mb-4">
      {mention.date && (
        <div className="mb-2">
           <span className="text-[10px] font-mono uppercase tracking-widest text-ink/40">Detected Date</span>
           <div className="font-mono text-xs text-electric">{mention.date}</div>
        </div>
      )}
      <div className="font-serif text-lg leading-relaxed text-ink bg-yellow-50/50 p-2 -mx-2 border-l-2 border-transparent group-hover:border-electric transition-colors">
        "{mention.text}"
      </div>
    </div>
  </div>
);

// --- Resolution Engines ---

const TemporalResolutionForm = ({ conflict }: { conflict: Conflict }) => {
  const { resolutionDraft, updateDraft } = useStore();
  const sortedMentions = [...conflict.mentions].sort((a, b) => 
    new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
  );

  return (
    <div className="max-w-2xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="mb-8 border border-ink p-6 bg-blue-50/30">
        <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-ink/60 mb-4">
          Resolution Wizard: Temporal Evolution
        </h3>
        <p className="font-sans text-sm mb-6">
          Select the currently accurate statement. Older versions will be marked as historical records.
        </p>

        <div className="space-y-3">
          {sortedMentions.map((mention, idx) => (
            <label 
              key={mention.id}
              className={`
                flex items-start gap-4 p-4 border cursor-pointer transition-all
                ${resolutionDraft?.selectedTemporalId === mention.id 
                  ? 'bg-blue-100 border-electric shadow-hard-xs' 
                  : 'bg-white border-ink/20 hover:border-ink/50'}
              `}
            >
              <div className="pt-1">
                <input 
                  type="radio" 
                  name="temporal-select"
                  checked={resolutionDraft?.selectedTemporalId === mention.id}
                  onChange={() => updateDraft({ selectedTemporalId: mention.id })}
                  className="accent-electric w-4 h-4"
                />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-mono text-xs font-bold text-electric">
                    {mention.date} {idx === 0 && "(Latest)"}
                  </span>
                  <span className="text-[10px] text-ink/40">{mention.docName}</span>
                </div>
                <div className="font-serif text-lg text-ink">
                  "{mention.text}"
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white border border-ink p-4 mb-6">
        <label className="flex items-center gap-3 cursor-pointer">
          <input 
            type="checkbox" 
            className="w-4 h-4 accent-electric rounded-none"
            checked={resolutionDraft?.keepHistory || false}
            onChange={(e) => updateDraft({ keepHistory: e.target.checked })}
          />
          <div className="flex flex-col">
            <span className="font-sans text-sm font-bold">Preserve Historical Context</span>
            <span className="text-xs text-ink/60">Agents will be able to explain the progression of changes over time.</span>
          </div>
        </label>
      </div>
    </div>
  );
};

const ContradictionResolutionForm = ({ conflict }: { conflict: Conflict }) => {
  const { resolutionDraft, updateDraft } = useStore();

  return (
    <div className="max-w-3xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="mb-6">
        <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-ink/60 mb-4">
          Resolution Wizard: True Contradiction
        </h3>
        
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {conflict.mentions.map((mention) => (
             <label 
              key={mention.id}
              className={`
                flex flex-col p-6 border cursor-pointer transition-all h-full
                ${resolutionDraft?.selectedCorrectId === mention.id 
                  ? 'bg-green-50 border-green-600 shadow-hard-xs' 
                  : 'bg-white border-ink/20 hover:border-ink/50'}
              `}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="font-mono text-[10px] bg-ink/5 px-2 py-1">{mention.docName}</div>
                <input 
                  type="radio" 
                  name="contradiction-select"
                  checked={resolutionDraft?.selectedCorrectId === mention.id}
                  onChange={() => updateDraft({ selectedCorrectId: mention.id })}
                  className="accent-green-600 w-5 h-5"
                />
              </div>
              <div className="font-serif text-xl leading-relaxed flex-1">
                "{mention.text}"
              </div>
              <div className="mt-4 pt-4 border-t border-ink/10 text-xs text-ink/50 font-mono">
                Pg {mention.page} • {mention.section}
              </div>
            </label>
          ))}
          
          <label className={`
              col-span-full p-4 border border-dashed flex items-center justify-center gap-3 cursor-pointer
              ${resolutionDraft?.selectedCorrectId === 'NEITHER' 
                  ? 'bg-orange-50 border-orange-500' 
                  : 'border-ink/30 hover:bg-ink/5'}
          `}>
             <input 
                type="radio" 
                name="contradiction-select"
                checked={resolutionDraft?.selectedCorrectId === 'NEITHER'}
                onChange={() => updateDraft({ selectedCorrectId: 'NEITHER' })}
                className="accent-orange-500"
              />
              <span className="font-mono text-sm uppercase">Neither statement is correct (Flag for review)</span>
          </label>
        </div>

        <div className="space-y-2">
           <label className="font-mono text-xs font-bold uppercase">Required Reasoning</label>
           <textarea 
             className="w-full h-32 p-4 border border-ink bg-white font-sans text-sm resize-none focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric placeholder:text-ink/30"
             placeholder="Explain why this choice is correct for compliance audit logs..."
             value={resolutionDraft?.reasoning || ''}
             onChange={(e) => updateDraft({ reasoning: e.target.value })}
           ></textarea>
           <div className="flex justify-end">
             <span className={`text-[10px] font-mono ${(resolutionDraft?.reasoning?.length || 0) < 20 ? 'text-engineerRed' : 'text-green-600'}`}>
               {resolutionDraft?.reasoning?.length || 0} / 20 MIN CHARS
             </span>
           </div>
        </div>
      </div>
    </div>
  );
};

const ManualEditorForm = ({ conflict }: { conflict: Conflict }) => {
  const { resolutionDraft, updateManualEdit } = useStore();
  
  // Group mentions by document for the "One card per document" cross-doc feel
  const mentionsByDoc = conflict.mentions.reduce((acc, mention) => {
    if (!acc[mention.docId]) acc[mention.docId] = [];
    acc[mention.docId].push(mention);
    return acc;
  }, {} as Record<string, Mention[]>);

  return (
    <div className="max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-300 pb-12">
      <div className="mb-6 flex justify-between items-end">
         <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-ink/60">
          Manual Editor: {conflict.type}
         </h3>
         <span className="font-mono text-[10px] text-ink/40">
           {Object.keys(resolutionDraft?.edits || {}).length} Changes Tracked
         </span>
      </div>

      <div className="space-y-8">
        {Object.entries(mentionsByDoc).map(([docId, docMentions]) => (
          <div key={docId} className="border border-ink bg-white shadow-hard-xs">
            {/* Card Header */}
            <div className="bg-ink/5 p-4 border-b border-ink flex items-center justify-between">
              <div className="flex items-center gap-2">
                <File className="w-4 h-4 text-ink" />
                <span className="font-mono text-sm font-bold">{docMentions[0].docName}</span>
              </div>
              <span className="text-[10px] font-mono text-ink/60">
                 {docMentions.length} Conflict(s) in this file
              </span>
            </div>

            {/* Mentions in this Doc */}
            <div className="divide-y divide-ink/10">
              {docMentions.map((mention) => {
                const draft = resolutionDraft?.edits?.[mention.id];
                const charCount = draft?.text.length || 0;
                
                return (
                  <div key={mention.id} className="p-6">
                    <div className="flex items-center justify-between mb-4">
                       <span className="font-mono text-[10px] bg-ink/10 px-2 py-1 text-ink/60">
                         PG {mention.page}, SEC {mention.section}
                       </span>
                       {draft?.isDirty && (
                         <span className="font-mono text-[10px] text-electric flex items-center gap-1">
                           <Edit3 className="w-3 h-3" /> Modified
                         </span>
                       )}
                    </div>

                    <div className="grid lg:grid-cols-2 gap-6 mb-4">
                      {/* Original */}
                      <div className="opacity-60 select-none">
                         <div className="text-[10px] font-mono uppercase text-ink/40 mb-2">Original</div>
                         <div className="font-serif text-lg leading-relaxed border-l-2 border-ink/10 pl-3">
                           {mention.text}
                         </div>
                      </div>

                      {/* Editor */}
                      <div>
                        <div className="flex justify-between items-center mb-2">
                           <div className="text-[10px] font-mono uppercase text-electric font-bold">New Text</div>
                           <button 
                             onClick={() => updateManualEdit(mention.id, mention.text, 'UPDATE')}
                             className="text-[10px] hover:text-electric underline"
                           >
                             Reset
                           </button>
                        </div>
                        <textarea 
                          value={draft?.text || mention.text}
                          onChange={(e) => updateManualEdit(mention.id, e.target.value, draft?.action || 'UPDATE')}
                          className={`
                            w-full h-32 p-3 border font-serif text-lg leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-electric
                            ${draft?.isDirty ? 'border-electric bg-blue-50/10' : 'border-ink/20 bg-white'}
                          `}
                        />
                        <div className="flex justify-end mt-1">
                          <span className={`text-[10px] font-mono ${charCount > 900 ? 'text-engineerRed' : 'text-ink/30'}`}>
                            {charCount}/1000
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4 pt-2">
                       {(['UPDATE', 'CLARIFY', 'ERROR', 'KEEP'] as ManualAction[]).map(action => (
                         <label key={action} className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="radio" 
                              name={`action-${mention.id}`}
                              checked={draft?.action === action}
                              onChange={() => updateManualEdit(mention.id, draft?.text || mention.text, action)}
                              className="accent-electric"
                            />
                            <span className="font-mono text-xs uppercase">{action}</span>
                         </label>
                       ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PreviewPanel = ({ conflict }: { conflict: Conflict }) => {
  const { resolutionDraft } = useStore();

  return (
    <div className="max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-300 pb-12">
      <div className="mb-8 p-6 bg-ink text-paper">
         <h3 className="font-mono text-sm font-bold uppercase tracking-widest mb-2">
           Preview Changes
         </h3>
         <p className="font-sans text-sm opacity-80">
           Review your decisions before applying. This action will create an immutable audit log.
         </p>
      </div>

      <div className="space-y-6">
        {conflict.type === 'TEMPORAL' && resolutionDraft?.selectedTemporalId && (
           <div className="border border-ink bg-white p-6">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 className="w-5 h-5 text-electric" />
                <h4 className="font-bold text-lg">Marking as Current</h4>
              </div>
              <div className="pl-8 space-y-4">
                 <div className="bg-blue-50 p-4 border-l-2 border-electric">
                    <span className="font-mono text-[10px] text-electric uppercase">Selected Value</span>
                    <p className="font-serif text-xl">
                      "{conflict.mentions.find(m => m.id === resolutionDraft.selectedTemporalId)?.text}"
                    </p>
                 </div>
                 
                 <div className="text-sm font-mono text-ink/60">
                   • {conflict.mentions.length - 1} other mentions tagged as "Historical"<br/>
                   • History {resolutionDraft.keepHistory ? 'PRESERVED' : 'HIDDEN'} for agents
                 </div>
              </div>
           </div>
        )}

        {conflict.type === 'CONTRADICTION' && resolutionDraft?.selectedCorrectId && (
          <div className="border border-ink bg-white p-6">
             <div className="flex items-center gap-3 mb-4">
               <AlertTriangle className="w-5 h-5 text-orange-600" />
               <h4 className="font-bold text-lg">Resolution Strategy: Pick Correct</h4>
             </div>
             
             {resolutionDraft.selectedCorrectId === 'NEITHER' ? (
                <div className="bg-orange-50 p-4 text-orange-900 border border-orange-200">
                  <span className="font-bold">Flagged for External Review</span>
                  <p className="text-sm mt-1">Neither statement verified. Audit log updated with reasoning.</p>
                </div>
             ) : (
                <div className="bg-green-50 p-4 border-l-2 border-green-600">
                   <span className="font-mono text-[10px] text-green-700 uppercase">Verified Statement</span>
                   <p className="font-serif text-xl text-green-900">
                     "{conflict.mentions.find(m => m.id === resolutionDraft.selectedCorrectId)?.text}"
                   </p>
                </div>
             )}
             
             <div className="mt-4 pt-4 border-t border-ink/10">
               <span className="font-mono text-xs font-bold">Logged Reasoning:</span>
               <p className="font-serif italic text-ink/70 mt-1">"{resolutionDraft.reasoning}"</p>
             </div>
          </div>
        )}

        {(conflict.type === 'INTRA_DOC' || resolutionDraft?.edits) && Object.values(resolutionDraft?.edits || {}).some((e) => (e as ManualEdit).isDirty) && (
           <div className="border border-ink bg-white">
              <div className="bg-ink/5 p-4 border-b border-ink">
                 <h4 className="font-mono text-sm font-bold">Text Modifications</h4>
              </div>
              <div className="divide-y divide-ink/10">
                {Object.entries(resolutionDraft?.edits || {})
                   .filter(([_, draft]) => (draft as ManualEdit).isDirty)
                   .map(([id, d]) => {
                     const draft = d as ManualEdit;
                     const mention = conflict.mentions.find(m => m.id === id);
                     if (!mention) return null;
                     return (
                       <div key={id} className="p-6">
                          <div className="font-mono text-[10px] text-ink/40 mb-2">{mention.docName} (Pg {mention.page})</div>
                          <div className="grid gap-2">
                             {simpleDiff(mention.text, draft.text)}
                          </div>
                          <div className="mt-2 text-xs font-mono text-electric uppercase">
                            Action: {draft.action}
                          </div>
                       </div>
                     );
                   })
                }
              </div>
           </div>
        )}
      </div>
    </div>
  );
};

const VerificationView = () => {
  const { finalizeResolution } = useStore();
  const [logs, setLogs] = useState<string[]>([]);
  
  useEffect(() => {
    const steps = [
      "Initiating consistency check...",
      "Analyzing semantic vectors...",
      "Verifying temporal coherence...",
      "Updating knowledge graph indices...",
      "Generating audit trail hash..."
    ];
    
    let delay = 0;
    steps.forEach((step, idx) => {
      delay += Math.random() * 800 + 400;
      setTimeout(() => {
        setLogs(prev => [...prev, step]);
        if (idx === steps.length - 1) {
          setTimeout(finalizeResolution, 800);
        }
      }, delay);
    });
  }, [finalizeResolution]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black text-green-500 font-mono p-12 animate-in fade-in duration-500">
      <div className="w-full max-w-lg border border-green-500/30 bg-green-900/5 p-8 shadow-[0_0_20px_rgba(34,197,94,0.1)]">
        <div className="flex items-center gap-3 mb-6 border-b border-green-500/30 pb-4">
          <Terminal className="w-5 h-5 animate-pulse" />
          <span className="text-sm font-bold uppercase tracking-widest">System Re-Check</span>
        </div>
        
        <div className="space-y-2 mb-8 h-48 font-xs">
          {logs.map((log, i) => (
             <div key={i} className="flex gap-2">
               <span className="opacity-50">[{new Date().toLocaleTimeString()}]</span>
               <span>{log}</span>
             </div>
          ))}
          <div className="animate-pulse">_</div>
        </div>

        <div className="h-1 bg-green-900/30 w-full overflow-hidden">
           <div className="h-full bg-green-500 w-1/3 animate-[shimmer_2s_infinite_linear]"></div>
        </div>
      </div>
    </div>
  );
};

const ResolvedView = ({ conflict }: { conflict: Conflict }) => {
  const { selectConflict, conflicts, setAllCleared } = useStore();
  const nextConflict = conflicts.find(c => c.status === 'OPEN' && c.id !== conflict.id);

  const handleNext = () => {
    if (nextConflict) {
      selectConflict(nextConflict.id);
    } else {
      setAllCleared();
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 bg-paper animate-in zoom-in-95 duration-300">
       <div className="text-center max-w-lg">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
             <Check className="w-10 h-10 text-green-600" />
          </div>
          
          <h2 className="font-serif text-4xl font-bold text-ink mb-4">Conflict Resolved</h2>
          <p className="font-sans text-ink/60 mb-8">
            The knowledge base has been updated. A verified audit log entry {`{${conflict.id}}`} has been created.
          </p>

          <div className="flex justify-center gap-4">
             {nextConflict ? (
               <Button onClick={handleNext}>
                 Next Conflict <ArrowRight className="w-4 h-4 ml-2" />
               </Button>
             ) : (
               <Button onClick={handleNext}>
                 Finalize All <CheckCircle2 className="w-4 h-4 ml-2" />
               </Button>
             )}
          </div>
       </div>
    </div>
  );
};

const AllClearView = () => {
  const { downloadExport, conflicts } = useStore();
  
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 bg-paper animate-in fade-in duration-700">
       <div className="max-w-xl w-full text-center border border-ink/20 p-12 bg-white shadow-hard">
         <div className="w-24 h-24 bg-electric text-white flex items-center justify-center mx-auto mb-8">
            <ShieldCheck className="w-12 h-12" />
         </div>
         
         <h1 className="font-serif text-4xl font-bold text-ink mb-4">
           Knowledge Base Clean
         </h1>
         <p className="font-sans text-lg text-ink/70 mb-8">
           All {conflicts.length} detected conflicts have been successfully resolved. Your knowledge foundation is now compliant and ready for AI ingestion.
         </p>

         <div className="grid grid-cols-3 gap-4 mb-10 border-y border-ink/10 py-6">
            <div>
               <div className="font-mono text-2xl font-bold text-electric">100%</div>
               <div className="font-mono text-[10px] text-ink/40 uppercase">Resolution Rate</div>
            </div>
            <div>
               <div className="font-mono text-2xl font-bold text-ink">{conflicts.length}</div>
               <div className="font-mono text-[10px] text-ink/40 uppercase">Total Edits</div>
            </div>
            <div>
               <div className="font-mono text-2xl font-bold text-green-600">0s</div>
               <div className="font-mono text-[10px] text-ink/40 uppercase">Pending Issues</div>
            </div>
         </div>

         <Button onClick={downloadExport} className="w-full">
            <Download className="w-5 h-5 mr-2" />
            Download Audit Log & Export
         </Button>
       </div>
    </div>
  );
};

const ConflictWorkspace = () => {
  const { conflicts, selectedConflictId, workspaceMode, startResolution, cancelResolution, initManualDraft, goToPreview, returnToEdit, submitResolution } = useStore();
  const conflict = conflicts.find(c => c.id === selectedConflictId);

  // If we are in "All Cleared" mode, show that screen specifically
  if (workspaceMode === 'all_cleared') {
     return <AllClearView />;
  }

  if (!conflict) return (
    <div className="flex-1 flex items-center justify-center bg-paper">
      <div className="text-center opacity-40">
        <ArrowRight className="w-8 h-8 mx-auto mb-2" />
        <p className="font-mono text-sm">Select a conflict to begin resolution</p>
      </div>
    </div>
  );

  if (workspaceMode === 'verifying') return <VerificationView />;
  if (workspaceMode === 'resolved') return <ResolvedView conflict={conflict} />;

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden animate-in fade-in duration-300">
      {/* Workspace Header */}
      <div className="p-6 md:p-8 border-b border-ink bg-paper shadow-sm z-10">
        <div className="max-w-5xl mx-auto w-full">
           <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <span className="font-mono text-xs text-ink/40">ID: {conflict.id}</span>
                <ConflictBadge type={conflict.type} />
                {workspaceMode === 'resolve' && (
                  <span className="bg-electric text-white font-mono text-[10px] px-2 py-0.5 animate-pulse">
                    RESOLUTION MODE
                  </span>
                )}
                 {workspaceMode === 'preview' && (
                  <span className="bg-ink text-white font-mono text-[10px] px-2 py-0.5">
                    PREVIEW MODE
                  </span>
                )}
                {conflict.status === 'RESOLVED' && (
                  <span className="bg-green-100 text-green-700 font-mono text-[10px] px-2 py-0.5">
                    RESOLVED
                  </span>
                )}
              </div>
              <h1 className="font-serif text-3xl font-medium text-ink mb-2">
                {conflict.title}
              </h1>
              {workspaceMode === 'view' && (
                 <p className="font-sans text-ink/70 max-w-2xl">
                   {conflict.description}
                 </p>
              )}
            </div>
          </div>

          {/* AI Box - Only show in view mode */}
          {workspaceMode === 'view' && conflict.status !== 'RESOLVED' && (
            <div className="bg-ink/5 border border-ink/20 p-4 flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-electric flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[10px] text-white font-bold">AI</span>
              </div>
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink/60 block mb-1">
                  Recommended Action
                </span>
                <p className="font-sans text-sm font-medium text-ink">
                  {conflict.aiRecommendation}
                </p>
              </div>
            </div>
          )}
          
          {conflict.status === 'RESOLVED' && (
             <div className="bg-green-50 border border-green-200 p-4 text-green-900 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-medium">This conflict has been resolved and logged.</span>
             </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-paper p-6 md:p-8">
        <div className="max-w-5xl mx-auto w-full">
           {workspaceMode === 'view' && (
             <>
               <div className="flex items-center justify-between mb-4">
                  <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-ink/60">
                    Source Evidence ({conflict.mentions.length})
                  </h3>
               </div>
               <div className="grid gap-6">
                 {conflict.mentions.map((mention) => (
                   <MentionCard key={mention.id} mention={mention} type={conflict.type} />
                 ))}
               </div>
             </>
           )}

           {workspaceMode === 'resolve' && (
             <>
               {conflict.type === 'TEMPORAL' && <TemporalResolutionForm conflict={conflict} />}
               {conflict.type === 'CONTRADICTION' && <ContradictionResolutionForm conflict={conflict} />}
               {conflict.type === 'INTRA_DOC' && <ManualEditorForm conflict={conflict} />}
             </>
           )}

           {workspaceMode === 'preview' && (
              <PreviewPanel conflict={conflict} />
           )}
        </div>
      </div>

      {/* Action Footer */}
      {conflict.status !== 'RESOLVED' && (
        <div className="p-6 border-t border-ink bg-paper sticky bottom-0 z-20">
          <div className="max-w-5xl mx-auto w-full flex items-center justify-between">
            
            {workspaceMode === 'view' && (
              <>
                 <Button variant="ghost" className="text-ink/60">
                   <ChevronLeft className="w-4 h-4 mr-2" /> Previous
                 </Button>
                 
                 <div className="flex gap-4">
                    {/* Edit Manually Button - Available for Temporal and Contradiction */}
                    {(conflict.type === 'TEMPORAL' || conflict.type === 'CONTRADICTION') && (
                      <Button variant="secondary" onClick={() => initManualDraft(conflict)}>
                        <Wrench className="w-4 h-4 mr-2" />
                        Edit Manually
                      </Button>
                    )}

                    {/* Primary Action Button */}
                    {conflict.type === 'TEMPORAL' && (
                      <Button onClick={startResolution}>
                        <Clock className="w-4 h-4 mr-2" />
                        Quick Resolve
                      </Button>
                    )}
                    {conflict.type === 'CONTRADICTION' && (
                      <Button onClick={startResolution}>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Pick Correct
                      </Button>
                    )}
                    {conflict.type === 'INTRA_DOC' && (
                       <Button onClick={() => initManualDraft(conflict)}>
                        <Wrench className="w-4 h-4 mr-2" />
                        Edit to Fix
                      </Button>
                    )}
                 </div>

                 <Button variant="ghost" className="text-ink">
                   Next <ChevronRight className="w-4 h-4 ml-2" />
                 </Button>
              </>
            )}

            {workspaceMode === 'resolve' && (
              <>
                 <Button variant="secondary" onClick={cancelResolution}>
                   Cancel
                 </Button>
                 
                 <div className="flex gap-4">
                    <Button onClick={goToPreview}>
                       <Search className="w-4 h-4 mr-2" />
                       Preview Changes
                    </Button>
                 </div>
              </>
            )}

            {workspaceMode === 'preview' && (
              <>
                 <Button variant="secondary" onClick={returnToEdit}>
                   <RotateCcw className="w-4 h-4 mr-2" />
                   Back to Edit
                 </Button>
                 
                 <div className="flex gap-4">
                    <Button onClick={submitResolution}>
                       <Check className="w-4 h-4 mr-2" />
                       Confirm & Verify
                    </Button>
                 </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const UploadScreen = () => {
  const { setView, setFiles, loadMockData } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const [files, setLocalFiles] = useState<UploadFile[]>([]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    // Mock file handling
    const newFiles: UploadFile[] = [
      { name: '2022_Healthcare_RFP.pdf', size: '2.4 MB', status: 'pending' },
      { name: '2024_Product_Specs.pdf', size: '1.1 MB', status: 'pending' },
      { name: 'Enterprise_Services_Agreement.docx', size: '845 KB', status: 'pending' },
    ];
    setLocalFiles(newFiles);
    setFiles(newFiles);
  };

  const startAnalysis = () => {
    setView('analyzing');
    // Pre-load mock data so it's ready when dashboard opens
    loadMockData();
  };

  return (
    <div className="flex-1 p-6 md:p-12 flex flex-col items-center justify-center bg-paper relative overflow-hidden animate-in fade-in duration-500">
      {/* Decorative Background Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
           style={{ backgroundImage: 'linear-gradient(#272048 1px, transparent 1px), linear-gradient(90deg, #272048 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      <div className="max-w-3xl w-full relative z-10">
        <div className="text-center mb-12">
          <h2 className="font-serif text-4xl md:text-5xl font-medium text-ink mb-4">
            Knowledge Base Ingestion
          </h2>
          <p className="font-mono text-ink/60 text-sm max-w-xl mx-auto leading-relaxed">
            Initialize the conflict detection engine by uploading source documents.
            Supported formats: PDF, DOCX (OCR enabled).
          </p>
        </div>

        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed transition-all duration-300 bg-white
            flex flex-col items-center justify-center p-12 min-h-[320px]
            ${isDragging ? 'border-electric bg-electric/5 scale-[1.01]' : 'border-ink/30 hover:border-ink/60'}
          `}
        >
          {files.length === 0 ? (
            <>
              <div className="w-16 h-16 border border-ink mb-6 flex items-center justify-center bg-paper shadow-hard-sm">
                <Upload className="w-6 h-6 text-ink" />
              </div>
              <p className="font-serif text-xl mb-2 text-ink">Drag documents here</p>
              <p className="font-mono text-xs text-ink/50 uppercase tracking-wider mb-6">or click to browse filesystem</p>
              <Button variant="secondary" onClick={() => handleDrop({ preventDefault: () => {} } as any)}>
                Select Files
              </Button>
            </>
          ) : (
            <div className="w-full max-w-md">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-ink/10">
                <span className="font-mono text-xs font-bold uppercase">Ready for Analysis</span>
                <span className="font-mono text-xs">{files.length} Files</span>
              </div>
              <ul className="space-y-3 mb-8">
                {files.map((file, idx) => (
                  <li key={idx} className="flex items-center justify-between text-sm bg-paper p-3 border border-ink/10">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-ink/60" />
                      <span className="font-sans font-medium">{file.name}</span>
                    </div>
                    <span className="font-mono text-xs text-ink/40">{file.size}</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-4 justify-center">
                <Button variant="secondary" onClick={() => setLocalFiles([])}>Clear</Button>
                <Button onClick={startAnalysis}>
                  Initialize Analysis <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AnalyzingScreen = ({ onComplete }: { onComplete: () => void }) => {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Parsing Metadata...');

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 500);
          return 100;
        }
        
        // Progress Logic
        if (prev > 20 && prev < 40) setStage('Structuring Knowledge Graph...');
        if (prev > 40 && prev < 70) setStage('Detecting Semantic Conflicts...');
        if (prev > 70) setStage('Classifying Temporal Patterns...');
        if (prev > 90) setStage('Finalizing Registry...');

        return prev + 1;
      });
    }, 30);
    return () => clearInterval(timer);
  }, [onComplete]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 bg-paper relative">
       <div className="w-full max-w-md">
          <div className="flex justify-between items-end mb-2">
            <h3 className="font-mono text-sm font-bold uppercase tracking-widest text-ink">
              System Processing
            </h3>
            <span className="font-mono text-xl font-bold text-electric">
              {progress}%
            </span>
          </div>
          
          <div className="h-4 border border-ink p-0.5 mb-6">
            <div 
              className="h-full bg-ink transition-all duration-100 ease-linear"
              style={{ width: `${progress}%` }}
            ></div>
          </div>

          <div className="font-mono text-xs text-ink/60 border-l-2 border-electric pl-3 py-1">
             <div className="animate-pulse">
               &gt; {stage}
             </div>
          </div>
       </div>
    </div>
  );
};

// --- Main App ---

const App = () => {
  const { view, setView } = useStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col font-sans selection:bg-electric selection:text-white">
      <TopBar />
      
      <div className="flex flex-1 relative overflow-hidden">
        {view === 'login' ? (
          <LoginScreen />
        ) : (
          <>
            {view === 'dashboard' && (
              <Sidebar isOpen={sidebarOpen} toggle={() => setSidebarOpen(!sidebarOpen)} />
            )}
            
            <main className="flex-1 flex flex-col relative overflow-y-auto">
              {view === 'upload' && (
                <UploadScreen />
              )}
              
              {view === 'analyzing' && (
                <AnalyzingScreen onComplete={() => setView('dashboard')} />
              )}

              {view === 'dashboard' && (
                <ConflictWorkspace />
              )}
            </main>
          </>
        )}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);