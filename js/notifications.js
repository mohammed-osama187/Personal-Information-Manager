import { 
    getStableNumericId, 
    formatTaskTimeDisplay, 
    playSound, 
    showToast, 
    parseLocalISOString,
    getTodayStr
} from './utils.js';
import { getTasksFromFirebase, saveTaskToFirebase } from './db.js';
import { displayTasks } from './ui.js';

// Register native notification channels and action types on Android 8+ (API 26+)
export async function registerNotificationChannels() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        const _ln = window.Capacitor.Plugins.LocalNotifications;
        try {
            await _ln.createChannel({
                id: 'flowtick-success-channel-v6',
                name: 'FlowTick Alerts',
                description: 'Task, event and habit reminders',
                importance: 5,
                sound: 'success', // Android resource raw/success without extension
                visibility: 1,
                vibration: true,
                lights: true
            });

            await _ln.createChannel({
                id: 'flowtick-pomodoro-channel-v6',
                name: 'FlowTick Pomodoro',
                description: 'Pomodoro focus and break alarm',
                importance: 5,
                sound: 'pomodoro', // Android resource raw/pomodoro without extension
                visibility: 1,
                vibration: true,
                lights: true
            });

            await _ln.createChannel({
                id: 'flowtick-timer-live-v6',
                name: 'FlowTick Live Timer',
                description: 'Silent persistent countdown timer',
                importance: 2,   // LOW — silent, stays in drawer
                visibility: 1,
                vibration: false,
                lights: false
            });

            // Register native interactive notification action groups
            await _ln.registerActionTypes({
                types: [
                    {
                        id: 'TASK_ACTIONS',
                        actions: [
                            {
                                id: 'mark_done',
                                title: 'Mark Done'
                            },
                            {
                                id: 'wont_do',
                                title: "Won't Do"
                            }
                        ]
                    },
                    {
                        id: 'TIMER_RUNNING_ACTIONS',
                        actions: [
                            {
                                id: 'timer_pause',
                                title: 'Pause'
                            },
                            {
                                id: 'timer_stop',
                                title: 'End'
                            }
                        ]
                    },
                    {
                        id: 'TIMER_PAUSED_ACTIONS',
                        actions: [
                            {
                                id: 'timer_resume',
                                title: 'Resume'
                            },
                            {
                                id: 'timer_stop',
                                title: 'End'
                            }
                        ]
                    }
                ]
            });
            console.log('[FlowTick Notifications] Native channels and action types registered');
        } catch (err) {
            console.warn('[FlowTick Notifications] Channel creation warning:', err);
        }
    }
}

// Request notification permissions for both native Android (Capacitor) and Web
export async function requestNotificationPermissions() {
    // 1. Native Capacitor on Android/iOS
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        try {
            const check = await window.Capacitor.Plugins.LocalNotifications.checkPermissions();
            if (check.display === 'granted') {
                await registerNotificationChannels();
                return true;
            }
            const request = await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
            await registerNotificationChannels();
            const granted = (request.display === 'granted');
            if (granted) {
                showToast('Notifications enabled on your device!', 'success');
            }
            return granted;
        } catch (err) {
            console.error('[FlowTick Notifications] Native permission request failed:', err);
        }
    }

    // 2. Web browser fallback
    if ("Notification" in window) {
        if (Notification.permission === 'default') {
            try {
                const perm = await Notification.requestPermission();
                return perm === 'granted';
            } catch (e) {
                return false;
            }
        }
        return Notification.permission === 'granted';
    }
    return false;
}

window.registerNotificationChannels = registerNotificationChannels;
window.requestNotificationPermissions = requestNotificationPermissions;

