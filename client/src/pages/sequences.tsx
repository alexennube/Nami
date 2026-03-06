import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Plus, Search, Mail, Phone, Linkedin, Share2, FileSearch,
  Clock, CheckSquare, Zap, Play, Pause, MoreHorizontal, Users, GripVertical, Trash2, ChevronUp, ChevronDown
} from "lucide-react";
import { ConfigurableTable, type ColumnDef } from "@/components/configurable-table";
import type { CrmSequence, CrmContact, SequenceStep } from "@shared/schema";
import { Link } from "wouter";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const STEP_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  phone_call: Phone,
  linkedin: Linkedin,
  social_media: Share2,
  research: FileSearch,
  wait: Clock,
  task: CheckSquare,
};

const STEP_COLORS: Record<string, string> = {
  email: "text-blue-400 bg-blue-500/10",
  phone_call: "text-emerald-400 bg-emerald-500/10",
  linkedin: "text-sky-400 bg-sky-500/10",
  social_media: "text-pink-400 bg-pink-500/10",
  research: "text-orange-400 bg-orange-500/10",
  wait: "text-gray-400 bg-gray-500/10",
  task: "text-purple-400 bg-purple-500/10",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  paused: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  draft: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

function SortableStepItem({
  step, idx, totalSteps, updateStep, removeStep
}: {
  step: SequenceStep; idx: number; totalSteps: number;
  updateStep: (idx: number, updates: Partial<SequenceStep>) => void;
  removeStep: (idx: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const Icon = STEP_ICONS[step.type];
  const colorClass = STEP_COLORS[step.type] || "";

  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 items-start border border-border rounded-lg p-3" data-testid={`step-${idx}`}>
      <div className="flex flex-col items-center gap-0.5 pt-1">
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted" data-testid={`step-${idx}-drag-handle`}>
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <span className="text-[10px] text-muted-foreground font-medium">{idx + 1}</span>
      </div>
      <div className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 mt-0.5 ${colorClass}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">{step.type.replace("_", " ")}</Badge>
        </div>
        {step.type === "email" && (
          <>
            <Input
              placeholder="Email subject"
              value={step.subject || ""}
              onChange={(e) => updateStep(idx, { subject: e.target.value })}
              className="h-7 text-xs"
              data-testid={`step-${idx}-subject`}
            />
            <textarea
              placeholder="Email body template"
              value={step.content || ""}
              onChange={(e) => updateStep(idx, { content: e.target.value })}
              className="w-full min-h-[60px] px-2 py-1.5 text-xs bg-background border border-border rounded-md resize-y focus:outline-none focus:ring-1 focus:ring-primary"
              data-testid={`step-${idx}-content`}
            />
          </>
        )}
        {step.type === "wait" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Wait</span>
            <Input
              type="number"
              min={1}
              value={step.delayDays || 1}
              onChange={(e) => updateStep(idx, { delayDays: parseInt(e.target.value) || 1 })}
              className="h-7 text-xs w-16"
              data-testid={`step-${idx}-delay`}
            />
            <span className="text-xs text-muted-foreground">day(s)</span>
          </div>
        )}
        {step.type !== "email" && step.type !== "wait" && (
          <textarea
            placeholder={`Instructions for ${step.type.replace("_", " ")} step`}
            value={step.instruction || ""}
            onChange={(e) => updateStep(idx, { instruction: e.target.value })}
            className="w-full min-h-[40px] px-2 py-1.5 text-xs bg-background border border-border rounded-md resize-y focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid={`step-${idx}-instruction`}
          />
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeStep(idx)} data-testid={`step-${idx}-remove`}>
        <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-400" />
      </Button>
    </div>
  );
}

function SequenceBuilderDialog({ open, onClose, sequence }: { open: boolean; onClose: () => void; sequence?: CrmSequence }) {
  const { toast } = useToast();
  const [name, setName] = useState(sequence?.name || "");
  const [description, setDescription] = useState(sequence?.description || "");
  const [steps, setSteps] = useState<SequenceStep[]>(sequence?.steps || []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const addStep = (type: SequenceStep["type"]) => {
    setSteps(prev => [...prev, {
      id: crypto.randomUUID(),
      order: prev.length,
      type,
      subject: "",
      content: "",
      delayDays: type === "wait" ? 1 : undefined,
      instruction: "",
    }]);
  };

  const updateStep = (idx: number, updates: Partial<SequenceStep>) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  const removeStep = (idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSteps(prev => {
        const oldIndex = prev.findIndex(s => s.id === active.id);
        const newIndex = prev.findIndex(s => s.id === over.id);
        return arrayMove(prev, oldIndex, newIndex).map((s, i) => ({ ...s, order: i }));
      });
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const data = { name, description, steps };
      if (sequence) {
        const res = await apiRequest("PATCH", `/api/crm/sequences/${sequence.id}`, data);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/crm/sequences", data);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/sequences"] });
      onClose();
      toast({ title: sequence ? "Sequence updated" : "Sequence created" });
    },
  });

  const stepTypes: SequenceStep["type"][] = ["email", "phone_call", "linkedin", "social_media", "research", "wait", "task"];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{sequence ? "Edit Sequence" : "Create Sequence"}</DialogTitle>
          <DialogDescription>Define the steps for your outreach sequence. Drag steps to reorder.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 flex-1 overflow-y-auto pr-1">
          <Input placeholder="Sequence name *" value={name} onChange={(e) => setName(e.target.value)} data-testid="sequence-name-input" />
          <textarea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full min-h-[50px] px-3 py-2 text-sm bg-background border border-border rounded-md resize-y focus:outline-none focus:ring-1 focus:ring-primary"
            data-testid="sequence-desc-input"
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Steps</span>
              <div className="flex items-center gap-1 flex-wrap">
                {stepTypes.map(type => {
                  const Icon = STEP_ICONS[type];
                  return (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 gap-1"
                      onClick={() => addStep(type)}
                      data-testid={`add-step-${type}`}
                    >
                      <Icon className="w-3 h-3" />
                      {type.replace("_", " ")}
                    </Button>
                  );
                })}
              </div>
            </div>

            {steps.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-border rounded-lg">
                <Zap className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No steps yet. Add steps using the buttons above.</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {steps.map((step, idx) => (
                      <SortableStepItem
                        key={step.id}
                        step={step}
                        idx={idx}
                        totalSteps={steps.length}
                        updateStep={updateStep}
                        removeStep={removeStep}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="sequence-cancel-btn">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending} data-testid="sequence-save-btn">
            {sequence ? "Save Changes" : "Create Sequence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SequencesPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [builderDialog, setBuilderDialog] = useState<{ open: boolean; sequence?: CrmSequence }>({ open: false });

  const { data: sequences = [], isLoading } = useQuery<CrmSequence[]>({ queryKey: ["/api/crm/sequences"] });
  const { data: contacts = [] } = useQuery<CrmContact[]>({ queryKey: ["/api/crm/contacts"] });

  const deleteSequenceMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/crm/sequences/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/sequences"] });
      toast({ title: "Sequence deleted" });
    },
  });

  const filteredSequences = sequences.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${s.name} ${s.description}`.toLowerCase().includes(q);
  });

  const getEnrolledCount = (seq: CrmSequence) => (seq.contactIds || []).length;
  const getCompletedCount = (seq: CrmSequence) => {
    return contacts.filter(c => c.sequenceId === seq.id && c.sequenceStatus === "completed").length;
  };

  const sequenceColumns: ColumnDef<CrmSequence>[] = [
    {
      key: "name",
      label: "Name",
      defaultVisible: true,
      render: (s) => <span className="font-medium text-primary hover:underline">{s.name}</span>,
    },
    {
      key: "status",
      label: "Status",
      defaultVisible: true,
      render: (s) => (
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${STATUS_COLORS[s.status] || ""}`}>
          {s.status}
        </Badge>
      ),
    },
    {
      key: "type",
      label: "Type",
      defaultVisible: true,
      render: (s) => (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
          {(s.sequenceType || "contact")}
        </Badge>
      ),
    },
    {
      key: "channels",
      label: "Channels",
      defaultVisible: true,
      render: (s) => {
        const types = Array.from(new Set(s.steps.map(st => st.type).filter(t => t !== "wait")));
        return (
          <div className="flex items-center gap-1">
            {types.slice(0, 4).map(type => {
              const Icon = STEP_ICONS[type];
              return Icon ? <Icon key={type} className="w-3 h-3 text-muted-foreground" /> : null;
            })}
            {types.length > 4 && <span className="text-[9px] text-muted-foreground">+{types.length - 4}</span>}
          </div>
        );
      },
    },
    {
      key: "steps",
      label: "Steps",
      defaultVisible: true,
      render: (s) => <span className="text-muted-foreground">{s.steps.length}</span>,
    },
    {
      key: "enrolled",
      label: "Enrolled",
      defaultVisible: true,
      render: (s) => (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Users className="w-2.5 h-2.5" />
          {getEnrolledCount(s)}
        </span>
      ),
    },
    {
      key: "completion",
      label: "Completion",
      defaultVisible: true,
      render: (s) => {
        const enrolled = getEnrolledCount(s);
        const completed = getCompletedCount(s);
        const pct = enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0;
        return (
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground">{pct}%</span>
          </div>
        );
      },
    },
    {
      key: "created",
      label: "Created",
      defaultVisible: false,
      render: (s) => <span className="text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</span>,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Link href="/crm">
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <Zap className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground" data-testid="sequences-heading">Sequences</h1>
          <Badge variant="outline" className="text-xs">{sequences.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 w-48 text-xs"
              data-testid="sequences-search-input"
            />
          </div>
          <Button size="sm" className="h-7 text-xs" onClick={() => setBuilderDialog({ open: true })} data-testid="create-sequence-btn">
            <Plus className="w-3.5 h-3.5 mr-1" /> Create Sequence
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4 py-3">
        <ConfigurableTable
          tableName="sequences"
          columns={sequenceColumns}
          data={filteredSequences}
          isLoading={isLoading}
          emptyIcon={<Zap className="w-10 h-10 text-muted-foreground/20 mx-auto" />}
          emptyMessage={search ? "No sequences match your search" : "No sequences yet. Create one to get started."}
          getRowId={(s) => s.id}
          onRowClick={(s) => navigate(`/crm/sequences/${s.id}`)}
          onEdit={(s) => setBuilderDialog({ open: true, sequence: s })}
          onDelete={(s) => deleteSequenceMutation.mutate(s.id)}
        />
      </div>

      {builderDialog.open && (
        <SequenceBuilderDialog
          open={builderDialog.open}
          onClose={() => setBuilderDialog({ open: false })}
          sequence={builderDialog.sequence}
        />
      )}
    </div>
  );
}
