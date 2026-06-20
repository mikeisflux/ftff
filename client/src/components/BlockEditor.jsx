import { useEffect, useCallback, useState, useRef } from 'react';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Link as LinkIcon, Image as ImageIcon, Plus, ChevronDown,
  List, ListOrdered, Quote, Minus, Code, Loader2, Type, Heading2, Heading3,
  Upload, Link2, X,
} from 'lucide-react';
import { uploadFile } from '../lib/api.js';

// A single row in a block-menu dropdown.
function MenuItem({ icon, label, onClick, active }) {
  const Icon = icon;
  return (
    <button type="button" className={`be-item${active ? ' active' : ''}`} onClick={onClick}>
      <Icon size={16} /> {label}
    </button>
  );
}

// Block-style rich editor (TipTap) — a port of the IndieCrowdfund builder editor
// adapted to FTFF's stack/theme. Emits HTML via onChange. A floating "+" opens a
// block menu (type, image, link, list); selecting text reveals an inline bubble
// menu. Images upload to /admin/uploads or can be added by URL / paste / drop.
export default function BlockEditor({ value, onChange, placeholder = 'Start writing…' }) {
  const [isUploading, setIsUploading] = useState(false);
  const [activeBlockTop, setActiveBlockTop] = useState(null);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showImageOptions, setShowImageOptions] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [editorFocused, setEditorFocused] = useState(false);
  const [isEditorReady, setIsEditorReady] = useState(false);

  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  const blockMenuRef = useRef(null);
  const plusButtonRef = useRef(null);
  // Last HTML we emitted upward — guards the value-sync effect from calling
  // setContent on the parent's round-tripped echo (which would nuke the cursor).
  const lastEmittedRef = useRef(value);

  const uploadImage = useCallback(async (file) => {
    setIsUploading(true);
    try {
      const { url } = await uploadFile('/admin/uploads', file);
      return url || null;
    } catch (err) {
      alert(err.message || 'Failed to upload image');
      return null;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        dropcursor: { color: 'var(--color-primary)', width: 2 },
      }),
      TiptapImage.configure({
        HTMLAttributes: { style: 'max-width:100%;height:auto;border-radius:8px;margin:12px auto;display:block;' },
        allowBase64: true,
      }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'be-link' } }),
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === 'heading' ? 'Heading…' : placeholder),
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
    ],
    content: value,
    editorProps: {
      attributes: { class: 'tiptap' },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            event.preventDefault();
            const file = items[i].getAsFile();
            if (file) {
              uploadImage(file).then((url) => {
                if (url && view.state) {
                  view.dispatch(view.state.tr.replaceSelectionWith(
                    view.state.schema.nodes.image.create({ src: url })));
                }
              });
            }
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
        for (const file of imageFiles) {
          uploadImage(file).then((url) => {
            if (url && view.state && coords) {
              view.dispatch(view.state.tr.insert(coords.pos,
                view.state.schema.nodes.image.create({ src: url })));
            }
          });
        }
        return true;
      },
    },
    onCreate: () => { requestAnimationFrame(() => setIsEditorReady(true)); },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
    onFocus: () => setEditorFocused(true),
    onBlur: ({ event }) => {
      const related = event.relatedTarget;
      if (related && containerRef.current?.contains(related)) return;
      setTimeout(() => {
        setEditorFocused(false);
        setShowBlockMenu(false); setShowTypeDropdown(false);
        setShowImageOptions(false); setShowUrlInput(false);
      }, 200);
    },
  });

  // Apply only true external value changes (e.g. reset after send) — never the
  // round-trip echo of our own edits.
  useEffect(() => {
    if (!editor || !isEditorReady || editor.isDestroyed) return;
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    editor.commands.setContent(value || '', false);
  }, [value, editor, isEditorReady]);

  // Track the active block's vertical offset so the "+" button rides alongside it.
  const updateActiveBlockPosition = useCallback(() => {
    if (!editor || editor.isDestroyed || !containerRef.current || !editor.view) {
      setActiveBlockTop(null);
      return;
    }
    try {
      const { from } = editor.state.selection;
      const domAtPos = editor.view.domAtPos(from);
      const node = domAtPos.node;
      const proseMirror = editor.view.dom;
      let blockElement = node instanceof HTMLElement ? node : node?.parentElement || null;
      while (blockElement && blockElement.parentElement !== proseMirror) {
        blockElement = blockElement.parentElement;
      }
      if (!blockElement) blockElement = proseMirror.firstElementChild;
      if (blockElement) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const blockRect = blockElement.getBoundingClientRect();
        setActiveBlockTop(blockRect.top - containerRect.top);
      } else {
        setActiveBlockTop(null);
      }
    } catch { setActiveBlockTop(null); }
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const onFocus = () => { setEditorFocused(true); requestAnimationFrame(updateActiveBlockPosition); };
    editor.on('selectionUpdate', updateActiveBlockPosition);
    editor.on('update', updateActiveBlockPosition);
    editor.on('focus', onFocus);
    return () => {
      editor.off('selectionUpdate', updateActiveBlockPosition);
      editor.off('update', updateActiveBlockPosition);
      editor.off('focus', onFocus);
    };
  }, [editor, updateActiveBlockPosition]);

  useEffect(() => {
    if (!showBlockMenu) return;
    const handler = (e) => {
      if (blockMenuRef.current && !blockMenuRef.current.contains(e.target)
        && plusButtonRef.current && !plusButtonRef.current.contains(e.target)) {
        setShowBlockMenu(false); setShowTypeDropdown(false);
        setShowImageOptions(false); setShowUrlInput(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showBlockMenu]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        setShowBlockMenu(false); setShowTypeDropdown(false);
        setShowImageOptions(false); setShowUrlInput(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const getCurrentBlockType = useCallback(() => {
    if (!editor) return 'Paragraph';
    if (editor.isActive('heading', { level: 2 })) return 'Heading 2';
    if (editor.isActive('heading', { level: 3 })) return 'Heading 3';
    if (editor.isActive('bulletList')) return 'Bullet List';
    if (editor.isActive('orderedList')) return 'Numbered List';
    if (editor.isActive('blockquote')) return 'Quote';
    return 'Paragraph';
  }, [editor]);

  const setBlockType = useCallback((type) => {
    if (!editor) return;
    const c = editor.chain().focus();
    ({
      paragraph: () => c.setParagraph().run(),
      heading2: () => c.toggleHeading({ level: 2 }).run(),
      heading3: () => c.toggleHeading({ level: 3 }).run(),
      bulletList: () => c.toggleBulletList().run(),
      orderedList: () => c.toggleOrderedList().run(),
      quote: () => c.toggleBlockquote().run(),
      divider: () => c.setHorizontalRule().run(),
    }[type] || (() => {}))();
    setShowTypeDropdown(false); setShowBlockMenu(false);
    setShowImageOptions(false); setShowUrlInput(false);
  }, [editor]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL:', previousUrl);
    if (url === null) return;
    if (url === '') { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (file && editor) {
      const url = await uploadImage(file);
      if (url) editor.chain().focus().setImage({ src: url }).run();
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowImageOptions(false); setShowBlockMenu(false);
  }, [editor, uploadImage]);

  const insertImageFromUrl = useCallback(() => {
    if (!editor || !imageUrlInput.trim()) return;
    editor.chain().focus().setImage({ src: imageUrlInput.trim() }).run();
    setImageUrlInput(''); setShowUrlInput(false);
    setShowImageOptions(false); setShowBlockMenu(false);
  }, [editor, imageUrlInput]);

  const preventFocusLoss = useCallback((e) => { e.preventDefault(); e.stopPropagation(); }, []);

  if (!editor) return <div className="be-wrap" style={{ minHeight: 320, opacity: 0.5 }} />;

  const showPlusButton = (editorFocused || showBlockMenu) && activeBlockTop !== null;
  const FLIP_THRESHOLD_PX = 320;
  const containerHeight = containerRef.current?.clientHeight ?? 0;
  const flipMenuUp = activeBlockTop !== null && containerHeight > 0
    && containerHeight - activeBlockTop < FLIP_THRESHOLD_PX;
  const popPos = flipMenuUp ? { bottom: 40 } : { top: 40 };
  const dropPos = flipMenuUp ? { bottom: '100%', marginBottom: 4 } : { top: '100%', marginTop: 4 };

  return (
    <div ref={containerRef} className="be-wrap">
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />

      {showPlusButton && (
        <div style={{ position: 'absolute', left: 8, zIndex: 20, top: activeBlockTop ?? 0 }}>
          <button
            ref={plusButtonRef} type="button" title="Add or edit block"
            onMouseDown={preventFocusLoss}
            onClick={() => { setShowBlockMenu(!showBlockMenu); setShowTypeDropdown(false); setShowImageOptions(false); setShowUrlInput(false); }}
            className={`be-plus${showBlockMenu ? ' open' : ''}`}
          >
            <Plus size={16} style={{ transition: 'transform .15s', transform: showBlockMenu ? 'rotate(45deg)' : 'none' }} />
          </button>

          {showBlockMenu && (
            <div ref={blockMenuRef} onMouseDown={preventFocusLoss} className="be-menu" style={{ position: 'absolute', left: 0, ...popPos }}>
              <div style={{ position: 'relative' }}>
                <button type="button" className={`be-btn wide${showTypeDropdown ? ' active' : ''}`}
                  onClick={() => { setShowTypeDropdown(!showTypeDropdown); setShowImageOptions(false); setShowUrlInput(false); }}>
                  <span style={{ fontSize: '.78rem' }}>{getCurrentBlockType()}</span> <ChevronDown size={12} />
                </button>
                {showTypeDropdown && (
                  <div className="be-dropdown" style={{ position: 'absolute', left: 0, width: 180, ...dropPos }}>
                    <MenuItem icon={Type} label="Paragraph" active={editor.isActive('paragraph') && !editor.isActive('bulletList') && !editor.isActive('orderedList') && !editor.isActive('blockquote')} onClick={() => setBlockType('paragraph')} />
                    <MenuItem icon={Heading2} label="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => setBlockType('heading2')} />
                    <MenuItem icon={Heading3} label="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => setBlockType('heading3')} />
                    <div className="be-sep" />
                    <MenuItem icon={List} label="Bullet List" active={editor.isActive('bulletList')} onClick={() => setBlockType('bulletList')} />
                    <MenuItem icon={ListOrdered} label="Numbered List" active={editor.isActive('orderedList')} onClick={() => setBlockType('orderedList')} />
                    <MenuItem icon={Quote} label="Quote" active={editor.isActive('blockquote')} onClick={() => setBlockType('quote')} />
                    <div className="be-sep" />
                    <MenuItem icon={Minus} label="Divider" onClick={() => setBlockType('divider')} />
                  </div>
                )}
              </div>

              <div className="be-vsep" />

              <div style={{ position: 'relative' }}>
                <button type="button" disabled={isUploading} title="Insert image"
                  className={`be-btn${showImageOptions ? ' active' : ''}`}
                  onClick={() => { setShowImageOptions(!showImageOptions); setShowTypeDropdown(false); setShowUrlInput(false); }}>
                  {isUploading ? <Loader2 size={16} className="be-spin" /> : <ImageIcon size={16} />}
                </button>
                {showImageOptions && (
                  <div className="be-dropdown" style={{ position: 'absolute', left: 0, width: 210, ...dropPos }}>
                    <MenuItem icon={Upload} label="Upload from computer" onClick={() => fileInputRef.current?.click()} />
                    <MenuItem icon={Link2} label="Paste image URL" onClick={() => { setShowUrlInput(true); setShowImageOptions(false); }} />
                  </div>
                )}
              </div>

              <button type="button" title="Insert link" className="be-btn" onClick={() => { addLink(); setShowBlockMenu(false); }}>
                <LinkIcon size={16} />
              </button>
              <button type="button" title="Toggle list" className={`be-btn${editor.isActive('bulletList') ? ' active' : ''}`}
                onClick={() => { editor.chain().focus().toggleBulletList().run(); setShowBlockMenu(false); }}>
                <List size={16} />
              </button>
            </div>
          )}

          {showUrlInput && (
            <div ref={blockMenuRef} onMouseDown={preventFocusLoss} className="be-menu" style={{ position: 'absolute', left: 0, gap: 6, ...popPos }}>
              <input
                type="url" placeholder="https://example.com/image.jpg" value={imageUrlInput} autoFocus
                onChange={(e) => setImageUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); insertImageFromUrl(); }
                  if (e.key === 'Escape') { setShowUrlInput(false); setImageUrlInput(''); }
                }}
                style={{ width: 240 }}
              />
              <button type="button" className="btn" onClick={insertImageFromUrl} disabled={!imageUrlInput.trim()}>Insert</button>
              <button type="button" className="be-btn" onClick={() => { setShowUrlInput(false); setImageUrlInput(''); }}><X size={16} /></button>
            </div>
          )}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        {editor && (
          <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}
            shouldShow={({ editor: e }) => {
              if (e.isDestroyed || !e.view?.dom?.parentNode) return false;
              const { from, to } = e.state.selection;
              return from !== to;
            }}
            className="be-menu">
            <button type="button" onMouseDown={preventFocusLoss} className={`be-btn${editor.isActive('bold') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></button>
            <button type="button" onMouseDown={preventFocusLoss} className={`be-btn${editor.isActive('italic') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></button>
            <button type="button" onMouseDown={preventFocusLoss} className={`be-btn${editor.isActive('code') ? ' active' : ''}`} onClick={() => editor.chain().focus().toggleCode().run()}><Code size={16} /></button>
            <div className="be-vsep" />
            <button type="button" onMouseDown={preventFocusLoss} className={`be-btn${editor.isActive('link') ? ' active' : ''}`} onClick={addLink}><LinkIcon size={16} /></button>
          </BubbleMenu>
        )}
        <EditorContent editor={editor} />
        {isUploading && (
          <div className="be-overlay"><Loader2 size={20} className="be-spin" /> <span>Uploading image…</span></div>
        )}
      </div>

      <div className="be-footer">
        <span><Upload size={12} /> Drag &amp; drop or paste images</span>
        <span>Click <Plus size={12} style={{ verticalAlign: 'middle' }} /> to add blocks</span>
      </div>
    </div>
  );
}
