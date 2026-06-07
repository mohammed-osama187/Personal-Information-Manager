import { 
    db, 
    collection, 
    addDoc, 
    doc, 
    updateDoc, 
    getDocs, 
    deleteDoc, 
    query, 
    where 
} from './firebase.js';
import { showToast } from './utils.js';

// ==========================================
// Firebase Firestore Integration Helpers
// ==========================================
export async function getTasksFromFirebase() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) {
        // Guest mode - fetch from local storage guest_tasks
        const guestData = localStorage.getItem('guest_tasks');
        return guestData ? JSON.parse(guestData) : [];
    }

    if (!db) {
        const localData = localStorage.getItem('firebase_tasks_cache');
        return localData ? JSON.parse(localData) : [];
    }

    const currentUserId = currentUser.id;

    try {
        const q = query(
            collection(db, "tasks"), 
            where("userId", "==", currentUserId)
        );
        
        const querySnapshot = await getDocs(q);
        const items = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            data.id = doc.id; // Map Firestore ID
            items.push(data);
        });
        
        localStorage.setItem('firebase_tasks_cache', JSON.stringify(items));
        return items;
    } catch (e) {
        console.error("Error fetching tasks from Firebase:", e);
        const localData = localStorage.getItem('firebase_tasks_cache');
        return localData ? JSON.parse(localData) : [];
    }
}

// ==========================================
// Offline Sync Queue Engine
// ==========================================
export function getOfflineQueue() {
    return JSON.parse(localStorage.getItem('offline_sync_queue')) || [];
}

export function saveOfflineQueue(queue) {
    localStorage.setItem('offline_sync_queue', JSON.stringify(queue));
}

export function addToOfflineQueue(action, item) {
    const queue = getOfflineQueue();
    const existingIdx = queue.findIndex(entry => entry.item && String(entry.item.id) === String(item.id) && entry.action === action);
    if (existingIdx > -1) {
        queue[existingIdx] = { action, item, timestamp: Date.now() };
    } else {
        queue.push({ action, item, timestamp: Date.now() });
    }
    saveOfflineQueue(queue);
}

export function removeFromOfflineSaveQueue(id) {
    let queue = getOfflineQueue();
    queue = queue.filter(entry => !(entry.action === 'save' && entry.item && String(entry.item.id) === String(id)));
    saveOfflineQueue(queue);
}

let isSyncingOfflineQueue = false;
export async function syncOfflineQueue() {
    if (isSyncingOfflineQueue) return;
    if (!db) return;

    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    isSyncingOfflineQueue = true;
    console.log(`[OfflineSync] Starting synchronization of ${queue.length} offline operations...`);

    const remainingOperations = [];

    for (const op of queue) {
        try {
            if (op.action === 'save') {
                const item = op.item;
                const id = item.id;
                const itemCopy = { ...item };
                delete itemCopy.id;

                Object.keys(itemCopy).forEach(key => {
                    if (itemCopy[key] === undefined) {
                        itemCopy[key] = null;
                    }
                });

                if (id && String(id).startsWith('offline_')) {
                    const docRef = await addDoc(collection(db, "tasks"), itemCopy);
                    const newId = docRef.id;

                    let cachedTasks = JSON.parse(localStorage.getItem('firebase_tasks_cache')) || [];
                    const localIdx = cachedTasks.findIndex(t => String(t.id) === String(id));
                    if (localIdx > -1) {
                        cachedTasks[localIdx].id = newId;
                        localStorage.setItem('firebase_tasks_cache', JSON.stringify(cachedTasks));
                        
                        import('./notifications.js').then(module => {
                            module.scheduleItemNotifications(cachedTasks[localIdx]);
                        });
                    }

                    queue.forEach(otherOp => {
                        if (otherOp.item && String(otherOp.item.id) === String(id)) {
                            otherOp.item.id = newId;
                        }
                    });
                } else if (id) {
                    const docRef = doc(db, "tasks", String(id));
                    await updateDoc(docRef, itemCopy);
                }
            } else if (op.action === 'delete') {
                const id = op.item.id;
                if (id && !String(id).startsWith('offline_')) {
                    const docRef = doc(db, "tasks", String(id));
                    await deleteDoc(docRef);
                }
            }
        } catch (err) {
            console.error("[OfflineSync] Error syncing operation, will retry later:", op, err);
            remainingOperations.push(op);
        }
    }

    saveOfflineQueue(remainingOperations);
    isSyncingOfflineQueue = false;

    if (remainingOperations.length === 0) {
        console.log("[OfflineSync] Sync complete! All offline changes published.");
        import('./ui.js').then(module => {
            module.displayTasks();
        });
        if (window.calendarInstance) window.calendarInstance.refetchEvents();
    }
}

window.addEventListener('online', () => {
    console.log("[Connection] Network online. Triggering sync...");
    syncOfflineQueue();
});