export async function handleCompleteTaskAction(itemId, itemType, notifTitle) {
    try {
        const tasks = await getTasksFromFirebase();
        const item = tasks.find(t => String(t.id) === String(itemId));
        if (item) {
            if (typeof window.toggleItemComplete === 'function') {
                window.toggleItemComplete(itemId, false);
            } else {
                item.isCompleted = true;
                item.completedAt = new Date().toISOString();
                await saveTaskToFirebase(item);
                displayTasks();
            }
            showToast(`"${item.title}" marked as complete!`, 'success');
        } else {
            const cleanTitle = (notifTitle || '').replace('Reminder: ', '').replace('Task Overdue: ', '').replace("It's time for: ", '');
            const taskByTitle = tasks.find(t => t.title === cleanTitle && !t.isCompleted && !t.isCancelled);
            if (taskByTitle) {
                if (typeof window.toggleItemComplete === 'function') {
                    window.toggleItemComplete(taskByTitle.id, false);
                } else {
                    taskByTitle.isCompleted = true;
                    taskByTitle.completedAt = new Date().toISOString();
                    await saveTaskToFirebase(taskByTitle);
                    displayTasks();
                }
                showToast(`"${taskByTitle.title}" marked as complete!`, 'success');
            }
        }
    } catch (e) {
        console.error('[FlowTick Notifications] Error handling complete action:', e);
    }
}

export async function handleCancelTaskAction(itemId, itemType, notifTitle) {
    try {
        const tasks = await getTasksFromFirebase();
        const item = tasks.find(t => String(t.id) === String(itemId));
        if (item) {
            if (item.type === 'habit') {
                if (typeof window.skipHabitInDetails === 'function') {
                    window.skipHabitInDetails(itemId);
                } else {
                    const todayStr = getTodayStr();
                    if (!item.skippedDates) item.skippedDates = [];
                    if (!item.skippedDates.includes(todayStr)) item.skippedDates.push(todayStr);
                    await saveTaskToFirebase(item);
                    displayTasks();
                }
                showToast(`"${item.title}" skipped for today`, 'info');
            } else {
                if (typeof window.cancelItem === 'function') {
                    window.cancelItem(itemId);
                } else {
                    item.isCancelled = true;
                    item.isCompleted = false;
                    await saveTaskToFirebase(item);
                    displayTasks();
                }
                showToast(`"${item.title}" marked as Won't Do`, 'info');
            }
        }
    } catch (e) {
        console.error('[FlowTick Notifications] Error handling cancel action:', e);
    }
}

export function initNotificationActionListeners() {
    if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.LocalNotifications) {
        return;
    }

    if (window._notifActionListenerInitialized) return;
    window._notifActionListenerInitialized = true;

    window.Capacitor.Plugins.LocalNotifications.addListener('localNotificationActionPerformed', async (action) => {
        console.log('[FlowTick Notifications] Action performed:', action);
        const actionId = action.actionId;
        const notification = action.notification || {};
        const extra = notification.extra || {};
        const itemId = extra.itemId;
        const itemType = extra.itemType || 'task';

        // Timer actions
        if (notification.id === 888888) {
            if (actionId === 'timer_pause') {
                if (typeof window.pausePomodoro === 'function') {
                    window.pausePomodoro();
                }
            } else if (actionId === 'timer_resume') {
                if (typeof window.resumePomodoro === 'function') {
                    window.resumePomodoro();
                }
            } else if (actionId === 'timer_stop') {
                if (typeof window.resetPomodoro === 'function') {
                    window.resetPomodoro();
                }
            } else if (actionId === 'tap') {
                if (typeof window.navigateToPage === 'function') {
                    window.navigateToPage('pomodoro-page', true);
                }
                if (typeof window.syncTimerWithTimePassed === 'function') {
                    window.syncTimerWithTimePassed();
                }
            }
            return;
        }

        // Task & Habit actions
        if (actionId === 'mark_done' && itemId) {
            handleCompleteTaskAction(itemId, itemType, notification.title);
        } else if (actionId === 'wont_do' && itemId) {
            handleCancelTaskAction(itemId, itemType, notification.title);
        } else if (actionId === 'tap') {
            if (itemId && typeof window.showItemDetails === 'function') {
                window.showItemDetails(itemId);
            }
        }
    });
}

