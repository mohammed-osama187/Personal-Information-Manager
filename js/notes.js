import { getNotesFromFirebase, saveNoteToFirebase, deleteNoteFromFirebase } from './db.js';
import { showToast, showConfirm, getCategoryMeta } from './utils.js';

let activeNoteId = null;
let currentNotesFilter = 'all';
let currentSearchQuery = '';
let autoSaveTimeout = null;

export function initNotesUI() {
    const createBtn = document.getElementById('create-note-btn');
    const searchInput = document.getElementById('notes-search-input');
    const closeEditorBtn = document.getElementById('close-note-editor');
    const saveNoteBtn = document.getElementById('save-note-btn');
    const deleteNoteBtn = document.getElementById('delete-note-btn');
    const pinNoteBtn = document.getElementById('note-pin-btn');
    const editorBody = document.getElementById('note-editor-body');
    const titleInput = document.getElementById('note-title-input');
    const headingSelect = document.getElementById('note-heading-select');

    if (createBtn) {
        createBtn.addEventListener('click', () => openNoteEditor(null));
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchQuery = e.target.value.toLowerCase().trim();
            renderNotesList();
        });
    }

    if (closeEditorBtn) {
        closeEditorBtn.addEventListener('click', () => closeNoteEditor());
    }

    if (saveNoteBtn) {
        saveNoteBtn.addEventListener('click', () => saveCurrentNote(true));
    }

    if (deleteNoteBtn) {
        deleteNoteBtn.addEventListener('click', () => {
            if (!activeNoteId) {
                closeNoteEditor();
                return;
            }
            showConfirm('Are you sure you want to delete this note?', () => {
                deleteNote(activeNoteId);
                closeNoteEditor();
            });
        });
    }

    if (pinNoteBtn) {
        pinNoteBtn.addEventListener('click', () => {
            pinNoteBtn.classList.toggle('active');
            triggerAutoSave();
        });
    }

    // Auto-save on title or body input
    if (editorBody) {
        editorBody.addEventListener('input', () => {
            updateWordCount();
            triggerAutoSave();
        });

        // Listen for selection changes to highlight active formatting buttons
        editorBody.addEventListener('keyup', updateToolbarStates);
        editorBody.addEventListener('mouseup', updateToolbarStates);
    }

    if (titleInput) {
        titleInput.addEventListener('input', triggerAutoSave);
    }

    // Initialize formatting toolbar buttons
    const formatButtons = document.querySelectorAll('.note-format-btn');
    formatButtons.forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            // Prevent editor body from losing focus when clicking toolbar
            e.preventDefault();
            const command = btn.getAttribute('data-command');
            const value = btn.getAttribute('data-value') || null;
            executeFormat(command, value);
            updateToolbarStates();
        });
    });

    if (headingSelect) {
        headingSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'p') {
                executeFormat('formatBlock', '<p>');
            } else if (val === 'h1' || val === 'h2' || val === 'h3') {
                executeFormat('formatBlock', `<${val}>`);
            }
            if (editorBody) editorBody.focus();
        });
    }

    // Note category filter chips in Notes page
    const filterChips = document.querySelectorAll('.note-filter-chip');
    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentNotesFilter = chip.getAttribute('data-filter') || 'all';
            renderNotesList();
        });
    });

    window.addEventListener('flowtick-notes-changed', () => {
        renderNotesList();
    });

    // Render initially
    renderNotesList();
}

export function executeFormat(command, value = null) {
    const editorBody = document.getElementById('note-editor-body');
    if (!editorBody) return;
    editorBody.focus();

    if (command === 'blockquote') {
        // Toggle blockquote
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const parentBlock = selection.anchorNode.parentElement?.closest('blockquote');
            if (parentBlock) {
                document.execCommand('formatBlock', false, '<p>');
            } else {
                document.execCommand('formatBlock', false, '<blockquote>');
            }
        }
    } else {
        document.execCommand(command, false, value);
    }

    triggerAutoSave();
    updateWordCount();
}

