import { 
    getStableNumericId, 
    formatTaskTimeDisplay, 
    playSound, 
    showToast, 
    parseLocalISOString 
} from './utils.js';
import { getTasksFromFirebase, saveTaskToFirebase } from './db.js';
import { displayTasks } from './ui.js';

// Pre-register notification channels at the earliest possible moment
if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
    const _ln = window.Capacitor.Plugins.LocalNotifications;

    // Channel for tasks, habits and events (success.mp3 -> resource 'success')
    _ln.createChannel({
        id: 'flowtick-success-channel-v6',
        name: 'FlowTick Alerts',
        importance: 5,
        sound: 'success', // Android requires resource name without extension
        visibility: 1
    });

    // Channel for Pomodoro focus/break alarms (pomodoro.mp3 -> resource 'pomodoro')
    _ln.createChannel({
        id: 'flowtick-pomodoro-channel-v6',
        name: 'FlowTick Pomodoro',
        importance: 5,
        sound: 'pomodoro', // Android requires resource name without extension
        visibility: 1
    });

    // SILENT channel for the live countdown ticker
    _ln.createChannel({
        id: 'flowtick-timer-live-v6',
        name: 'FlowTick Live Timer',
        importance: 2,   // LOW — silent, stays in drawer
        visibility: 1
    });
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

        // Request permission on bell click if default
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    showToast('Notifications enabled!', 'success');
                    
                    // Register the native Android audio channel
                    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
                        window.Capacitor.Plugins.LocalNotifications.createChannel({
                            id: 'flowtick-success-channel-v6',
                            name: 'FlowTick Alerts',
                            description: 'Reminders with custom sound',
                            importance: 5,
                            sound: 'success', // Android requires resource name without extension
                            visibility: 1
                        });
                    }
                }
            });
        }
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

export function scheduleMobileNotification(id, title, body, triggerTime, frequency, soundName) {
    const delayMs = new Date(triggerTime).getTime() - Date.now();
    
    if (delayMs <= 0 && !frequency) {
        // إذا كان الميعاد قد فات منذ أقل من دقيقتين، نطلقه فوراً للمستخدم
        if (delayMs >= -120000) {
            console.log(`[MobileBridge] Notification missed recently (${Math.abs(delayMs)}ms ago). Triggering immediately.`);
            return scheduleMobileNotification(id, title, body, new Date(Date.now() + 50), frequency, soundName);
        } else {
            // إذا كان قديماً، نضيفه لقائمة الإشعارات الفائتة مباشرة
            console.log(`[MobileBridge] Notification missed. Adding to missed list.`);
            const tDate = new Date(triggerTime);
            const hours = String(tDate.getHours()).padStart(2, '0');
            const mins = String(tDate.getMinutes()).padStart(2, '0');
            addMissedNotification(`Overdue: ${title}`, `${hours}:${mins}`, 'overdue');
            return;
        }
    }

    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        const scheduleOpts = { at: new Date(triggerTime), allowWhileIdle: true };
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

        const sound = soundName || 'success.mp3';
        const soundBase = sound.replace('.mp3', '');
        const channelId = `flowtick-${soundBase}-channel-v6`;

        // تحويل أمن للـ ID لضمان أنه رقم صحيح دائماً ولا يعطي NaN
        let notifId = parseInt(id, 10);
        if (isNaN(notifId)) {
            // لو الـ ID نصي، بنعمل له Hash رقمي سريع
            notifId = Math.abs(String(id).split("").reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0));
        } else {
            notifId = Math.abs(notifId);
        }

        // جدول الإشعار مباشرة، الـ Channels متكريتة فوق أول ما الملف بيفتح
        window.Capacitor.Plugins.LocalNotifications.schedule({
            notifications: [{
                id: notifId,
                title: title,
                body: body,
                schedule: scheduleOpts,
                sound: soundBase,
                channelId: channelId,
                ongoing: false,
                autoCancel: true,
                foreground: true,
                actionTypeId: '',
                extra: null
            }]
        }).catch(err => console.error("Schedule error:", err));
        
        return;
    }

    // الـ Fallback الخاص بالمتصفح (اللاب توب)
    console.log(`[MobileBridge] Web fallback. Delay: ${delayMs}ms`);
    
    // طلب إذن الإشعارات من المتصفح لو مش مسموح بيه
    if (window.Notification && Notification.permission === "default") {
        Notification.requestPermission();
    }

    // جدولة الإشعار على المتصفح باستخدام setTimeout
    if (delayMs > 0) {
        setTimeout(() => {
            // تشغيل الصوت المبرمج في utils.js بالتزامن مع الإشعار
            if (typeof playSound === 'function') {
                playSound('success');
            }
            if (window.Notification && Notification.permission === "granted") {
                new Notification(title, { body: body });
            } else {
                // لو المتصفح حاقب الإشعارات، اظهرها كـ alert عادي للتيست
                alert(`[Notification] ${title}: ${body}`);
            }
        }, delayMs);
    }
}