window.handleCompleteTaskAction = handleCompleteTaskAction;
window.handleCancelTaskAction = handleCancelTaskAction;
window.initNotificationActionListeners = initNotificationActionListeners;

// Pre-register channels and action listeners immediately and on load
registerNotificationChannels();
initNotificationActionListeners();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        registerNotificationChannels();
        initNotificationActionListeners();
    });
} else {
    registerNotificationChannels();
    initNotificationActionListeners();
}

export function getNextOccurrenceTime(startDateStr, startTimeStr, frequency, specificDays, customNum, customUnit, relativeToNow = true) {
    let triggerTime = parseLocalISOString(startDateStr, startTimeStr || '09:00');
    if (!triggerTime) return null;

    const compareTime = relativeToNow ? new Date() : new Date(triggerTime.getTime());
    if (relativeToNow && triggerTime > compareTime) {
        return triggerTime;
    }

    let maxIterations = 1000;
    let iterations = 0;

    if (frequency === 'daily') {
        while (triggerTime <= compareTime && iterations < maxIterations) {
            triggerTime.setDate(triggerTime.getDate() + 1);
            iterations++;
        }
    } else if (frequency === 'weekly') {
        while (triggerTime <= compareTime && iterations < maxIterations) {
            triggerTime.setDate(triggerTime.getDate() + 7);
            iterations++;
        }
    } else if (frequency === 'monthly') {
        while (triggerTime <= compareTime && iterations < maxIterations) {
            triggerTime.setMonth(triggerTime.getMonth() + 1);
            iterations++;
        }
    } else if (frequency === 'yearly') {
        while (triggerTime <= compareTime && iterations < maxIterations) {
            triggerTime.setFullYear(triggerTime.getFullYear() + 1);
            iterations++;
        }
    } else if (frequency === 'custom') {
        const num = customNum || 1;
        const unit = customUnit || 'days';
        while (triggerTime <= compareTime && iterations < maxIterations) {
            if (unit === 'days') {
                triggerTime.setDate(triggerTime.getDate() + num);
            } else if (unit === 'weeks') {
                if (specificDays && specificDays.length > 0) {
                    let foundNext = false;
                    for (let dayOffset = 1; dayOffset < 365; dayOffset++) {
                        let testTime = new Date(triggerTime.getTime());
                        testTime.setDate(testTime.getDate() + dayOffset);
                        if (specificDays.includes(testTime.getDay()) && testTime > compareTime) {
                            triggerTime = testTime;
                            foundNext = true;
                            break;
                        }
                    }
                    if (!foundNext) {
                        triggerTime.setDate(triggerTime.getDate() + num * 7);
                    }
                } else {
                    triggerTime.setDate(triggerTime.getDate() + num * 7);
                }
            } else if (unit === 'months') {
                triggerTime.setMonth(triggerTime.getMonth() + num);
            } else if (unit === 'years') {
                triggerTime.setFullYear(triggerTime.getFullYear() + num);
            }
            iterations++;
        }
    } else if (specificDays && specificDays.length > 0) {
        let foundNext = false;
        for (let dayOffset = 1; dayOffset < 365; dayOffset++) {
            let testTime = new Date(triggerTime.getTime());
            testTime.setDate(testTime.getDate() + dayOffset);
            if (specificDays.includes(testTime.getDay()) && testTime > compareTime) {
                triggerTime = testTime;
                foundNext = true;
                break;
            }
        }
        if (!foundNext) {
            triggerTime.setDate(triggerTime.getDate() + 1);
        }
    }

    return triggerTime;
}

export function getMissedNotificationsKey() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const currentUserId = currentUser ? currentUser.id : 'guest';
    return `missedNotifications_${currentUserId}`;
}