function updateToolbarStates() {
    const formatButtons = document.querySelectorAll('.note-format-btn');
    formatButtons.forEach(btn => {
        const command = btn.getAttribute('data-command');
        if (!command || command === 'formatBlock' || command === 'removeFormat' || command === 'insertHorizontalRule') {
            return;
        }
        try {
            if (document.queryCommandState(command)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        } catch (_) {}
    });

    // Check heading level
    const headingSelect = document.getElementById('note-heading-select');
    if (headingSelect) {
        try {
            const parent = window.getSelection()?.anchorNode?.parentElement;
            if (parent) {
                const tag = parent.closest('h1, h2, h3, blockquote, p')?.tagName?.toLowerCase();
                if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
                    headingSelect.value = tag;
                } else {
                    headingSelect.value = 'p';
                }
            }
        } catch (_) {}
    }
}

function updateWordCount() {
    const editorBody = document.getElementById('note-editor-body');
    const countEl = document.getElementById('note-word-count');
    if (!editorBody || !countEl) return;

    const text = editorBody.innerText || '';
    const charCount = text.length;
    const wordCount = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;

    countEl.textContent = `${wordCount} words • ${charCount} chars`;
}

function triggerAutoSave() {
    const statusEl = document.getElementById('note-save-status');
    if (statusEl) {
        statusEl.textContent = 'Unsaved changes';
        statusEl.classList.remove('saved');
    }

    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        saveCurrentNote(false);
    }, 1200);
}