export function updateMobileTimerNotification(isWork, timeLeft) {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        const timeStr = `${mins}:${String(secs).padStart(2, '0')} remaining`;

        window.Capacitor.Plugins.LocalNotifications.createChannel({
            id: 'flowtick-timer-live-v6',
            name: 'FlowTick Live Timer',
            importance: 2, // LOW - silent countdown
            visibility: 1
        }).then(() => {
            window.Capacitor.Plugins.LocalNotifications.schedule({
                notifications: [{
                    id: 888888,
                    title: isWork ? '🍅 Focus Session Active' : '☕ Break Session Active',
                    body: timeStr,
                    schedule: { at: new Date(Date.now() + 50) },
                    channelId: 'flowtick-timer-live-v6',
                    ongoing: true,
                    autoCancel: false,
                    foreground: true
                }]
            });
        });
    }
}

export function cancelMobileNotification(id) {
    if (window.AndroidBridge && typeof window.AndroidBridge.cancelNotification === 'function') {
        window.AndroidBridge.cancelNotification(String(id));
        return;
    }
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        window.Capacitor.Plugins.LocalNotifications.cancel({
            notifications: [{ id: Math.abs(parseInt(id)) || 0 }]
        });
        return;
    }
    if (window.cordova && window.cordova.plugins && window.cordova.plugins.notification && window.cordova.plugins.notification.local) {
        window.cordova.plugins.notification.local.cancel(Math.abs(parseInt(id)) || 0);
        return;
    }
}

// Bind globally for backward compatibility / external library hooks
window.scheduleMobileNotification = scheduleMobileNotification;
window.updateMobileTimerNotification = updateMobileTimerNotification;
window.cancelMobileNotification = cancelMobileNotification;

export function scheduleItemNotifications(item) {
    if (!item) return;

    // توليد IDs رقمية فريدة ونظيفة
    const numericId = getStableNumericId(item.id);
    // لضمان أن الـ Due ID رقمي تماماً ولا يحتوي على نصوص تسبب NaN
    const dueNumericId = getStableNumericId(item.id) + 999999; 

    // إلغاء الإشعارات القديمة لمنع التكرار
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
        window.Capacitor.Plugins.LocalNotifications.cancel({
            notifications: [{ id: numericId }, { id: dueNumericId }]
        });
    }

    if (item.isCancelled || item.isDeleted) return;

    const isRepeating = (item.type === 'habit' || (item.frequency && item.frequency !== 'none'));
    if (item.isCompleted && !isRepeating) return;

    if (item.startDate && item.startTime) {
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
            triggerTime = getNextOccurrenceTime(startFromDate, item.startTime, item.frequency, item.specificDays, item.customNum, item.customUnit);
        } else {
            triggerTime = parseLocalISOString(item.startDate, item.startTime);
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

            // جدولة التكرار القادم فوراً (مرة واحدة فقط وبشكل صحيح)
            scheduleMobileNotification(
                numericId,
                notifTitle,
                notifBody,
                triggerTime,
                null,
                'success.mp3'
            );
        }
    }

    // جدولة الـ Deadline (Due Date) لو موجود
    if (item.dueDate && item.dueTime) {
        const triggerTime = parseLocalISOString(item.dueDate, item.dueTime);
        if (triggerTime && triggerTime > new Date()) {
            scheduleMobileNotification(
                dueNumericId,
                'Task Overdue!',
                `The deadline for "${item.title}" has passed.`,
                triggerTime,
                null,
                'success.mp3'
            );
        }
    }
}

window.scheduleItemNotifications = scheduleItemNotifications;