export function addMissedNotification(title, time24, category = 'reminder') {
    const key = getMissedNotificationsKey();
    let list = JSON.parse(localStorage.getItem(key)) || [];
    list.unshift({
        id: Date.now(),
        title: title,
        category: category,
        time: formatTaskTimeDisplay(time24),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    localStorage.setItem(key, JSON.stringify(list));
    localStorage.setItem('notificationsSeen', 'false'); // Mark as unseen
    renderMissedNotifications();
}

export function deleteMissedNotification(id) {
    const key = getMissedNotificationsKey();
    let list = JSON.parse(localStorage.getItem(key)) || [];
    list = list.filter(n => n.id !== id);
    localStorage.setItem(key, JSON.stringify(list));
    renderMissedNotifications();
}

export function completeNotifTask(event, notifId, taskTitle) {
    if (event) event.stopPropagation();
    
    // 1. Delete from notifications list
    deleteMissedNotification(notifId);

    // 2. Complete task in Firestore
    getTasksFromFirebase().then(tasks => {
        const task = tasks.find(t => t.title === taskTitle && !t.isCompleted && !t.isCancelled);
        if (task) {
            task.isCompleted = true;
            task.completedAt = new Date().toISOString();
            saveTaskToFirebase(task).then(() => {
                showToast(`"${task.title}" marked as complete!`, 'success');
                displayTasks();
                if (window.calendarInstance) window.calendarInstance.refetchEvents();
            });
        } else {
            showToast('Task already completed or not found.', 'info');
        }
    });
}

export function cancelNotifTask(event, notifId, taskTitle) {
    if (event) event.stopPropagation();
    
    // 1. Delete from notifications list
    deleteMissedNotification(notifId);

    // 2. Cancel task in Firestore
    getTasksFromFirebase().then(tasks => {
        const task = tasks.find(t => t.title === taskTitle && !t.isCompleted && !t.isCancelled);
        if (task) {
            task.isCancelled = true;
            task.isCompleted = false;
            saveTaskToFirebase(task).then(() => {
                showToast(`"${task.title}" marked as Won't Do`, 'info');
                displayTasks();
                if (window.calendarInstance) window.calendarInstance.refetchEvents();
            });
        } else {
            showToast('Task already completed or not found.', 'info');
        }
    });
}

// Bind missed actions globally for inline dynamic HTML click handlers
window.deleteMissedNotification = deleteMissedNotification;
window.completeNotifTask = completeNotifTask;
window.cancelNotifTask = cancelNotifTask;

export function renderMissedNotifications() {
    const badge = document.getElementById('notification-badge');
    const listEl = document.getElementById('notif-list');
    if (!badge || !listEl) return;

    const key = getMissedNotificationsKey();
    const list = JSON.parse(localStorage.getItem(key)) || [];
    const isSeen = localStorage.getItem('notificationsSeen') === 'true';

    if (list.length > 0) {
        badge.textContent = list.length;
        badge.style.display = isSeen ? 'none' : 'inline-flex';
        
        let html = '';
        list.forEach(n => {
            const plainTitle = n.title.replace('Overdue: ', '').replace('Reminder: ', '');
            
            // Dynamic theme variables for circular check button
            const completeColor = n.category === 'overdue' ? '#73D13D' : 'var(--color-ticktick-blue)';
            const completeBg = n.category === 'overdue' ? 'rgba(115,209,61,0.15)' : 'rgba(47,123,246,0.1)';

            let actionButtonsHTML = `
                <div class="notif-actions" style="margin-top: 6px; display: flex; gap: 8px; align-items: center;">
                    <button class="notif-action-btn" onclick="completeNotifTask(event, ${n.id}, '${plainTitle.replace(/'/g, "\\'")}')" title="Mark Done" style="background:${completeBg}; color:${completeColor}; border:none; width: 28px; height: 28px; border-radius:50%; display: flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer; transition:0.2s;"><i class="fa-solid fa-check"></i></button>
                    <button class="notif-action-btn" onclick="cancelNotifTask(event, ${n.id}, '${plainTitle.replace(/'/g, "\\'")}')" title="Won't Do" style="background:rgba(255,77,79,0.1); color:#FF4D4F; border:none; width: 28px; height: 28px; border-radius:50%; display: flex; align-items:center; justify-content:center; font-size:12px; cursor:pointer; transition:0.2s;"><i class="fa-solid fa-ban"></i></button>
                </div>
            `;

            html += `
                <div class="notif-item" style="padding: 12px 16px; border-bottom: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 4px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
                        <div class="notif-content" style="display: flex; flex-direction: column; gap: 2px;">
                            <span class="notif-title" style="font-size: 13.5px; font-weight: 600; color: var(--text-main);">${n.title}</span>
                            <span class="notif-time" style="font-size: 11px; color: var(--text-muted);">${n.timestamp}</span>
                        </div>
                        <button class="btn-delete-notif" onclick="deleteMissedNotification(${n.id})" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size: 14px;"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    ${actionButtonsHTML}
                </div>
            `;
        });
        listEl.innerHTML = html;
    } else {
        badge.style.display = 'none';
        listEl.innerHTML = '<div class="no-notif">No missed notifications</div>';
    }
}

export function initMissedNotificationsUI() {
    const notifBtn = document.getElementById('notification-btn');
    const dropdown = document.getElementById('notification-dropdown');
    const clearBtn = document.getElementById('clear-notifications-btn');

    if (!notifBtn || !dropdown) return;

    notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');

        // Mark as seen when the dropdown is opened
        if (dropdown.classList.contains('active')) {
            localStorage.setItem('notificationsSeen', 'true');
            renderMissedNotifications();
        }

        // Request permission on bell click if not granted
        requestNotificationPermissions();
    });

    document.addEventListener('click', () => {
        dropdown.classList.remove('active');
    });

    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const key = getMissedNotificationsKey();
            localStorage.setItem(key, JSON.stringify([]));
            renderMissedNotifications();
        });
    }

    renderMissedNotifications();
}

