import React, { useState, useMemo, useRef } from 'react';
import { Bookmark, dbService } from '../services/db';
import { Globe, Folder, ChevronRight, ChevronDown, Trash2, Edit2, Check, X, FolderOpen } from 'lucide-react';
import { t } from '../services/i18n';

// Track currently dragged bookmark across components
let activeDraggedBookmark: Bookmark | null = null;

export const sortBookmarks = (items: Bookmark[], sortBy: 'a-z' | 'date' | 'manual'): Bookmark[] => {
  return [...items].sort((a, b) => {
    const isAFolder = a.type === 'folder';
    const isBFolder = b.type === 'folder';

    // 1. Folders are ALWAYS at the top across all sort modes (A-Z, Manual, Date modified)
    if (isAFolder && !isBFolder) return -1;
    if (!isAFolder && isBFolder) return 1;

    // 2. Both are folders
    if (isAFolder && isBFolder) {
      if (sortBy === 'manual') {
        // If folders have been manually reordered among themselves, use folderOrder
        if (a.folderOrder !== undefined && b.folderOrder !== undefined && a.folderOrder !== b.folderOrder) {
          return a.folderOrder - b.folderOrder;
        }
        // Default: Folders are sorted A-Z
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'a-z') {
        return a.title.localeCompare(b.title);
      }
      return b.createdAt - a.createdAt;
    }

    // 3. Both are links (or non-folders)
    if (sortBy === 'manual') {
      const orderA = a.order !== undefined ? a.order : 999999;
      const orderB = b.order !== undefined ? b.order : 999999;
      if (orderA !== orderB) return orderA - orderB;
      return b.createdAt - a.createdAt;
    }
    if (sortBy === 'a-z') {
      return a.title.localeCompare(b.title);
    }
    return b.createdAt - a.createdAt;
  });
};

interface Props {
  bookmark: Bookmark;
  bookmarks: Bookmark[];
  level: number;
  onNavigate: (url: string) => void;
  onOpenNewTab: (url: string, background?: boolean) => void;
  onContextMenu: (e: React.MouseEvent, bookmark: Bookmark) => void;
  onUpdate: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
  onReorder: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
  isDescendant: (folderId: string, potentialParentId: string) => boolean;
  sortBy: 'a-z' | 'date' | 'manual';
  tabs?: any[];
}