export async function saveTaskToFirebase(item) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) {
        let guestTasks = JSON.parse(localStorage.getItem('guest_tasks')) || [];
        if (!item.id) {
            item.id = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }
        
        const idx = guestTasks.findIndex(t => String(t.id) === String(item.id));
        if (idx > -1) {
            guestTasks[idx] = item;
        } else {
            guestTasks.push(item);
        }
        localStorage.setItem('guest_tasks', JSON.stringify(guestTasks));
        return;
    }

    let cachedTasks = JSON.parse(localStorage.getItem('firebase_tasks_cache')) || [];
    if (!item.id) {
        item.id = 'offline_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    const idx = cachedTasks.findIndex(t => String(t.id) === String(item.id));
    if (idx > -1) {
        cachedTasks[idx] = item;
    } else {
        cachedTasks.push(item);
    }
    localStorage.setItem('firebase_tasks_cache', JSON.stringify(cachedTasks));

    if (!db) {
        console.warn("Firebase not loaded yet. Saved task locally.");
        addToOfflineQueue('save', item);
        return;
    }

    try {
        const itemCopy = { ...item };
        const id = itemCopy.id;

        if (id && String(id).startsWith('offline_')) {
            delete itemCopy.id;
            Object.keys(itemCopy).forEach(key => {
                if (itemCopy[key] === undefined) {
                    itemCopy[key] = null;
                }
            });
            const docRef = await addDoc(collection(db, "tasks"), itemCopy);
            const newId = docRef.id;
            
            let currentCache = JSON.parse(localStorage.getItem('firebase_tasks_cache')) || [];
            const localIdx = currentCache.findIndex(t => String(t.id) === String(id));
            if (localIdx > -1) {
                currentCache[localIdx].id = newId;
                localStorage.setItem('firebase_tasks_cache', JSON.stringify(currentCache));
                
                import('./notifications.js').then(module => {
                    module.scheduleItemNotifications(currentCache[localIdx]);
                });
            }
            item.id = newId;
        } else {
            delete itemCopy.id;
            Object.keys(itemCopy).forEach(key => {
                if (itemCopy[key] === undefined) {
                    itemCopy[key] = null;
                }
            });
            if (id) {
                const docRef = doc(db, "tasks", String(id));
                await updateDoc(docRef, itemCopy);
            } else {
                const docRef = await addDoc(collection(db, "tasks"), itemCopy);
                item.id = docRef.id;
                let currentCache = JSON.parse(localStorage.getItem('firebase_tasks_cache')) || [];
                const localIdx = currentCache.findIndex(t => String(t.id) === String(id));
                if (localIdx > -1) {
                    currentCache[localIdx].id = docRef.id;
                    localStorage.setItem('firebase_tasks_cache', JSON.stringify(currentCache));
                }
            }
        }
    } catch (e) {
        console.error("Error saving task to Firebase:", e);
        addToOfflineQueue('save', item);
    }
}

export async function deleteTaskFromFirebase(id) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    
    import('./notifications.js').then(module => {
        module.cancelMobileNotification(id);
        module.cancelMobileNotification(id + '_due');
    });
    
    let cachedTasks = JSON.parse(localStorage.getItem('firebase_tasks_cache')) || [];
    cachedTasks = cachedTasks.filter(t => String(t.id) !== String(id));
    localStorage.setItem('firebase_tasks_cache', JSON.stringify(cachedTasks));

    if (!currentUser) {
        let guestTasks = JSON.parse(localStorage.getItem('guest_tasks')) || [];
        guestTasks = guestTasks.filter(t => String(t.id) !== String(id));
        localStorage.setItem('guest_tasks', JSON.stringify(guestTasks));
        return;
    }

    if (!db) {
        console.warn("Firebase not loaded yet. Deleted task locally.");
        addToOfflineQueue('delete', { id });
        return;
    }

    if (String(id).startsWith('offline_')) {
        removeFromOfflineSaveQueue(id);
        return;
    }

    try {
        const docRef = doc(db, "tasks", String(id));
        await deleteDoc(docRef);
    } catch (e) {
        console.error("Error deleting task from Firebase:", e);
        addToOfflineQueue('delete', { id });
    }
}

export async function syncGuestDataToFirebase(userId) {
    const guestTasks = JSON.parse(localStorage.getItem('guest_tasks')) || [];
    if (guestTasks.length === 0) return;

    if (!db) {
        console.warn("Firebase not fully loaded to sync guest data yet. Retrying in 1 second...");
        setTimeout(() => syncGuestDataToFirebase(userId), 1000);
        return;
    }

    showToast('Syncing your guest tasks...', 'info');

    try {
        for (const task of guestTasks) {
            task.userId = userId;
            if (task.id && task.id.startsWith('guest_')) {
                delete task.id;
            }
            
            Object.keys(task).forEach(key => {
                if (task[key] === undefined) {
                    task[key] = null;
                }
            });

            await addDoc(collection(db, "tasks"), task);
        }
        
        localStorage.removeItem('guest_tasks');
        showToast('All guest tasks have been synced!', 'success');
        
        import('./ui.js').then(module => {
            module.displayTasks();
        });
        if (window.calendarInstance) window.calendarInstance.refetchEvents();
    } catch (err) {
        console.error("Error syncing guest data:", err);
        showToast('Failed to sync some guest tasks. We will try again later.', 'error');
    }
}