export function scheduleMobileNotification(id, title, body, triggerTime, frequency, soundName, extraData = null, actionTypeId = null) {
    const triggerTimestamp = triggerTime instanceof Date ? triggerTime.getTime() : new Date(triggerTime).getTime();
    const now = Date.now();
    const delayMs = triggerTimestamp - now;

    // Overdue by more than 2 minutes and not recurring -> mark as missed
    if (delayMs <= -120000 && !frequency) {
        console.log(`[MobileBridge] Notification missed (${Math.abs(delayMs)}ms ago). Adding to missed list.`);
        const tDate = new Date(triggerTimestamp);
        const hours = String(tDate.getHours()).padStart(2, '0');
        const mins = String(tDate.getMinutes()).padStart(2, '0');
        addMissedNotification(`Overdue: ${title}`, `${hours}:${mins}`, 'overdue');
        return;
    }

    // Safe 32-bit positive integer ID for Android AlarmManager & NotificationManager
    let notifId = parseInt(id, 10);
    if (isNaN(notifId)) {
        notifId = Math.abs(String(id).split("").reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0));
    }
    notifId = (Math.abs(notifId) % 2000000000) + 1;

    const sound = soundName || 'success.mp3';
    const soundBase = sound.replace(/\.[^/.]+$/, "");
    const channelId = `flowtick-${soundBase}-channel-v6`;

    // Anything within 1000ms or already slightly passed is IMMEDIATE
    const isImmediate = delayMs <= 1000 && !frequency;

    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        registerNotificationChannels();

        const notifItem = {
            id: notifId,
            title: title,
            body: body,
            sound: soundBase,
            channelId: channelId,
            ongoing: false,
            autoCancel: true
        };

        if (actionTypeId) {
            notifItem.actionTypeId = actionTypeId;
        } else if (extraData && extraData.itemId) {
            notifItem.actionTypeId = 'TASK_ACTIONS';
        }

        if (extraData) {
            notifItem.extra = extraData;
        }

        if (!isImmediate) {
            const scheduleOpts = {
                at: new Date(triggerTimestamp),
                allowWhileIdle: true
            };
            if (frequency === 'daily') {
                scheduleOpts.repeats = true;
                scheduleOpts.every = 'day';
            } else if (frequency === 'weekly') {
                scheduleOpts.repeats = true;
                scheduleOpts.every = 'week';
            } else if (frequency === 'monthly') {
                scheduleOpts.repeats = true;
                scheduleOpts.every = 'month';
            } else if (frequency === 'yearly') {
                scheduleOpts.repeats = true;
                scheduleOpts.every = 'year';
            }
            notifItem.schedule = scheduleOpts;
        }

        window.Capacitor.Plugins.LocalNotifications.schedule({
            notifications: [notifItem]
        }).then(() => {
            console.log(`[MobileBridge] Scheduled #${notifId} ("${title}") ${isImmediate ? 'IMMEDIATE' : 'at ' + new Date(triggerTimestamp).toISOString()}`);
        }).catch(err => {
            console.error("[MobileBridge] Schedule error:", err);
            if (String(err).includes('not enabled') || String(err).includes('permission')) {
                requestNotificationPermissions();
            }
        });

        return;
    }

    // Web Fallback (Laptop/Browser)
    console.log(`[MobileBridge] Web fallback. Delay: ${delayMs}ms, isImmediate: ${isImmediate}`);
    if (window.Notification && Notification.permission === "default") {
        Notification.requestPermission();
    }

    if (isImmediate) {
        if (typeof playSound === 'function') {
            playSound(soundBase === 'pomodoro' ? 'pomodoro' : 'success');
        }
        if (window.Notification && Notification.permission === "granted") {
            new Notification(title, { body: body });
        } else {
            showToast(`${title}: ${body}`, 'info');
        }
    } else if (delayMs > 0) {
        setTimeout(() => {
            if (typeof playSound === 'function') {
                playSound(soundBase === 'pomodoro' ? 'pomodoro' : 'success');
            }
            if (window.Notification && Notification.permission === "granted") {
                new Notification(title, { body: body });
            } else {
                showToast(`${title}: ${body}`, 'info');
            }
        }, delayMs);
    }
}