export const BookmarkTreeItem: React.FC<Props> = ({ bookmark, bookmarks, level, onNavigate, onOpenNewTab, onContextMenu, onUpdate, onDelete, onReorder, isDescendant, sortBy, tabs = [] }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dragPosition, setDragPosition] = useState<'before' | 'after' | 'inside' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDroppedHighlight, setIsDroppedHighlight] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(bookmark.title);
  const [editUrl, setEditUrl] = useState(bookmark.url || '');
  const expandTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const lang = useMemo(() => {
    try {
      const saved = localStorage.getItem('preferenceSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.language) return parsed.language;
      }
    } catch (e) {}
    return 'id';
  }, []);
  
  const children = useMemo(() => {
    const rawChildren = bookmarks.filter(b => b.parentId === bookmark.id);
    return sortBookmarks(rawChildren, sortBy);
  }, [bookmarks, bookmark.id, sortBy]);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(bookmark.id);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditTitle(bookmark.title);
    setEditUrl(bookmark.url || '');
  };

  const handleSaveEdit = async (e: React.MouseEvent | React.FormEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const updated = { ...bookmark, title: editTitle, url: editUrl };
    onUpdate(updated);
    setIsEditing(false);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
  };

  const getFaviconUrl = () => {
    if (bookmark.favicon) return bookmark.favicon;
    if (bookmark.url) {
      try {
        const url = new URL(bookmark.url);
        return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`;
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  const faviconUrl = getFaviconUrl();

  return (
    <div className="w-full">
      <div 
        className={`flex items-center justify-between p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg group transition-all duration-300 cursor-pointer relative 
          ${dragPosition === 'inside' ? 'bg-orange-500/15 dark:bg-amber-500/15 scale-[1.02] border border-dashed border-orange-500/30 dark:border-amber-500/30 shadow-md shadow-orange-500/10' : ''} 
          ${isDragging ? 'opacity-30 scale-[0.97] border border-dashed border-orange-500/40 dark:border-amber-500/40 bg-orange-500/5 dark:bg-amber-500/5' : ''} 
          ${isDroppedHighlight ? 'bg-green-500/20 dark:bg-green-500/35 scale-[1.03] shadow-[0_0_15px_rgba(34,197,94,0.4)] border border-green-500/40 dark:border-green-500/50' : ''}
        `}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={(e) => {
          if (isEditing) return;
          if (bookmark.type === 'folder') {
            setIsExpanded(!isExpanded);
          } else if (bookmark.url) {
            if (e.ctrlKey || e.metaKey) {
              onOpenNewTab(bookmark.url, true);
            } else {
              onNavigate(bookmark.url);
            }
          }
        }}
        onContextMenu={(e) => {
          if (isEditing) return;
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(e, bookmark);
        }}
        draggable={!isEditing}
        onDragStart={(e) => {
          if (isEditing) {
            e.preventDefault();
            return;
          }
          setIsDragging(true);
          activeDraggedBookmark = bookmark;
          e.dataTransfer.setData('application/json', JSON.stringify(bookmark));
        }}
        onDragEnd={() => {
          setIsDragging(false);
          activeDraggedBookmark = null;
        }}
        onDragOver={(e) => {
          if (isEditing) return;
          e.preventDefault();
          const rect = e.currentTarget.getBoundingClientRect();
          const y = e.clientY - rect.top;
          
          if (bookmark.type === 'folder') {
            // Auto-expand folder when hovered while dragging
            if (!isExpanded && !expandTimeoutRef.current) {
              expandTimeoutRef.current = setTimeout(() => {
                setIsExpanded(true);
                expandTimeoutRef.current = null;
              }, 600);
            }

            // If dragged item is a link (or dragging external url), always target inside folder!
            if (!activeDraggedBookmark || activeDraggedBookmark.type !== 'folder') {
              setDragPosition('inside');
            } else {
              if (y < rect.height * 0.25) {
                setDragPosition('before');
              } else if (y > rect.height * 0.75) {
                setDragPosition('after');
              } else {
                setDragPosition('inside');
              }
            }
          } else {
            if (y < rect.height * 0.5) {
              setDragPosition('before');
            } else {
              setDragPosition('after');
            }
          }
        }}
        onDragLeave={(e) => {
          if (expandTimeoutRef.current) {
            clearTimeout(expandTimeoutRef.current);
            expandTimeoutRef.current = null;
          }
          setDragPosition(null);
        }}
        onDrop={async (e) => {
          if (isEditing) return;
          e.preventDefault();
          e.stopPropagation();
          if (expandTimeoutRef.current) {
            clearTimeout(expandTimeoutRef.current);
            expandTimeoutRef.current = null;
          }
          const currentDragPosition = dragPosition;
          setDragPosition(null);
          activeDraggedBookmark = null;
          
          const data = e.dataTransfer.getData('application/json');
          if (data) {
            try {
              const droppedBm = JSON.parse(data) as Bookmark;
              if (droppedBm.id !== bookmark.id && !isDescendant(droppedBm.id, bookmark.id)) {
                // If dropped on folder or position is inside, automatically expand the folder
                if (bookmark.type === 'folder' || currentDragPosition === 'inside') {
                  setIsExpanded(true);
                }
                const effectivePosition = (droppedBm.type !== 'folder' && bookmark.type === 'folder')
                  ? 'inside'
                  : (currentDragPosition || (bookmark.type === 'folder' ? 'inside' : 'after'));
                onReorder(droppedBm.id, bookmark.id, effectivePosition);
                setIsDroppedHighlight(true);
                setTimeout(() => {
                  setIsDroppedHighlight(false);
                }, 800);
              }
              return;
            } catch (err) {}
          }
          
          let droppedUrl = e.dataTransfer.getData('text/plain');
          if (droppedUrl) {
            droppedUrl = droppedUrl.trim();
            if (!droppedUrl.startsWith('http://') && !droppedUrl.startsWith('https://')) {
              if (droppedUrl.includes('.')) {
                droppedUrl = `https://${droppedUrl}`;
              } else {
                return;
              }
            }

            // Resolve title from tabs
            let resolvedTitle = '';
            const cleanUrl = (u: string) => u.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase();
            const targetClean = cleanUrl(droppedUrl);
            const matchedTab = tabs?.find(t => cleanUrl(t.url) === targetClean);
            if (matchedTab && matchedTab.title && matchedTab.title !== 'New Tab' && matchedTab.title !== 'Loading...') {
              resolvedTitle = matchedTab.title;
            } else {
              // Helper getHostname fallback
              let host = '';
              try {
                const parsed = new URL(droppedUrl);
                host = parsed.hostname;
              } catch (e) {
                host = droppedUrl;
              }
              resolvedTitle = host || droppedUrl;
            }

            const isFolderTarget = bookmark.type === 'folder' || currentDragPosition === 'inside';
            const newBm: Bookmark = {
              id: `bm-${Date.now()}`,
              title: resolvedTitle,
              url: droppedUrl,
              type: 'link',
              parentId: isFolderTarget ? bookmark.id : bookmark.parentId,
              createdAt: Date.now()
            };
            onUpdate(newBm);
            if (bookmark.type === 'folder') {
              setIsExpanded(true);
            }
            setIsDroppedHighlight(true);
            setTimeout(() => {
              setIsDroppedHighlight(false);
            }, 800);
          }
        }}
      >
        {dragPosition === 'before' && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500 dark:from-amber-500 dark:to-orange-500 z-10 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.8)] animate-pulse transition-all duration-200" />
        )}
        {dragPosition === 'after' && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500 dark:from-amber-500 dark:to-orange-500 z-10 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.8)] animate-pulse transition-all duration-200" />
        )}
        <div className="flex items-center gap-2 overflow-hidden flex-1">
          {bookmark.type === 'folder' && (
            <div className="text-zinc-400">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          )}
          {bookmark.type === 'folder' ? (
            isExpanded ? (
              <FolderOpen size={14} className="text-orange-500 dark:text-amber-500 flex-shrink-0" />
            ) : (
              <Folder size={14} className="text-orange-500 dark:text-amber-500 flex-shrink-0" fill="currentColor" />
            )
          ) : faviconUrl ? (
            <img src={faviconUrl} alt="favicon" className="w-3.5 h-3.5 object-contain flex-shrink-0" />
          ) : (
            <Globe size={14} className="text-zinc-400 flex-shrink-0" />
          )}
          
          {isEditing ? (
            <form onSubmit={handleSaveEdit} className="flex flex-col gap-1 flex-1 w-full mr-2">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-sm font-medium text-zinc-900 dark:text-white bg-white dark:bg-[#1e1e1e] border border-black/20 dark:border-white/20 rounded px-1.5 py-0.5 outline-none focus:border-orange-500 dark:focus:border-amber-500 w-full"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
              {bookmark.type !== 'folder' && (
                <input
                  type="text"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="text-[10px] text-zinc-500 bg-white dark:bg-[#1e1e1e] border border-black/20 dark:border-white/20 rounded px-1.5 py-0.5 outline-none focus:border-orange-500 dark:focus:border-amber-500 w-full"
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </form>
          ) : (
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium text-zinc-900 dark:text-white dark:group-hover:text-white truncate">{bookmark.title}</span>
              {bookmark.type !== 'folder' && bookmark.url && (
                <span className="text-[10px] text-zinc-500 truncate">{bookmark.url}</span>
              )}
            </div>
          )}
        </div>
        
        {dragPosition === 'inside' && bookmark.type === 'folder' && (
          <span className="text-[10px] font-medium text-orange-600 dark:text-amber-400 bg-orange-500/10 dark:bg-amber-500/10 px-1.5 py-0.5 rounded border border-orange-500/20 dark:border-amber-500/20 animate-pulse flex-shrink-0 ml-2">
            + {lang === 'id' ? 'Masuk ke folder' : 'Move into folder'}
          </span>
        )}
        
        {isEditing ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleSaveEdit}
              className="p-1 text-green-600 dark:text-green-400 hover:bg-green-500/10 dark:hover:bg-green-500/20 rounded-md transition-all"
              title={t('save', lang)}
            >
              <Check size={14} />
            </button>
            <button
              onClick={handleCancelEdit}
              className="p-1 text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/20 rounded-md transition-all"
              title={t('cancel', lang)}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all">
            <button
              onClick={handleEdit}
              className="p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-500/10 dark:hover:bg-blue-500/20 rounded-md"
              title={t('edit', lang)}
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/20 rounded-md"
              title={t('delete', lang)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      
      {bookmark.type === 'folder' && isExpanded && (
        <div className="flex flex-col w-full">
          {children.length === 0 ? (
            <div 
              className="text-xs text-zinc-500 italic py-1"
              style={{ paddingLeft: `${(level + 1) * 16 + 8 + 28}px` }}
            >
              Kosong
            </div>
          ) : (
            children.map(child => (
              <BookmarkTreeItem
                key={child.id}
                bookmark={child}
                bookmarks={bookmarks}
                level={level + 1}
                onNavigate={onNavigate}
                onOpenNewTab={onOpenNewTab}
                onContextMenu={onContextMenu}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onReorder={onReorder}
                isDescendant={isDescendant}
                sortBy={sortBy}
                tabs={tabs}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};
