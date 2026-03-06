import { useState, useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Columns3, Check } from "lucide-react";

export interface ColumnDef<T> {
  key: string;
  label: string;
  defaultVisible?: boolean;
  render: (item: T) => ReactNode;
}

interface ConfigurableTableProps<T> {
  tableName: string;
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  emptyIcon?: ReactNode;
  emptyMessage?: string;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  onRowClick?: (item: T) => void;
  getRowId: (item: T) => string;
}

function useColumnVisibility(tableName: string, columns: ColumnDef<any>[]) {
  const storageKey = `crm-columns-${tableName}`;

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        return new Set(parsed);
      }
    } catch {}
    return new Set(columns.filter(c => c.defaultVisible !== false).map(c => c.key));
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(Array.from(visibleColumns)));
  }, [visibleColumns, storageKey]);

  const toggle = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return { visibleColumns, toggle };
}

export function ConfigurableTable<T>({
  tableName,
  columns,
  data,
  isLoading,
  emptyIcon,
  emptyMessage = "No data",
  onEdit,
  onDelete,
  onRowClick,
  getRowId,
}: ConfigurableTableProps<T>) {
  const { visibleColumns, toggle } = useColumnVisibility(tableName, columns);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    if (pickerOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

  const activeColumns = columns.filter(c => visibleColumns.has(c.key));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end pb-2 shrink-0">
        <div className="relative" ref={pickerRef}>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setPickerOpen(!pickerOpen)}
            data-testid={`${tableName}-column-picker`}
          >
            <Columns3 className="w-3.5 h-3.5" />
            Columns
          </Button>
          {pickerOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg p-1 min-w-[160px]">
              {columns.map(col => (
                <button
                  key={col.key}
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded hover:bg-accent text-left"
                  onClick={() => toggle(col.key)}
                  data-testid={`column-toggle-${col.key}`}
                >
                  <div className={`flex items-center justify-center w-3.5 h-3.5 rounded-sm border ${visibleColumns.has(col.key) ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                    {visibleColumns.has(col.key) && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  {col.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12">
          {emptyIcon}
          <p className="text-sm text-muted-foreground mt-3">{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-auto flex-1 border border-border rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                {activeColumns.map(col => (
                  <th key={col.key} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
                {(onEdit || onDelete) && (
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground w-20">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map(item => {
                const rowId = getRowId(item);
                return (
                  <tr
                    key={rowId}
                    className={`border-b border-border/50 hover:bg-accent/30 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
                    onClick={() => onRowClick?.(item)}
                    data-testid={`${tableName}-row-${rowId}`}
                  >
                    {activeColumns.map(col => (
                      <td key={col.key} className="px-3 py-2.5 whitespace-nowrap">
                        {col.render(item)}
                      </td>
                    ))}
                    {(onEdit || onDelete) && (
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {onEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => { e.stopPropagation(); onEdit(item); }}
                              data-testid={`${tableName}-edit-${rowId}`}
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                            </Button>
                          )}
                          {onDelete && (
                            deleteConfirm === rowId ? (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-6 text-[10px] px-2"
                                  onClick={() => { onDelete(item); setDeleteConfirm(null); }}
                                  data-testid={`${tableName}-confirm-delete-${rowId}`}
                                >
                                  Confirm
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px] px-2"
                                  onClick={() => setDeleteConfirm(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(rowId); }}
                                data-testid={`${tableName}-delete-${rowId}`}
                              >
                                <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-400" />
                              </Button>
                            )
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