export function updateMobileTimerNotification(isWork, timeLeft, isRunning = true, expectedEnd = null) {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        registerNotificationChannels();
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        const timeStr = `${mins}:${String(secs).padStart(2, '0')} remaining`;

        const actionTypeId = isRunning ? 'TIMER_RUNNING_ACTIONS' : 'TIMER_PAUSED_ACTIONS';
        const title = isWork 
            ? (isRunning ? '🍅 Focus Session Active' : '⏸️ Focus Session Paused')
            : (isRunning ? '☕ Break Session Active' : '⏸️ Break Session Paused');

        const notif = {
            id: 888888,
            title: title,
            body: timeStr,
            channelId: 'flowtick-timer-live-v6',
            ongoing: true, // Pinned in notification drawer
            autoCancel: false,
            actionTypeId: actionTypeId,
            extra: {
                isWorkSession: isWork,
                timeLeft: timeLeft,
                isRunning: isRunning
            }
        };

        if (isRunning && expectedEnd) {
            notif.extra.chronometer = expectedEnd;
        }

        window.Capacitor.Plugins.LocalNotifications.schedule({
            notifications: [notif]
        }).catch(err => {
            console.warn('[LiveTimer] Update notification error:', err);
        });
    }
}

export function cancelMobileNotification(id) {
    let notifId = parseInt(id, 10);
    if (isNaN(notifId)) {
        notifId = Math.abs(String(id).split("").reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0));
    }
    notifId = (Math.abs(notifId) % 2000000000) + 1;

    if (window.AndroidBridge && typeof window.AndroidBridge.cancelNotification === 'function') {
        window.AndroidBridge.cancelNotification(String(notifId));
        return;
    }
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        window.Capacitor.Plugins.LocalNotifications.cancel({
            notifications: [{ id: notifId }]
        }).catch(err => console.warn('[MobileBridge] Cancel error:', err));
        return;
    }
    if (window.cordova && window.cordova.plugins && window.cordova.plugins.notification && window.cordova.plugins.notification.local) {
        window.cordova.plugins.notification.local.cancel(notifId);
        return;
    }
}

