import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { fetchNotes, createNote, deleteNote, updateNote, type PoolNote } from '@/api/client';
import { MessageSquarePlus, Trash2, Loader2, StickyNote, Tag, Pencil } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PoolNotesProps {
  poolId: string;
  className?: string;
}

const SUGGESTED_TAGS = [
  'estrategia', 'risco', 'entrada', 'saida', 'rebalancear',
  'monitorar', 'oportunidade', 'atencao', 'pesquisar',
];

export function PoolNotes({ poolId, className }: PoolNotesProps) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['pool-notes', poolId],
    queryFn: () => fetchNotes(poolId),
    staleTime: 30000,
  });

  const addMutation = useMutation({
    mutationFn: () => createNote(poolId, text.trim(), selectedTags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pool-notes', poolId] });
      setText('');
      setSelectedTags([]);
      setIsAdding(false);
      toast.success('Nota adicionada');
    },
    onError: () => toast.error('Erro ao adicionar nota'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pool-notes', poolId] });
      toast.success('Nota removida');
    },
    onError: () => toast.error('Erro ao remover nota'),
  });

  const editMutation = useMutation({
    mutationFn: () => updateNote(editingNote!, editText.trim(), editTags),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pool-notes', poolId] });
      setEditingNote(null);
      setEditText('');
      setEditTags([]);
      toast.success('Nota atualizada');
    },
    onError: () => toast.error('Erro ao atualizar nota'),
  });

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const startEdit = (note: PoolNote) => {
    setEditingNote(note.id);
    setEditText(note.text);
    setEditTags(note.tags || []);
  };

  const toggleEditTag = (tag: string) => {
    setEditTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editText.trim()) return;
    editMutation.mutate();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    addMutation.mutate();
  };

  return (
    <div className={cn('glass-card p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <StickyNote className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Notas & Anotacoes</h3>
          {notes.length > 0 && (
            <Badge variant="secondary" className="text-xs">{notes.length}</Badge>
          )}
        </div>
        {!isAdding && (
          <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
            <MessageSquarePlus className="h-4 w-4 mr-1" />
            Nova Nota
          </Button>
        )}
      </div>

      {/* Add Note Form */}
      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-4 p-4 rounded-lg bg-secondary/30 border border-border/50">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva sua anotacao sobre esta pool..."
            className="w-full min-h-[80px] bg-transparent border-none outline-none resize-none text-sm placeholder:text-muted-foreground"
            autoFocus
          />
          {/* Tag selector */}
          <div className="flex flex-wrap gap-1.5 mt-2 mb-3">
            {SUGGESTED_TAGS.map(tag => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={cn(
                  'px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors',
                  selectedTags.includes(tag)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/80 text-muted-foreground hover:bg-secondary'
                )}
              >
                <Tag className="h-2.5 w-2.5 inline mr-0.5" />
                {tag}
              </button>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setIsAdding(false); setText(''); setSelectedTags([]); }}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={!text.trim() || addMutation.isPending}>
              {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </div>
        </form>
      )}

      {/* Notes List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-6">
          <StickyNote className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Nenhuma nota para esta pool</p>
          {!isAdding && (
            <p className="text-xs text-muted-foreground mt-1">Adicione notas para registrar suas analises e decisoes</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note: PoolNote) => (
            <div key={note.id} className="group p-3 rounded-lg bg-secondary/20 border border-border/30 hover:border-border/60 transition-colors">
              {editingNote === note.id ? (
                <form onSubmit={handleEditSubmit} className="space-y-3">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full min-h-[60px] bg-transparent border border-border/50 rounded-md p-2 outline-none resize-none text-sm placeholder:text-muted-foreground"
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED_TAGS.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleEditTag(tag)}
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors',
                          editTags.includes(tag)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary/80 text-muted-foreground hover:bg-secondary'
                        )}
                      >
                        <Tag className="h-2.5 w-2.5 inline mr-0.5" />
                        {tag}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditingNote(null)}>
                      Cancelar
                    </Button>
                    <Button type="submit" size="sm" disabled={!editText.trim() || editMutation.isPending}>
                      {editMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                      Salvar
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <p className="text-sm whitespace-pre-wrap flex-1">{note.text}</p>
                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                        onClick={() => startEdit(note)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(note.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {note.tags?.map(tag => (
                      <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                        {tag}
                      </Badge>
                    ))}
                    <span className="text-[10px] text-muted-foreground ml-auto font-mono">
                      {(() => {
                        try {
                          return formatDistanceToNow(new Date(note.createdAt), { addSuffix: true, locale: ptBR });
                        } catch {
                          return note.createdAt;
                        }
                      })()}
                    </span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