export async function renderNotesList() {
    const container = document.getElementById('notes-grid');
    if (!container) return;

    const allNotes = await getNotesFromFirebase();
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const currentUserId = currentUser ? currentUser.id : 'guest';

    let userNotes = allNotes.filter(n => n.userId === currentUserId);

    // Apply category filter
    if (currentNotesFilter !== 'all') {
        userNotes = userNotes.filter(n => (n.category || 'General').toLowerCase() === currentNotesFilter.toLowerCase());
    }

    // Apply search query
    if (currentSearchQuery) {
        userNotes = userNotes.filter(n => {
            const titleMatch = (n.title || '').toLowerCase().includes(currentSearchQuery);
            const contentMatch = (n.plainText || '').toLowerCase().includes(currentSearchQuery);
            return titleMatch || contentMatch;
        });
    }

    // Sort: Pinned first, then newest updated
    userNotes.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    if (userNotes.length === 0) {
        container.innerHTML = `
            <div class="empty-notes-state" style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; color: var(--text-muted);">
                <div style="font-size: 42px; margin-bottom: 12px; color: var(--color-ticktick-blue); opacity: 0.6;">
                    <i class="fa-regular fa-note-sticky"></i>
                </div>
                <h4 style="font-size: 17px; font-weight: 600; color: var(--text-main); margin-bottom: 6px;">No Notes Found</h4>
                <p style="font-size: 13.5px; max-width: 320px; margin: 0 auto 16px auto;">
                    ${currentSearchQuery ? 'No notes matched your search query.' : 'Capture your thoughts, ideas, plans, and documentation in rich formatted notes.'}
                </p>
                <button onclick="window.openNoteEditor(null)" class="btn btn-primary" style="margin: 0 auto; display: inline-flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-plus"></i> Create Note
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = userNotes.map(note => {
        const catMeta = getCategoryMeta(note.category || 'General');
        const updatedDateStr = formatNoteDate(note.updatedAt || note.createdAt);
        const preview = note.plainText ? escapeHTML(note.plainText.slice(0, 140)) + (note.plainText.length > 140 ? '...' : '') : '<span style="font-style: italic; opacity: 0.6;">Empty note</span>';

        return `
            <div class="note-card ${note.isPinned ? 'pinned' : ''}" onclick="window.openNoteEditor('${note.id}')">
                <div class="note-card-header">
                    <span class="note-category-pill" style="color: ${catMeta.color}; background: ${catMeta.bg};">
                        <i class="fa-solid ${catMeta.icon}"></i> ${escapeHTML(note.category || 'General')}
                    </span>
                    <div class="note-card-actions" onclick="event.stopPropagation();">
                        <button class="btn-icon note-pin-toggle ${note.isPinned ? 'active' : ''}" onclick="window.togglePinNote('${note.id}')" title="${note.isPinned ? 'Unpin Note' : 'Pin Note'}">
                            <i class="fa-solid fa-thumbtack"></i>
                        </button>
                        <button class="btn-icon note-delete-btn" onclick="window.confirmDeleteNote('${note.id}')" title="Delete Note">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                <h4 class="note-card-title">${escapeHTML(note.title || 'Untitled Note')}</h4>
                <div class="note-card-preview">${preview}</div>
                <div class="note-card-footer">
                    <span class="note-card-date"><i class="fa-regular fa-clock"></i> ${updatedDateStr}</span>
                </div>
            </div>
        `;
    }).join('');
}

export async function openNoteEditor(noteId) {
    activeNoteId = noteId;
    const modal = document.getElementById('note-editor-modal');
    const titleInput = document.getElementById('note-title-input');
    const editorBody = document.getElementById('note-editor-body');
    const categorySelect = document.getElementById('note-category-select');
    const pinBtn = document.getElementById('note-pin-btn');
    const statusEl = document.getElementById('note-save-status');

    if (!modal) return;

    if (noteId) {
        const allNotes = await getNotesFromFirebase();
        const note = allNotes.find(n => String(n.id) === String(noteId));
        if (note) {
            titleInput.value = note.title || '';
            editorBody.innerHTML = note.content || '';
            if (categorySelect) categorySelect.value = note.category || 'Work';
            if (pinBtn) {
                if (note.isPinned) pinBtn.classList.add('active');
                else pinBtn.classList.remove('active');
            }
        }
    } else {
        // New note
        titleInput.value = '';
        editorBody.innerHTML = '';
        if (categorySelect) categorySelect.value = 'Work';
        if (pinBtn) pinBtn.classList.remove('active');
    }

    if (statusEl) {
        statusEl.textContent = 'Saved';
        statusEl.classList.add('saved');
    }

    updateWordCount();
    modal.classList.add('active');
    setTimeout(() => {
        if (!titleInput.value) titleInput.focus();
        else editorBody.focus();
    }, 150);
}

export function closeNoteEditor() {
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
    }
    const modal = document.getElementById('note-editor-modal');
    if (modal) modal.classList.remove('active');
    activeNoteId = null;
    renderNotesList();
}

export async function saveCurrentNote(showFeedback = false) {
    const titleInput = document.getElementById('note-title-input');
    const editorBody = document.getElementById('note-editor-body');
    const categorySelect = document.getElementById('note-category-select');
    const pinBtn = document.getElementById('note-pin-btn');
    const statusEl = document.getElementById('note-save-status');

    if (!titleInput || !editorBody) return;

    const title = titleInput.value.trim();
    const content = editorBody.innerHTML.trim();
    const plainText = editorBody.innerText.trim();

    // If completely empty and new, do not save
    if (!title && !plainText && !activeNoteId) {
        return;
    }

    const category = categorySelect ? categorySelect.value : 'Work';
    const isPinned = pinBtn ? pinBtn.classList.contains('active') : false;

    const noteObj = {
        id: activeNoteId,
        title: title || 'Untitled Note',
        content: content,
        plainText: plainText,
        category: category,
        isPinned: isPinned
    };

    const saved = await saveNoteToFirebase(noteObj);
    activeNoteId = saved.id;

    if (statusEl) {
        statusEl.textContent = 'Saved';
        statusEl.classList.add('saved');
    }

    if (showFeedback) {
        showToast('Note saved successfully!', 'success', false);
    }
}

export async function deleteNote(noteId) {
    await deleteNoteFromFirebase(noteId);
    showToast('Note deleted', 'info', false);
    renderNotesList();
}

export async function togglePinNote(noteId) {
    const allNotes = await getNotesFromFirebase();
    const note = allNotes.find(n => String(n.id) === String(noteId));
    if (note) {
        note.isPinned = !note.isPinned;
        await saveNoteToFirebase(note);
        renderNotesList();
    }
}

export function confirmDeleteNote(noteId) {
    showConfirm('Delete this note permanently?', () => {
        deleteNote(noteId);
    });
}

function formatNoteDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today at ${timeStr}`;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
        return `Yesterday at ${timeStr}`;
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

// Window attachments for inline onclicks
window.openNoteEditor = openNoteEditor;
window.closeNoteEditor = closeNoteEditor;
window.togglePinNote = togglePinNote;
window.confirmDeleteNote = confirmDeleteNote;