// Bind globally for backward compatibility / external library hooks
window.scheduleMobileNotification = scheduleMobileNotification;
window.updateMobileTimerNotification = updateMobileTimerNotification;
window.cancelMobileNotification = cancelMobileNotification;

export function scheduleItemNotifications(item) {
    if (!item) return;

    // Generate clean unique numeric IDs
    const numericId = getStableNumericId(item.id);
    const dueNumericId = getStableNumericId(item.id) + 999999; 

    // Cancel old notifications to prevent duplicates (including multi-timers)
    cancelMobileNotification(numericId);
    cancelMobileNotification(dueNumericId);
    for (let i = 1; i <= 10; i++) {
        cancelMobileNotification(numericId + (i * 1000));
    }

    if (item.isCancelled || item.isDeleted) return;

    const isRepeating = (item.type === 'habit' || (item.frequency && item.frequency !== 'none'));
    if (item.isCompleted && !isRepeating) return;

    // Habit multiple reminder timers or single start time
    const habitTimers = (item.type === 'habit' && Array.isArray(item.reminderTimes) && item.reminderTimes.length > 0)
        ? item.reminderTimes
        : (item.startTime ? [item.startTime] : []);

    if (item.startDate && habitTimers.length > 0) {
        habitTimers.forEach((timeStr, idx) => {
            const subNotifId = idx === 0 ? numericId : numericId + (idx * 1000);
            let triggerTime;
            if (isRepeating) {
                const now = new Date();
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                
                const isCompletedToday = item.isCompleted || (item.completedDates && item.completedDates.includes(todayStr));
                let startFromDate = item.startDate;
                if (isCompletedToday) {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    startFromDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
                }
                triggerTime = getNextOccurrenceTime(startFromDate, timeStr, item.frequency, item.specificDays, item.customNum, item.customUnit);
            } else {
                triggerTime = parseLocalISOString(item.startDate, timeStr);
            }

            if (triggerTime && triggerTime > new Date()) {
                let notifTitle = 'Task Reminder';
                let notifBody = `It's time for: ${item.title}`;
                if (item.type === 'event') {
                    notifTitle = 'Event Reminder';
                    notifBody = `Event starting: ${item.title}`;
                } else if (item.type === 'habit') {
                    notifTitle = 'Habit Reminder';
                    notifBody = `Time for your habit: ${item.title}`;
                }

                scheduleMobileNotification(
                    subNotifId,
                    notifTitle,
                    notifBody,
                    triggerTime,
                    null,
                    'success.mp3',
                    { itemId: item.id, itemType: item.type || 'task' },
                    'TASK_ACTIONS'
                );
            }
        });
    }

    // Schedule Deadline (Due Date) if defined
    if (item.dueDate && item.dueTime) {
        const triggerTime = parseLocalISOString(item.dueDate, item.dueTime);
        if (triggerTime && triggerTime > new Date()) {
            scheduleMobileNotification(
                dueNumericId,
                'Task Overdue!',
                `The deadline for "${item.title}" has passed.`,
                triggerTime,
                null,
                'success.mp3',
                { itemId: item.id, itemType: item.type || 'task' },
                'TASK_ACTIONS'
            );
        }
    }
}

window.scheduleItemNotifications = scheduleItemNotifications;
