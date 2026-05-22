let db = null;
const DB_NAME = 'ProductivityAppDB';
const DB_VERSION = 1;

let sessionMinutes = 25;
let timeLeft = 25 * 60;
let timerInterval = null;
let isRunning = false;
let isWorkSession = true;
const ARC_LENGTH = 471.24; 

let tempSubtasks = [];

// ==========================================
// Formatter: 24h to 12h (AM/PM)
// ==========================================
function formatTime12h(time24) {
    if (!time24) return '';
    const [hourStr, min] = time24.split(':');
    let hour = parseInt(hourStr, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return `${hour}:${min} ${ampm}`;
}

const audioFiles = {
    check: new Audio('sounds/check.mp3'),
    success: new Audio('sounds/success.mp3'),
    delete: new Audio('sounds/delete.mp3'),
    pomodoro: new Audio('sounds/pomodoro.mp3'),
    error: new Audio('sounds/delete.mp3') 
};

function playSound(type) {
    if (audioFiles[type]) {
        const soundClone = audioFiles[type].cloneNode();
        soundClone.volume = 0.7; 
        soundClone.play().catch(e => console.log("Audio play blocked:", e));
    }
}

function showToast(message, type = 'success', playAudio = true) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-check' : type === 'error' ? 'fa-xmark' : 'fa-info';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;
    container.appendChild(toast);
    
    if (playAudio) {
        if (type === 'success') playSound('success');
        else if (type === 'error') playSound('error');
    }

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showConfirm(message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-message');
    const yesBtn = document.getElementById('confirm-yes');
    const noBtn = document.getElementById('confirm-no');
    
    msgEl.textContent = message;
    modal.classList.add('active');
    playSound('error'); 

    const handleYes = () => { cleanup(); onConfirm(); };
    const handleNo = () => { cleanup(); };
    
    const cleanup = () => {
        modal.classList.remove('active');
        yesBtn.removeEventListener('click', handleYes);
        noBtn.removeEventListener('click', handleNo);
    };

    yesBtn.addEventListener('click', handleYes);
    noBtn.addEventListener('click', handleNo);
}

document.addEventListener('click', (e) => {
    // Close all Custom Dropdowns
    if (!e.target.closest('.custom-select-wrapper')) {
        document.querySelectorAll('.custom-select-options.show').forEach(el => el.classList.remove('show'));
        document.querySelectorAll('.custom-select-wrapper.open').forEach(el => el.classList.remove('open'));
    }
    // Close Kebab menus and restore column scrollable overflow
    document.querySelectorAll('.task-dropdown.show').forEach(el => {
        el.classList.remove('show');
        const col = el.closest('.kanban-column');
        if (col) col.style.overflow = '';
    });
});

// ==========================================
// Custom Select dropdown helper
// ==========================================
function initCustomSelect(wrapperId, onChangeCallback) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return null;

    const display = wrapper.querySelector('.custom-select-display');
    const optionsDiv = wrapper.querySelector('.custom-select-options');
    const hiddenInput = wrapper.querySelector('input[type="hidden"]');

    if (!display || !optionsDiv || !hiddenInput) return null;

    // Toggle display
    display.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Close all other dropdowns
        document.querySelectorAll('.custom-select-options.show').forEach(el => {
            if (el !== optionsDiv) el.classList.remove('show');
        });
        document.querySelectorAll('.custom-select-wrapper.open').forEach(el => {
            if (el !== wrapper) el.classList.remove('open');
        });

        optionsDiv.classList.toggle('show');
        wrapper.classList.toggle('open');
    });

    // Handle options selection (delegation)
    optionsDiv.addEventListener('click', (e) => {
        const option = e.target.closest('.custom-select-option');
        if (!option) return;
        
        e.stopPropagation();
        const value = option.getAttribute('data-value');
        hiddenInput.value = value;

        // Keep content formatting (like flags) if it has HTML, else text
        display.innerHTML = `${option.innerHTML} <i class="fa-solid fa-chevron-down caret-icon"></i>`;

        optionsDiv.classList.remove('show');
        wrapper.classList.remove('open');

        // Trigger change event/callbacks
        if (onChangeCallback) {
            onChangeCallback(value);
        }
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    return {
        setValue(value, customText = null) {
            hiddenInput.value = value;
            if (customText) {
                display.innerHTML = `${customText} <i class="fa-solid fa-chevron-down caret-icon"></i>`;
                return;
            }
            // Find option matching value
            const opt = optionsDiv.querySelector(`.custom-select-option[data-value="${value}"]`);
            if (opt) {
                display.innerHTML = `${opt.innerHTML} <i class="fa-solid fa-chevron-down caret-icon"></i>`;
            } else {
                // If not found in static list (e.g. dynamic pomodoro task items)
                display.innerHTML = `${value || 'No specific task'} <i class="fa-solid fa-chevron-down caret-icon"></i>`;
            }
        },
        getValue() {
            return hiddenInput.value;
        }
    };
}

// ==========================================
// Custom 12h Time Picker component helper
// ==========================================
function initCustomTimePicker(id, isOptional = true) {
    const container = document.getElementById(id);
    if (!container) return null;
    
    const hourDisplay = container.querySelector('.time-hour-display');
    const hourOptions = container.querySelector('.time-hour-options');
    const hourInput = container.querySelector('.time-hour-input');

    const minuteDisplay = container.querySelector('.time-minute-display');
    const minuteOptions = container.querySelector('.time-minute-options');
    const minuteInput = container.querySelector('.time-minute-input');

    const ampmDisplay = container.querySelector('.time-ampm-display');
    const ampmOptions = container.querySelector('.time-ampm-options');
    const ampmInput = container.querySelector('.time-ampm-input');
    const ampmWrapper = container.querySelector('.time-ampm-wrapper');

    function getTimeFormat() {
        return localStorage.getItem('timeFormat') || '12h';
    }

    function rebuildOptions() {
        const is24h = (getTimeFormat() === '24h');
        
        if (ampmWrapper) {
            ampmWrapper.style.display = is24h ? 'none' : 'block';
        }

        let hoursHTML = isOptional ? '<div class="custom-select-option" data-value="">--</div>' : '';
        const maxH = is24h ? 23 : 12;
        const minH = is24h ? 0 : 1;
        for (let h = minH; h <= maxH; h++) {
            const hVal = is24h ? String(h).padStart(2, '0') : String(h);
            hoursHTML += `<div class="custom-select-option" data-value="${hVal}">${hVal}</div>`;
        }
        hourOptions.innerHTML = hoursHTML;

        let minutesHTML = isOptional ? '<div class="custom-select-option" data-value="">--</div>' : '';
        for (let m = 0; m < 60; m++) {
            const val = String(m).padStart(2, '0');
            minutesHTML += `<div class="custom-select-option" data-value="${val}">${val}</div>`;
        }
        minuteOptions.innerHTML = minutesHTML;

        if (!is24h) {
            let ampmHTML = isOptional ? '<div class="custom-select-option" data-value="">--</div>' : '';
            ampmHTML += '<div class="custom-select-option" data-value="AM">AM</div>';
            ampmHTML += '<div class="custom-select-option" data-value="PM">PM</div>';
            ampmOptions.innerHTML = ampmHTML;
        } else {
            if (ampmOptions) ampmOptions.innerHTML = '';
        }
    }

    rebuildOptions();

    function setValue(hour, minute, ampm) {
        const is24h = (getTimeFormat() === '24h');
        
        hourInput.value = hour !== undefined && hour !== null ? String(hour) : '';
        hourDisplay.innerHTML = `${hourInput.value || '--'} <i class="fa-solid fa-chevron-down caret-icon"></i>`;

        minuteInput.value = minute !== undefined && minute !== null ? String(minute).padStart(2, '0') : '';
        minuteDisplay.innerHTML = `${minuteInput.value || '--'} <i class="fa-solid fa-chevron-down caret-icon"></i>`;

        if (!is24h && ampmInput) {
            ampmInput.value = ampm || '';
            ampmDisplay.innerHTML = `${ampm || '--'} <i class="fa-solid fa-chevron-down caret-icon"></i>`;
        } else if (ampmInput) {
            ampmInput.value = '';
            ampmDisplay.innerHTML = '';
        }
    }

    [hourDisplay, minuteDisplay, ampmDisplay].forEach((display) => {
        if (!display) return;
        display.addEventListener('click', (e) => {
            e.stopPropagation();
            const wrapper = display.parentElement;
            const options = wrapper.querySelector('.custom-select-options');
            
            document.querySelectorAll('.custom-select-options.show').forEach(el => {
                if (el !== options) el.classList.remove('show');
            });
            document.querySelectorAll('.custom-select-wrapper.open').forEach(el => {
                if (el !== wrapper) el.classList.remove('open');
            });

            options.classList.toggle('show');
            wrapper.classList.toggle('open');
        });
    });

    container.querySelectorAll('.custom-select-options').forEach(optionsDiv => {
        optionsDiv.addEventListener('click', (e) => {
            const opt = e.target.closest('.custom-select-option');
            if (!opt) return;
            e.stopPropagation();

            const wrapper = optionsDiv.parentElement;
            const display = wrapper.querySelector('.custom-select-display');
            const input = wrapper.querySelector('input[type="hidden"]');
            const val = opt.getAttribute('data-value');

            input.value = val;
            display.innerHTML = `${opt.textContent} <i class="fa-solid fa-chevron-down caret-icon"></i>`;
            
            optionsDiv.classList.remove('show');
            wrapper.classList.remove('open');

            if (val === '') {
                setValue('', '', '');
            } else {
                const is24h = (getTimeFormat() === '24h');
                if (!is24h) {
                    if (wrapper.classList.contains('time-hour-wrapper') && ampmInput && !ampmInput.value) {
                        ampmInput.value = 'AM';
                        ampmDisplay.innerHTML = `AM <i class="fa-solid fa-chevron-down caret-icon"></i>`;
                    }
                    if (wrapper.classList.contains('time-minute-wrapper') && ampmInput && !ampmInput.value) {
                        ampmInput.value = 'AM';
                        ampmDisplay.innerHTML = `AM <i class="fa-solid fa-chevron-down caret-icon"></i>`;
                    }
                }
            }
        });
    });

    return {
        getValue() {
            const is24h = (getTimeFormat() === '24h');
            const h = hourInput.value;
            const m = minuteInput.value;
            if (!h || !m) return '';
            
            if (is24h) {
                return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            } else {
                const ap = ampmInput ? ampmInput.value : '';
                if (!ap) return '';
                let hour = parseInt(h, 10);
                if (ap === 'PM' && hour < 12) hour += 12;
                if (ap === 'AM' && hour === 12) hour = 0;
                return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            }
        },
        setValue24h(time24) {
            if (!time24) {
                setValue('', '', '');
                return;
            }
            const is24h = (getTimeFormat() === '24h');
            const [hStr, mStr] = time24.split(':');
            let hour = parseInt(hStr, 10);
            
            if (is24h) {
                setValue(String(hour).padStart(2, '0'), mStr, '');
            } else {
                let ampm = 'AM';
                if (hour >= 12) {
                    ampm = 'PM';
                    if (hour > 12) hour -= 12;
                }
                if (hour === 0) hour = 12;
                setValue(hour, mStr, ampm);
            }
        },
        refresh() {
            rebuildOptions();
            setValue('', '', '');
        }
    };
}

window.toggleTaskDropdown = function(event, id) {
    event.stopPropagation();
    
    // Close other dropdowns and restore their column overflows
    document.querySelectorAll('.task-dropdown.show').forEach(el => {
        if (el.id !== `dropdown-${id}`) {
            el.classList.remove('show');
            const oldCol = el.closest('.kanban-column');
            if (oldCol) oldCol.style.overflow = '';
        }
    });

    const dropdown = document.getElementById(`dropdown-${id}`);
    if (dropdown) {
        const column = dropdown.closest('.kanban-column');
        dropdown.classList.toggle('show');
        
        if (dropdown.classList.contains('show')) {
            // Set column overflow to visible so dropdown is never cut off by it!
            if (column) column.style.overflow = 'visible';
            
            // Dynamically open upward if close to the bottom of the column/screen to prevent clipping
            const rect = dropdown.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow < 150) {
                dropdown.style.bottom = '100%';
                dropdown.style.top = 'auto';
                dropdown.style.marginTop = '0';
                dropdown.style.marginBottom = '5px';
            } else {
                dropdown.style.bottom = 'auto';
                dropdown.style.top = '100%';
                dropdown.style.marginTop = '5px';
                dropdown.style.marginBottom = '0';
            }
        } else {
            // Restore normal scrollable column overflow
            if (column) column.style.overflow = '';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initAuth(); 
    initThemeToggle();
    initSidebar();
    initRouter();
    initDatabase();

    // Initialize premium custom dropdowns and pickers
    window.customPrioritySelect = initCustomSelect('priority-wrapper');
    window.customFrequencySelect = initCustomSelect('frequency-wrapper', (val) => {
        const isCustom = (val === 'custom');
        document.getElementById('custom-freq-row').style.display = isCustom ? 'block' : 'none';
        if (isCustom) {
            const unit = document.getElementById('custom-freq-unit').value || 'days';
            document.getElementById('specific-days-row').style.display = (unit === 'weeks') ? 'block' : 'none';
        } else {
            document.getElementById('specific-days-row').style.display = 'none';
        }
    });
    window.customFreqUnitSelect = initCustomSelect('custom-freq-unit-wrapper', (unit) => {
        const freq = document.getElementById('item-frequency').value;
        if (freq === 'custom') {
            document.getElementById('specific-days-row').style.display = (unit === 'weeks') ? 'block' : 'none';
        } else {
            document.getElementById('specific-days-row').style.display = 'none';
        }
    });
    window.customPomodoroTaskSelect = initCustomSelect('pomodoro-task-wrapper', (val) => {
        const doneBtn = document.getElementById('pomodoro-mark-done');
        if (doneBtn) doneBtn.style.display = val ? 'block' : 'none';
    });

    window.timePickerStart = initCustomTimePicker('time-picker-start', true);
    window.timePickerEnd = initCustomTimePicker('time-picker-end', true);
    window.timePickerDue = initCustomTimePicker('time-picker-due', true);

    initPomodoroDrag();
    initModalLogic();
    initSettings();
    initOfflineNotifications(); 
    initMissedNotificationsUI(); 

    // Live Dynamic Dashboard Categorizer ticker running every 1 second for absolute real-time updating
    setInterval(() => {
        if (window.sortAndRenderDashboard && window.checkIfDashboardNeedsUpdate && window.checkIfDashboardNeedsUpdate()) {
            window.sortAndRenderDashboard();
        }
    }, 1000);
});

// ==========================================
// NEW: Instant Notification Engine
// ==========================================
function parseLocalISOString(dateStr, timeStr) {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min] = (timeStr || '00:00').split(':').map(Number);
    return new Date(y, m - 1, d, h, min, 0);
}

function checkIfDashboardNeedsUpdate() {
    if (!window.activeTasksList || window.activeTasksList.length === 0) return false;
    
    const now = new Date();
    let fingerprint = "";
    
    window.activeTasksList.forEach(item => {
        let startInstant = null;
        if (item.startDate) {
            startInstant = parseLocalISOString(item.startDate, item.startTime || '00:00');
        } else {
            startInstant = new Date();
        }

        let dueInstant = null;
        if (item.dueDate) {
            dueInstant = parseLocalISOString(item.dueDate, item.dueTime || '23:59');
        }

        let cat = "current";
        if (dueInstant && dueInstant < now) {
            cat = "overdue";
        } else if (startInstant > now) {
            cat = "upcoming";
        }
        
        fingerprint += `${item.id}:${cat}|`;
    });
    
    if (window.lastDashboardFingerprint !== fingerprint) {
        window.lastDashboardFingerprint = fingerprint;
        return true;
    }
    return false;
}
window.checkIfDashboardNeedsUpdate = checkIfDashboardNeedsUpdate;

function initOfflineNotifications() {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    // Checking every 1 second for absolute real-time reminders and notifications
    setInterval(() => {
        if(!db) return;
        
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const currentDate = `${year}-${month}-${day}`;
        const currentHour = String(now.getHours()).padStart(2, '0');
        const currentMinute = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${currentHour}:${currentMinute}`;
        const currentDayOfWeek = now.getDay(); // 0 (Sun) - 6 (Sat)

        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        const currentUserId = currentUser ? currentUser.id : 'guest';

        const tx = db.transaction(['tasks'], 'readwrite');
        const store = tx.objectStore('tasks');
        
        store.getAll().onsuccess = (e) => {
            const items = e.target.result.filter(item => 
                item.userId === currentUserId && 
                !item.isCompleted && 
                !item.isCancelled
            );
            
            items.forEach(item => {
                // 1. Check if the task is overdue (if due date/time has passed and we haven't notified the user yet)
                let dueInstant = null;
                if (item.dueDate) {
                    dueInstant = parseLocalISOString(item.dueDate, item.dueTime || '23:59');
                }
                if (dueInstant && dueInstant < now && !item.lastNotifiedOverdue) {
                    item.lastNotifiedOverdue = true;
                    store.put(item);

                    // Fire instantly without delay
                    showToast(`Overdue: ${item.title}`, 'error', true);
                    playSound('error');

                    if ("Notification" in window && Notification.permission === "granted") {
                        new Notification("Task Overdue!", {
                            body: `The deadline for "${item.title}" has passed.`
                        });
                    }

                    // Add to missed notifications queue
                    addMissedNotification(`Overdue: ${item.title}`, item.dueTime || '23:59', 'overdue');
                }

                // 2. Regular startTime schedule reminders check
                if (item.startTime !== currentTime) return; // Not the right minute
                if (item.lastNotifiedDate === currentDate) return; // Already notified today

                let shouldNotify = false;

                if (item.type === 'task') {
                    if (item.startDate === currentDate) shouldNotify = true;
                    // Check repeats
                    else if (item.frequency === 'daily') shouldNotify = true;
                    else if (item.frequency === 'specific_days' && item.specificDays && item.specificDays.includes(currentDayOfWeek)) shouldNotify = true;
                } else if (item.type === 'habit') {
                    if (item.frequency === 'daily') shouldNotify = true;
                    else if (item.frequency === 'specific_days' && item.specificDays && item.specificDays.includes(currentDayOfWeek)) shouldNotify = true;
                }

                if (shouldNotify) {
                    // Write to IndexedDB instantly to prevent duplicate reminders in subsequent checks
                    item.lastNotifiedDate = currentDate;
                    store.put(item);

                    // Fire instantly without delay
                    showToast(`Reminder: ${item.title}`, 'info', true);
                    playSound('success');

                    if ("Notification" in window && Notification.permission === "granted") {
                        new Notification("Task Reminder", {
                            body: `It's time for: ${item.title}`
                        });
                    }

                    // Add to missed notifications queue
                    addMissedNotification(item.title, item.startTime, 'reminder');
                }
            });
        };
    }, 1000); // 1 second
}

// ==========================================
// NEW: Missed Notifications Manager
// ==========================================
function getMissedNotificationsKey() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const currentUserId = currentUser ? currentUser.id : 'guest';
    return `missedNotifications_${currentUserId}`;
}

function addMissedNotification(title, time24, category = 'reminder') {
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

window.deleteMissedNotification = function(id) {
    const key = getMissedNotificationsKey();
    let list = JSON.parse(localStorage.getItem(key)) || [];
    list = list.filter(n => n.id !== id);
    localStorage.setItem(key, JSON.stringify(list));
    renderMissedNotifications();
};

window.completeNotifTask = function(event, notifId, taskTitle) {
    if (event) event.stopPropagation();
    
    // 1. Delete from notifications list
    deleteMissedNotification(notifId);

    // 2. Complete task in db
    if (!db) return;
    const tx = db.transaction(['tasks'], 'readwrite');
    const store = tx.objectStore('tasks');
    store.getAll().onsuccess = (e) => {
        const tasks = e.target.result;
        const task = tasks.find(t => t.title === taskTitle && !t.isCompleted && !t.isCancelled);
        if (task) {
            task.isCompleted = true;
            task.completedAt = new Date().toISOString();
            store.put(task).onsuccess = () => {
                showToast(`"${task.title}" marked as complete!`, 'success');
                displayTasks();
                if (window.calendarInstance) window.calendarInstance.refetchEvents();
            };
        } else {
            showToast('Task already completed or not found.', 'info');
        }
    };
};

window.cancelNotifTask = function(event, notifId, taskTitle) {
    if (event) event.stopPropagation();
    
    // 1. Delete from notifications list
    deleteMissedNotification(notifId);

    // 2. Cancel task in db
    if (!db) return;
    const tx = db.transaction(['tasks'], 'readwrite');
    const store = tx.objectStore('tasks');
    store.getAll().onsuccess = (e) => {
        const tasks = e.target.result;
        const task = tasks.find(t => t.title === taskTitle && !t.isCompleted && !t.isCancelled);
        if (task) {
            task.isCancelled = true;
            task.isCompleted = false;
            store.put(task).onsuccess = () => {
                showToast(`"${task.title}" marked as Won't Do`, 'info');
                displayTasks();
                if (window.calendarInstance) window.calendarInstance.refetchEvents();
            };
        } else {
            showToast('Task already completed or not found.', 'info');
        }
    };
};

function renderMissedNotifications() {
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

function initMissedNotificationsUI() {
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

function initAuth() {
    const authScreen = document.getElementById('auth-screen');
    const appScreen = document.getElementById('app-screen');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const logoutBtn = document.getElementById('logout-btn');

    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (currentUser) {
        authScreen.style.display = 'none';
        appScreen.style.display = 'flex';
        document.getElementById('display-username').textContent = currentUser.name;
        const dTitle = document.getElementById('dashboard-title');
        if (dTitle) {
            dTitle.textContent = `Hello, ${currentUser.name}`;
        }
    } else {
        authScreen.style.display = 'flex';
        appScreen.style.display = 'none';
    }

    window.toggleAuth = function(type) {
        if (type === 'signup') {
            loginForm.style.display = 'none';
            signupForm.style.display = 'block';
        } else {
            loginForm.style.display = 'block';
            signupForm.style.display = 'none';
        }
    };

    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;

        let users = JSON.parse(localStorage.getItem('users')) || [];
        if (users.find(u => u.email === email)) {
            showToast('Email already exists! Please log in.', 'error');
            return;
        }

        const newUser = { id: Date.now(), name, email, password };
        users.push(newUser);
        localStorage.setItem('users', JSON.stringify(users));
        localStorage.setItem('currentUser', JSON.stringify(newUser));
        window.location.reload(); 
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        let users = JSON.parse(localStorage.getItem('users')) || [];
        const user = users.find(u => u.email === email && u.password === password);

        if (user) {
            localStorage.setItem('currentUser', JSON.stringify(user));
            window.location.reload();
        } else {
            showToast('Invalid email or password!', 'error');
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('currentUser');
        window.location.reload();
    });
}

function initSidebar() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const menuItems = document.querySelectorAll('.menu-item');

    function toggleSidebar() { sidebar.classList.toggle('active'); overlay.classList.toggle('active'); }
    function closeSidebar() { sidebar.classList.remove('active'); overlay.classList.remove('active'); }

    hamburgerBtn.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', closeSidebar);
    menuItems.forEach(item => item.addEventListener('click', closeSidebar));
}

function initThemeToggle() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (!toggleBtn) return;
    
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
        toggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
        toggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }

    toggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        if (document.body.classList.contains('dark-theme')) {
            localStorage.setItem('theme', 'dark');
            toggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        } else {
            localStorage.setItem('theme', 'light');
            toggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        }
    });
}

function initRouter() {
    const menuItems = document.querySelectorAll('.menu-item');
    const pages = document.querySelectorAll('.page-section');

    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            menuItems.forEach(i => i.classList.remove('active'));
            pages.forEach(p => p.classList.remove('active'));

            item.classList.add('active');
            const targetPage = item.getAttribute('data-target');
            document.getElementById(targetPage).classList.add('active');

            if(targetPage === 'calendar-page' && window.calendarInstance) {
                setTimeout(() => window.calendarInstance.updateSize(), 100);
            }
        });
    });
}

function initSettings() {
    const form = document.getElementById('settings-form');
    const passForm = document.getElementById('password-form');
    const nameInput = document.getElementById('settings-name');
    const emailInput = document.getElementById('settings-email');
    const clearBtn = document.getElementById('clear-data-btn');
    
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser || !form) return;

    nameInput.value = currentUser.name;
    emailInput.value = currentUser.email;

    // Calendar/App Preferences initialization
    const showTasksCb = document.getElementById('pref-show-tasks');
    const showEventsCb = document.getElementById('pref-show-events');
    const showHabitsCb = document.getElementById('pref-show-habits');

    if (showTasksCb && showEventsCb && showHabitsCb) {
        let prefs = JSON.parse(localStorage.getItem('calendarPreferences')) || {
            showTasks: true,
            showEvents: true,
            showHabits: true
        };

        showTasksCb.checked = prefs.showTasks;
        showEventsCb.checked = prefs.showEvents;
        showHabitsCb.checked = prefs.showHabits;

        [showTasksCb, showEventsCb, showHabitsCb].forEach(cb => {
            cb.addEventListener('change', () => {
                prefs.showTasks = showTasksCb.checked;
                prefs.showEvents = showEventsCb.checked;
                prefs.showHabits = showHabitsCb.checked;
                localStorage.setItem('calendarPreferences', JSON.stringify(prefs));

                if (window.calendarInstance) {
                    window.calendarInstance.refetchEvents();
                }
            });
        });

        // Initialize Time Format Preference Selector
        const timeFormat = localStorage.getItem('timeFormat') || '12h';
        window.customTimeFormatSelect = initCustomSelect('pref-time-format-wrapper', (val) => {
            localStorage.setItem('timeFormat', val);
            if (window.timePickerStart) window.timePickerStart.refresh();
            if (window.timePickerEnd) window.timePickerEnd.refresh();
            if (window.timePickerDue) window.timePickerDue.refresh();
            displayTasks();
            if (window.calendarInstance) window.calendarInstance.refetchEvents();
        });
        window.customTimeFormatSelect.setValue(timeFormat, timeFormat === '24h' ? '24-Hour Format' : '12-Hour (AM/PM)');

        // Initialize Dashboard View Preference Selector
        const dashboardLayout = localStorage.getItem('dashboardLayout') || 'list';
        window.customDashboardLayoutSelect = initCustomSelect('pref-dashboard-layout-wrapper', (val) => {
            localStorage.setItem('dashboardLayout', val);
            displayTasks();
        });
        window.customDashboardLayoutSelect.setValue(dashboardLayout, dashboardLayout === 'kanban' ? 'Kanban Board' : 'Standard List');
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        currentUser.name = nameInput.value;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        let users = JSON.parse(localStorage.getItem('users')) || [];
        let index = users.findIndex(u => u.email === currentUser.email);
        if (index > -1) {
            users[index].name = currentUser.name;
            localStorage.setItem('users', JSON.stringify(users));
        }

        document.getElementById('display-username').textContent = currentUser.name;
        showToast('Profile updated successfully!', 'success', false); 
    });

    passForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const currentPass = document.getElementById('current-password').value;
        const newPass = document.getElementById('new-password').value;

        if (currentPass !== currentUser.password) {
            showToast('Current password incorrect!', 'error');
            return;
        }

        currentUser.password = newPass;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        let users = JSON.parse(localStorage.getItem('users')) || [];
        let index = users.findIndex(u => u.email === currentUser.email);
        if (index > -1) {
            users[index].password = newPass;
            localStorage.setItem('users', JSON.stringify(users));
        }

        passForm.reset();
        showToast('Password updated securely!', 'success');
    });

    clearBtn.addEventListener('click', () => {
        showConfirm('This will permanently delete all your tasks, habits, and events from this device. Are you sure?', () => {
            const req = indexedDB.deleteDatabase(DB_NAME);
            req.onsuccess = () => {
                setTimeout(()=> window.location.reload(), 500);
            };
        });
    });
}

function renderTempSubtasks() {
    const list = document.getElementById('subtasks-list');
    list.innerHTML = '';
    tempSubtasks.forEach((sub, idx) => {
        list.innerHTML += `
            <li style="display:flex; justify-content:space-between; align-items:center; background: var(--item-bg); padding:8px 12px; border: 1px solid var(--border-color); border-radius:8px; font-size:13px;">
                <span style="${sub.completed ? 'text-decoration:line-through; opacity:0.6;' : ''}">${sub.title}</span>
                <i class="fa-solid fa-trash" style="cursor:pointer; color:#FF4D4F; padding:4px;" onclick="removeTempSubtask(${idx})"></i>
            </li>`;
    });
}

window.removeTempSubtask = function(idx) {
    tempSubtasks.splice(idx, 1);
    renderTempSubtasks();
};

function initModalLogic() {
    const modal = document.getElementById('task-modal');
    const openBtns = document.querySelectorAll('.open-modal-btn');
    const closeBtn = document.getElementById('close-modal');
    const customFreqRow = document.getElementById('custom-freq-row');
    const specificDaysRow = document.getElementById('specific-days-row');
    const modalDelBtn = document.getElementById('modal-delete-btn');
    const addSubBtn = document.getElementById('add-subtask-btn');
    const subInput = document.getElementById('subtask-input');

    if (!modal) return;

    addSubBtn.addEventListener('click', () => {
        if(subInput.value.trim()) {
            tempSubtasks.push({ title: subInput.value.trim(), completed: false });
            subInput.value = '';
            renderTempSubtasks();
        }
    });
    subInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') { e.preventDefault(); addSubBtn.click(); }
    });

    openBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('task-form').reset();
            document.getElementById('edit-item-id').value = ''; 
            document.getElementById('submit-btn').textContent = 'Save Details';
            modalDelBtn.style.display = 'none'; 
            customFreqRow.style.display = 'none';
            specificDaysRow.style.display = 'none';
            
            // Clear description
            document.getElementById('item-description').value = '';

            // Reset premium custom dropdowns
            if (window.customPrioritySelect) {
                window.customPrioritySelect.setValue('medium', '<i class="fa-solid fa-flag" style="color: #FFA940;"></i> Medium');
            }
            if (window.customFrequencySelect) {
                window.customFrequencySelect.setValue('none', 'No Repeat');
            }
            if (window.customFreqUnitSelect) {
                window.customFreqUnitSelect.setValue('days', 'Days');
            }
            if (window.timePickerStart) {
                window.timePickerStart.setValue24h('');
            }
            if (window.timePickerEnd) {
                window.timePickerEnd.setValue24h('');
            }
            if (window.timePickerDue) {
                window.timePickerDue.setValue24h('');
            }

            // Reset specific days
            document.querySelectorAll('.day-toggle input').forEach(cb => cb.checked = false);

            tempSubtasks = [];
            renderTempSubtasks();
            
            const type = btn.getAttribute('data-type'); 
            openModalUI(type);
        });
    });

    if(closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    modalDelBtn.addEventListener('click', () => {
        const id = document.getElementById('edit-item-id').value;
        if(id) {
            showConfirm('Are you sure you want to delete this?', () => {
                db.transaction(['tasks'], 'readwrite').objectStore('tasks').delete(parseInt(id)).onsuccess = () => {
                    showToast('Deleted successfully', 'success', false); 
                    modal.classList.remove('active');
                    displayTasks();
                    if(window.calendarInstance) window.calendarInstance.refetchEvents();
                };
            });
        }
    });

    initFormSubmit(modal);
}

function openModalUI(type) {
    const modal = document.getElementById('task-modal');
    const modalTitle = document.getElementById('modal-title');
    const itemTypeInput = document.getElementById('item-type');
    const startDateRow = document.getElementById('start-date-row');
    const taskDetailsRow = document.getElementById('task-details-row');
    const deadlineContainer = document.getElementById('deadline-container');
    const eventOnlyElements = document.querySelectorAll('.id-event-only');
    const taskOnlyElements = document.querySelectorAll('.id-task-only');
    const labelTimeStart = document.getElementById('label-time-start');

    itemTypeInput.value = type;
    
    if(!document.getElementById('task-start-date').value) {
        document.getElementById('task-start-date').value = new Date().toISOString().split('T')[0];
    }

    if (type === 'task') {
        modalTitle.innerHTML = '<i class="fa-solid fa-list-check"></i> Task Details';
        labelTimeStart.textContent = 'Time (Optional)';
        startDateRow.style.display = 'flex';
        taskDetailsRow.style.display = 'flex';
        deadlineContainer.style.display = 'block';
        eventOnlyElements.forEach(el => el.style.display = 'none');
        taskOnlyElements.forEach(el => el.style.display = 'block');
    } else if (type === 'event') {
        modalTitle.innerHTML = '<i class="fa-solid fa-calendar-plus"></i> Event Details';
        labelTimeStart.textContent = 'Start Time';
        startDateRow.style.display = 'flex';
        taskDetailsRow.style.display = 'flex'; 
        deadlineContainer.style.display = 'none';
        eventOnlyElements.forEach(el => el.style.display = 'block');
        taskOnlyElements.forEach(el => el.style.display = 'none');
        
        if(!document.getElementById('event-end-date').value) {
            document.getElementById('event-end-date').value = new Date().toISOString().split('T')[0];
        }
    } else if (type === 'habit') {
        modalTitle.innerHTML = '<i class="fa-solid fa-rotate"></i> Habit Details';
        startDateRow.style.display = 'flex'; 
        labelTimeStart.textContent = 'Time (Optional)';
        taskDetailsRow.style.display = 'flex';
        deadlineContainer.style.display = 'none';
        eventOnlyElements.forEach(el => el.style.display = 'none');
        taskOnlyElements.forEach(el => el.style.display = 'none');
        
        if(window.customFrequencySelect && window.customFrequencySelect.getValue() === 'none') {
            window.customFrequencySelect.setValue('daily', 'Daily');
        }
    }
    modal.classList.add('active');
}

window.editItem = function(id) {
    db.transaction(['tasks'], 'readonly').objectStore('tasks').get(parseInt(id)).onsuccess = (e) => {
        const item = e.target.result;
        if(!item) return;

        document.getElementById('task-form').reset(); 
        document.getElementById('edit-item-id').value = item.id;
        document.getElementById('submit-btn').textContent = 'Update Details';
        document.getElementById('modal-delete-btn').style.display = 'block'; 

        document.getElementById('task-title').value = item.title;
        document.getElementById('task-start-date').value = item.startDate;
        
        // Optional Description field
        document.getElementById('item-description').value = item.description || '';
        
        // Map 12-hour Time Picker Start
        if (window.timePickerStart) {
            window.timePickerStart.setValue24h(item.startTime || '');
        }
        
        // Map Custom Frequency Select
        if (window.customFrequencySelect) {
            let label = 'No Repeat';
            let freqValue = item.frequency || 'none';
            if (freqValue === 'specific_days') {
                freqValue = 'custom';
                item.frequency = 'custom';
                item.customUnit = 'weeks';
            }
            
            if (freqValue === 'daily') label = 'Daily';
            else if (freqValue === 'weekly') label = 'Weekly';
            else if (freqValue === 'monthly') label = 'Monthly';
            else if (freqValue === 'yearly') label = 'Yearly';
            else if (freqValue === 'custom') label = 'Custom';
            window.customFrequencySelect.setValue(freqValue, label);
        }

        document.getElementById('custom-freq-row').style.display = 'none';
        document.getElementById('specific-days-row').style.display = 'none';

        if (item.frequency === 'custom') {
            document.getElementById('custom-freq-row').style.display = 'block';
            document.getElementById('custom-freq-num').value = item.customNum || 1;
            
            const unit = item.customUnit || 'days';
            if (window.customFreqUnitSelect) {
                const uLabel = unit.charAt(0).toUpperCase() + unit.slice(1);
                window.customFreqUnitSelect.setValue(unit, uLabel);
            }
            
            if (unit === 'weeks') {
                document.getElementById('specific-days-row').style.display = 'block';
                const boxes = document.querySelectorAll('.day-toggle input');
                boxes.forEach(cb => {
                    cb.checked = item.specificDays && item.specificDays.includes(parseInt(cb.value));
                });
            }
            document.getElementById('times-per-day').value = item.timesPerDay || 1;
        } else {
            document.getElementById('times-per-day').value = item.timesPerDay || 1;
        }

        if(item.type === 'task') {
            if(item.dueDate) document.getElementById('task-due-date').value = item.dueDate;
            if(window.timePickerDue) {
                window.timePickerDue.setValue24h(item.dueTime || '');
            }
            
            // Set Custom Priority Dropdown
            if (window.customPrioritySelect) {
                const prio = item.priority || 'medium';
                let prioHTML = '<i class="fa-solid fa-flag" style="color: #FFA940;"></i> Medium';
                if (prio === 'high') prioHTML = '<i class="fa-solid fa-flag" style="color: #FF4D4F;"></i> High';
                else if (prio === 'low') prioHTML = '<i class="fa-solid fa-flag" style="color: #2F7BF6;"></i> Low';
                window.customPrioritySelect.setValue(prio, prioHTML);
            }

            tempSubtasks = item.subtasks ? [...item.subtasks] : [];
            renderTempSubtasks();
        } else if (item.type === 'event') {
            document.getElementById('event-end-date').value = item.endDate;
            if (window.timePickerEnd) {
                window.timePickerEnd.setValue24h(item.endTime || '');
            }
        }

        // Close details modal if it was open before opening edit
        const detailsModal = document.getElementById('details-modal');
        if (detailsModal) detailsModal.classList.remove('active');

        openModalUI(item.type);
    };
};

function initFormSubmit(modal) {
    const form = document.getElementById('task-form');
    if(!form) return;
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        // Update hidden inputs from custom pickers
        if (window.timePickerStart) {
            document.getElementById('task-start-time').value = window.timePickerStart.getValue();
        }
        if (window.timePickerEnd) {
            document.getElementById('event-end-time').value = window.timePickerEnd.getValue();
        }
        if (window.timePickerDue) {
            document.getElementById('task-due-time').value = window.timePickerDue.getValue();
        }

        const editId = document.getElementById('edit-item-id').value;
        const type = document.getElementById('item-type').value;
        const title = document.getElementById('task-title').value;
        const startDate = document.getElementById('task-start-date').value;
        const startTime = document.getElementById('task-start-time').value;
        
        // Custom Frequency Selector value
        const frequency = window.customFrequencySelect ? window.customFrequencySelect.getValue() : 'none';

        const currentUser = JSON.parse(localStorage.getItem('currentUser'));
        const userId = currentUser ? currentUser.id : 'guest';

        let dataItem = {
            userId: userId,
            type: type,
            title: title,
            startDate: startDate,
            startTime: startTime || null,
            frequency: frequency,
            isCompleted: false,
            isCancelled: false, 
            completedCount: 0,
            description: document.getElementById('item-description').value.trim() || null
        };

        dataItem.timesPerDay = parseInt(document.getElementById('times-per-day').value) || 1;
        
        if (frequency === 'custom') {
            dataItem.customNum = parseInt(document.getElementById('custom-freq-num').value) || 1;
            dataItem.customUnit = window.customFreqUnitSelect ? window.customFreqUnitSelect.getValue() : 'days';
            
            if (dataItem.customUnit === 'weeks') {
                const selectedDays = Array.from(document.querySelectorAll('.day-toggle input:checked')).map(cb => parseInt(cb.value));
                if (selectedDays.length === 0) {
                    const startDay = new Date(startDate).getDay();
                    dataItem.specificDays = [startDay];
                } else {
                    dataItem.specificDays = selectedDays;
                }
            } else {
                dataItem.specificDays = null;
            }
        } else {
            dataItem.specificDays = null;
        }

        if (type === 'task') {
            const dueDate = document.getElementById('task-due-date').value;
            const dueTime = document.getElementById('task-due-time').value;
            if (dueDate && new Date(startDate) > new Date(dueDate)) {
                showToast('Deadline cannot be before start date!', 'error'); return;
            }
            dataItem.dueDate = dueDate || null;
            dataItem.dueTime = dueTime || null;
            dataItem.priority = window.customPrioritySelect ? window.customPrioritySelect.getValue() : 'medium';
            dataItem.subtasks = [...tempSubtasks]; 
        } else if (type === 'event') {
            const endDate = document.getElementById('event-end-date').value;
            const endTime = document.getElementById('event-end-time').value;
            const startFull = new Date(`${startDate}T${startTime || '00:00'}`);
            const endFull = new Date(`${endDate}T${endTime || '00:00'}`);
            if (startFull > endFull) {
                showToast('End time cannot be before start time!', 'error'); return;
            }
            dataItem.endDate = endDate;
            dataItem.endTime = endTime || null;
            dataItem.priority = 'medium'; 
        } else if (type === 'habit') {
            dataItem.priority = 'medium';
        }

        const tx = db.transaction(['tasks'], 'readwrite');
        const store = tx.objectStore('tasks');
        
        if (editId) {
            dataItem.id = parseInt(editId);
            store.get(dataItem.id).onsuccess = (e) => {
                const old = e.target.result;
                dataItem.createdAt = old.createdAt;
                dataItem.isCompleted = old.isCompleted;
                dataItem.isCancelled = old.isCancelled || false;
                dataItem.completedCount = old.completedCount || 0;
                dataItem.lastNotifiedDate = old.lastNotifiedDate || null;
                store.put(dataItem).onsuccess = () => finishSubmit('Updated successfully!', false);
            };
        } else {
            dataItem.createdAt = new Date().getTime();
            store.add(dataItem).onsuccess = () => finishSubmit('Created successfully!', false);
        }

        function finishSubmit(msg, playAudioFlag) {
            form.reset();
            document.getElementById('edit-item-id').value = '';
            modal.classList.remove('active');
            showToast(msg, 'success', playAudioFlag);
            displayTasks();
            if(window.calendarInstance) window.calendarInstance.refetchEvents();
        }
    });
}

function initDatabase() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = (event) => {
        db = event.target.result;
        displayTasks(); 
        initCalendar();
    };
    request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains('tasks')) {
            database.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
        }
    };
}

function formatTaskTimeDisplay(time24) {
    if (!time24) return '';
    const is24h = (localStorage.getItem('timeFormat') || '12h') === '24h';
    if (is24h) return time24;
    
    // Split and convert to standard 12h format
    const [hStr, mStr] = time24.split(':');
    let hour = parseInt(hStr, 10);
    let ampm = 'AM';
    if (hour >= 12) {
        ampm = 'PM';
        if (hour > 12) hour -= 12;
    }
    if (hour === 0) hour = 12;
    return `${hour}:${mStr} ${ampm}`;
}

function displayTasks() {
    const habitsContainer = document.getElementById('habits-container');
    const historyContainer = document.getElementById('history-tasks');
    const pomodoroSelect = document.getElementById('pomodoro-task-select');
    const pomodoroBtn = document.getElementById('pomodoro-mark-done');

    if (!db) return;

    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const currentUserId = currentUser ? currentUser.id : 'guest';

    db.transaction(['tasks'], 'readonly').objectStore('tasks').getAll().onsuccess = (e) => {
        const items = e.target.result.filter(item => item.userId === currentUserId);
        
        if (habitsContainer) habitsContainer.innerHTML = '';
        if (historyContainer) historyContainer.innerHTML = '';

        const tasks = items.filter(i => (i.type === 'task' || !i.type) && !i.isDeleted);
        const habits = items.filter(i => i.type === 'habit' && !i.isDeleted);

        // Store active tasks globally for live ticking
        window.activeTasksList = tasks.filter(t => !t.isCompleted && !t.isCancelled).sort((a, b) => b.createdAt - a.createdAt);
        
        const activeHabits = habits.filter(t => !t.isCompleted).sort((a, b) => b.createdAt - a.createdAt);
        const historyItems = items.filter(t => (t.isCompleted || t.isCancelled || t.isDeleted) && t.type !== 'habit').sort((a, b) => b.createdAt - a.createdAt);

        if (pomodoroSelect) {
            const pomodoroOptions = document.getElementById('pomodoro-task-options');
            if (pomodoroOptions) {
                let html = '<div class="custom-select-option" data-value="">No specific task</div>';
                window.activeTasksList.forEach(t => {
                    html += `<div class="custom-select-option" data-value="${t.id}">${t.title}</div>`;
                });
                pomodoroOptions.innerHTML = html;
                
                const selectVal = pomodoroSelect.value;
                if (selectVal) {
                    const selectedTask = window.activeTasksList.find(t => String(t.id) === String(selectVal));
                    if (selectedTask) {
                        if (window.customPomodoroTaskSelect) {
                            window.customPomodoroTaskSelect.setValue(selectedTask.id, selectedTask.title);
                        }
                    } else {
                        pomodoroSelect.value = '';
                        if (window.customPomodoroTaskSelect) {
                            window.customPomodoroTaskSelect.setValue('', 'No specific task');
                        }
                    }
                } else {
                    if (window.customPomodoroTaskSelect) {
                        window.customPomodoroTaskSelect.setValue('', 'No specific task');
                    }
                }
            }
            if (pomodoroBtn) pomodoroBtn.style.display = pomodoroSelect.value ? 'block' : 'none';
        }

        if (habitsContainer && activeHabits.length === 0) habitsContainer.innerHTML = '<p class="empty-state">No active habits. Create one!</p>';
        if (historyContainer && historyItems.length === 0) historyContainer.innerHTML = '<p class="empty-state">No completed or cancelled items yet.</p>';

        const createHTML = (item, isHistory = false) => {
            let timeInfo = item.startTime ? ` <i class="fa-regular fa-clock"></i> ${formatTaskTimeDisplay(item.startTime)}` : '';
            let freqText = '';
            
            if (item.frequency && item.frequency !== 'none') {
                if (item.frequency === 'custom') freqText = ` (Every ${item.customNum} ${item.customUnit})`;
                else if (item.frequency === 'specific_days') freqText = ` (Custom Days)`;
                else { const dict = { 'daily':'Daily', 'weekly':'Weekly', 'monthly':'Monthly', 'yearly':'Yearly' }; freqText = ` (${dict[item.frequency]})`; }
            }
            
            let progressBadge = '';
            if (item.timesPerDay > 1 && !item.isCompleted && !item.isCancelled && !item.isDeleted) {
                let count = item.completedCount || 0;
                progressBadge = `<span class="progress-badge">${count}/${item.timesPerDay}</span>`;
            }

            if (item.isCancelled) {
                progressBadge = `<span class="badge-cancelled">Won't Do</span>`;
            } else if (item.isCompleted && isHistory) {
                progressBadge = `<span class="badge-completed">Completed</span>`;
            } else if (item.isDeleted) {
                progressBadge = `<span class="badge-deleted">Deleted</span>`;
            }

            let flagIcon = '';
            if (item.type === 'task') {
                if (item.priority === 'high') flagIcon = ' <i class="fa-solid fa-flag" style="color: #FF4D4F; font-size: 13px;"></i>';
                else if (item.priority === 'medium') flagIcon = ' <i class="fa-solid fa-flag" style="color: #FFA940; font-size: 13px;"></i>';
                else if (item.priority === 'low') flagIcon = ' <i class="fa-solid fa-flag" style="color: #2F7BF6; font-size: 13px;"></i>';
            }

            const itemClass = item.isCancelled ? 'cancelled' : (item.isCompleted ? 'completed' : '');

            let subtasksHTML = '';
            if (item.subtasks && item.subtasks.length > 0 && !isHistory) {
                subtasksHTML = '<div class="subtasks-wrapper">';
                item.subtasks.forEach((sub, idx) => {
                    subtasksHTML += `
                        <div class="subtask-item ${sub.completed ? 'completed' : ''}">
                            <input type="checkbox" class="subtask-checkbox" ${sub.completed ? 'checked' : ''} onchange="toggleSubtask(${item.id}, ${idx}, ${sub.completed})">
                            <span class="subtask-text">${sub.title}</span>
                        </div>
                    `;
                });
                subtasksHTML += '</div>';
            }

            let actionButtons = '';
            let dropdownItems = '';

            if (isHistory) {
                actionButtons = `
                    <button onclick="restoreItem(${item.id})" class="btn-icon btn-edit" title="Restore"><i class="fa-solid fa-rotate-left"></i></button>
                    <button onclick="deleteItem(${item.id})" class="btn-icon btn-delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
                `;
                dropdownItems = `
                    <button class="dropdown-item" onclick="restoreItem(${item.id})"><i class="fa-solid fa-rotate-left"></i> Restore</button>
                    <button class="dropdown-item danger" onclick="deleteItem(${item.id})"><i class="fa-solid fa-trash"></i> Delete</button>
                `;
            } else {
                let cancelBtnDesktop = (!item.isCompleted && !item.isCancelled && item.type !== 'habit') ? `<button onclick="cancelItem(${item.id})" class="btn-icon btn-cancel" title="Mark as Won't Do"><i class="fa-solid fa-ban"></i></button>` : '';
                let cancelBtnMobile = (!item.isCompleted && !item.isCancelled && item.type !== 'habit') ? `<button class="dropdown-item" onclick="cancelItem(${item.id})"><i class="fa-solid fa-ban"></i> Won't Do</button>` : '';
                
                actionButtons = `
                    <button onclick="editItem(${item.id})" class="btn-icon btn-edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    ${cancelBtnDesktop}
                    <button onclick="deleteItem(${item.id})" class="btn-icon btn-delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
                `;
                dropdownItems = `
                    <button class="dropdown-item" onclick="editItem(${item.id})"><i class="fa-solid fa-pen"></i> Edit</button>
                    ${cancelBtnMobile}
                    <button class="dropdown-item danger" onclick="deleteItem(${item.id})"><i class="fa-solid fa-trash"></i> Delete</button>
                `;
            }

            let checkboxHTML = isHistory ? '' : `<input type="checkbox" class="custom-checkbox" ${item.isCompleted ? 'checked' : ''} ${item.isCancelled ? 'disabled' : ''} onchange="toggleItemComplete(${item.id}, ${item.isCompleted})">`;

            let dueInfo = '';
            if (item.dueDate) {
                dueInfo = ` <span style="font-size:11px; color:#FF4D4F; margin-left: 8px; font-weight: 500;"><i class="fa-regular fa-calendar-xmark"></i> Due: ${item.dueDate}${item.dueTime ? ' ' + formatTaskTimeDisplay(item.dueTime) : ''}</span>`;
            }

            return `
                <div class="task-wrapper" onclick="showItemDetails(${item.id})">
                    <div class="task-item ${itemClass}" style="border-left-color: ${getColor(item.priority)}; border-left-width: 0;">
                        <div class="task-info-simple">
                            <span onclick="event.stopPropagation();">${checkboxHTML}</span>
                            <h4 class="task-item-title">
                                ${item.title} ${flagIcon} ${progressBadge}
                                <span style="font-size:12px; color:var(--text-muted); font-weight:normal;">${timeInfo} ${freqText}</span>
                                ${dueInfo}
                            </h4>
                        </div>
                        <div class="task-actions" onclick="event.stopPropagation();">
                            <div class="task-actions-desktop">${actionButtons}</div>
                            <div class="task-menu-container">
                                <button class="btn-menu" onclick="toggleTaskDropdown(event, ${item.id})"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                                <div class="task-dropdown" id="dropdown-${item.id}">
                                    ${dropdownItems}
                                </div>
                            </div>
                        </div>
                    </div>
                    ${subtasksHTML ? `<span onclick="event.stopPropagation();">${subtasksHTML}</span>` : ''}
                </div>
            `;
        };

        if (habitsContainer) {
            activeHabits.forEach(t => habitsContainer.innerHTML += createHTML(t));
        }
        if (historyContainer) {
            historyItems.forEach(t => historyContainer.innerHTML += createHTML(t, true));
        }

        // Dashboard Live Ticker Renderer (Upcoming, Current, Overdue Tasks)
        function sortAndRenderDashboard() {
            const container = document.getElementById('dashboard-view-container');
            if (!container) return;

            // Recalculate and update the cached dashboard fingerprint to remain perfectly in sync
            const now = new Date();
            let fingerprint = "";
            (window.activeTasksList || []).forEach(item => {
                let startInstant = item.startDate ? parseLocalISOString(item.startDate, item.startTime || '00:00') : now;
                let dueInstant = item.dueDate ? parseLocalISOString(item.dueDate, item.dueTime || '23:59') : null;
                let cat = "current";
                if (dueInstant && dueInstant < now) cat = "overdue";
                else if (startInstant > now) cat = "upcoming";
                fingerprint += `${item.id}:${cat}|`;
            });
            window.lastDashboardFingerprint = fingerprint;

            // Capture scroll positions before re-rendering
            const board = container.querySelector('.kanban-board');
            const savedScrollLeft = board ? board.scrollLeft : 0;
            
            const columns = container.querySelectorAll('.kanban-column');
            const savedScrollTops = Array.from(columns).map(col => col.scrollTop);

            const upcomingTasks = [];
            const currentTasks = [];
            const overdueTasks = [];

            (window.activeTasksList || []).forEach(item => {
                let startInstant = null;
                if (item.startDate) {
                    startInstant = parseLocalISOString(item.startDate, item.startTime || '00:00');
                } else {
                    startInstant = new Date(); 
                }

                let dueInstant = null;
                if (item.dueDate) {
                    dueInstant = parseLocalISOString(item.dueDate, item.dueTime || '23:59');
                }

                if (dueInstant && dueInstant < now) {
                    overdueTasks.push(item);
                } else if (startInstant > now) {
                    upcomingTasks.push(item);
                } else {
                    currentTasks.push(item);
                }
            });

            const layout = localStorage.getItem('dashboardLayout') || 'list';

            if (layout === 'kanban') {
                let html = '<div class="kanban-board">';

                // Column 1: Overdue
                html += `
                    <div class="kanban-column" style="border-top: 3px solid #FF4D4F;">
                        <div class="dashboard-view-header">
                            <span class="dashboard-view-title" style="color: #FF4D4F; font-size: 13.5px;"><i class="fa-solid fa-circle-exclamation"></i> Overdue</span>
                            <span class="dashboard-view-count" style="background-color: rgba(255,77,79,0.15); color: #FF4D4F;">${overdueTasks.length}</span>
                        </div>
                        <div class="tasks-container">
                            ${overdueTasks.length === 0 ? '<p class="empty-state" style="padding:16px 0; font-size:12px;">No overdue tasks</p>' : overdueTasks.map(t => createHTML(t)).join('')}
                        </div>
                    </div>
                `;

                // Column 2: Current
                html += `
                    <div class="kanban-column" style="border-top: 3px solid var(--color-ticktick-blue);">
                        <div class="dashboard-view-header">
                            <span class="dashboard-view-title" style="color: var(--color-ticktick-blue); font-size: 13.5px;"><i class="fa-solid fa-play"></i> Current</span>
                            <span class="dashboard-view-count" style="background-color: rgba(47,123,246,0.1); color: var(--color-ticktick-blue);">${currentTasks.length}</span>
                        </div>
                        <div class="tasks-container">
                            ${currentTasks.length === 0 ? '<p class="empty-state" style="padding:16px 0; font-size:12px;">No current tasks</p>' : currentTasks.map(t => createHTML(t)).join('')}
                        </div>
                    </div>
                `;

                // Column 3: Upcoming
                html += `
                    <div class="kanban-column" style="border-top: 3px solid #73D13D;">
                        <div class="dashboard-view-header">
                            <span class="dashboard-view-title" style="color: #73D13D; font-size: 13.5px;"><i class="fa-solid fa-forward"></i> Upcoming</span>
                            <span class="dashboard-view-count" style="background-color: rgba(115,209,61,0.1); color: #73D13D;">${upcomingTasks.length}</span>
                        </div>
                        <div class="tasks-container">
                            ${upcomingTasks.length === 0 ? '<p class="empty-state" style="padding:16px 0; font-size:12px;">No upcoming tasks</p>' : upcomingTasks.map(t => createHTML(t)).join('')}
                        </div>
                    </div>
                `;

                html += '</div>';

                // ONLY UPDATE DOM IF THE DYNAMIC CONTENT ACTUALLY CHANGED TO KEEP IT BUTTERY-SMOOTH!
                if (container.innerHTML !== html) {
                    container.innerHTML = html;

                    // Restore scroll positions after setting innerHTML
                    const newBoard = container.querySelector('.kanban-board');
                    if (newBoard) {
                        newBoard.scrollLeft = savedScrollLeft;
                    }
                    const newColumns = container.querySelectorAll('.kanban-column');
                    newColumns.forEach((col, idx) => {
                        if (savedScrollTops[idx] !== undefined) {
                            col.scrollTop = savedScrollTops[idx];
                        }
                    });
                }
            } else {
                let html = '<div class="standard-board">';

                if (overdueTasks.length > 0) {
                    html += `
                        <div class="tasks-list-card" style="border-color: #FF4D4F44; background-color: #FF4D4F08;">
                            <div class="dashboard-view-header">
                                <span class="dashboard-view-title" style="color: #FF4D4F;"><i class="fa-solid fa-circle-exclamation"></i> Overdue Tasks</span>
                                <span class="dashboard-view-count" style="background-color: rgba(255,77,79,0.15); color: #FF4D4F;">${overdueTasks.length}</span>
                            </div>
                            <div class="tasks-container">
                                ${overdueTasks.map(t => createHTML(t)).join('')}
                            </div>
                        </div>
                    `;
                }

                html += `
                    <div class="tasks-list-card">
                        <div class="dashboard-view-header">
                            <span class="dashboard-view-title" style="color: var(--color-ticktick-blue);"><i class="fa-solid fa-play"></i> Current Tasks</span>
                            <span class="dashboard-view-count" style="background-color: rgba(47,123,246,0.1); color: var(--color-ticktick-blue);">${currentTasks.length}</span>
                        </div>
                        <div class="tasks-container">
                            ${currentTasks.length === 0 ? '<p class="empty-state">No current tasks active.</p>' : currentTasks.map(t => createHTML(t)).join('')}
                        </div>
                    </div>
                `;

                html += `
                    <div class="tasks-list-card">
                        <div class="dashboard-view-header">
                            <span class="dashboard-view-title" style="color: #73D13D;"><i class="fa-solid fa-forward"></i> Upcoming Tasks</span>
                            <span class="dashboard-view-count" style="background-color: rgba(115,209,61,0.1); color: #73D13D;">${upcomingTasks.length}</span>
                        </div>
                        <div class="tasks-container">
                            ${upcomingTasks.length === 0 ? '<p class="empty-state">No upcoming tasks scheduled.</p>' : upcomingTasks.map(t => createHTML(t)).join('')}
                        </div>
                    </div>
                `;

                html += '</div>';

                // ONLY UPDATE DOM IF THE DYNAMIC CONTENT ACTUALLY CHANGED TO KEEP IT BUTTERY-SMOOTH!
                if (container.innerHTML !== html) {
                    container.innerHTML = html;
                }
            }
        }

        window.sortAndRenderDashboard = sortAndRenderDashboard;
        sortAndRenderDashboard();
    };
}

window.cancelItem = function(id) {
    showConfirm('Mark this task as "Won\'t Do"?', () => {
        const store = db.transaction(['tasks'], 'readwrite').objectStore('tasks');
        store.get(parseInt(id)).onsuccess = (e) => {
            const item = e.target.result;
            item.isCancelled = true;
            item.isCompleted = false; 
            store.put(item).onsuccess = () => {
                showToast('Task marked as Won\'t Do', 'info', false);
                displayTasks();
                if(window.calendarInstance) window.calendarInstance.refetchEvents();
            };
        };
    });
}

window.restoreItem = function(id) {
    const store = db.transaction(['tasks'], 'readwrite').objectStore('tasks');
    store.get(parseInt(id)).onsuccess = (e) => {
        const item = e.target.result;
        item.isCompleted = false;
        item.isCancelled = false;
        item.isDeleted = false;
        item.completedCount = 0;
        store.put(item).onsuccess = () => {
            showToast('Task restored!', 'info', false);
            displayTasks();
            if(window.calendarInstance) window.calendarInstance.refetchEvents();
        };
    };
}

window.deleteItem = function(id) {
    const store = db.transaction(['tasks'], 'readwrite').objectStore('tasks');
    store.get(parseInt(id)).onsuccess = (e) => {
        const item = e.target.result;
        if (!item) return;
        
        // If it is already in history (isCompleted, isCancelled, or isDeleted), permanently delete it from IndexedDB!
        if (item.isCompleted || item.isCancelled || item.isDeleted) {
            showConfirm('Permanently delete this item from history?', () => {
                const tx2 = db.transaction(['tasks'], 'readwrite');
                tx2.objectStore('tasks').delete(parseInt(id)).onsuccess = () => {
                    showToast('Permanently deleted', 'success', false);
                    displayTasks();
                    if(window.calendarInstance) window.calendarInstance.refetchEvents();
                };
            });
        } else {
            // Otherwise, mark as isDeleted = true and move to history page!
            showConfirm('Are you sure you want to delete this task?', () => {
                const tx2 = db.transaction(['tasks'], 'readwrite');
                const store2 = tx2.objectStore('tasks');
                item.isDeleted = true;
                item.isCompleted = false;
                item.isCancelled = false;
                store2.put(item).onsuccess = () => {
                    showToast('Task moved to history', 'success', false);
                    displayTasks();
                    if(window.calendarInstance) window.calendarInstance.refetchEvents();
                };
            });
        }
    };
}

window.toggleItemComplete = function(id, currentStatus) {
    const store = db.transaction(['tasks'], 'readwrite').objectStore('tasks');
    store.get(parseInt(id)).onsuccess = (e) => {
        const item = e.target.result;
        if (!item) return;

        if (!currentStatus) { 
            item.completedCount = (item.completedCount || 0) + 1;
            if (item.completedCount >= (item.timesPerDay || 1)) {
                item.isCompleted = true;
                showToast('Awesome! Marked as complete.', 'success', true);
            } else {
                playSound('check');
                showToast(`Good job! ${item.completedCount}/${item.timesPerDay} completed.`, 'info', false);
            }
        } else { 
            // Completely silent uncheck
            item.isCompleted = false;
            item.completedCount = 0;
        }
        store.put(item).onsuccess = () => {
            displayTasks();
            if(window.calendarInstance) window.calendarInstance.refetchEvents();
            
            const pomSelect = document.getElementById('pomodoro-task-select');
            if (pomSelect && pomSelect.value == id && item.isCompleted) {
                pomSelect.value = '';
                document.getElementById('pomodoro-mark-done').style.display = 'none';
            }
        };
    };
}

window.toggleSubtask = function(taskId, subIdx, currentStatus) {
    const store = db.transaction(['tasks'], 'readwrite').objectStore('tasks');
    store.get(parseInt(taskId)).onsuccess = (e) => {
        const item = e.target.result;
        if (item && item.subtasks) {
            item.subtasks[subIdx].completed = !currentStatus;
            // Only play sound when checking the box, not unchecking
            if(!currentStatus) playSound('check');
            store.put(item).onsuccess = () => displayTasks();
        }
    };
};

function getColor(priority) {
    if (priority === 'high') return '#FF4D4F';
    if (priority === 'medium') return '#FFA940';
    return '#73D13D';
}

// ==========================================
// Details Modal Implementation & Action Bindings
// ==========================================
window.showItemDetails = function(id) {
    db.transaction(['tasks'], 'readonly').objectStore('tasks').get(parseInt(id)).onsuccess = (e) => {
        const item = e.target.result;
        if (!item) return;

        const modal = document.getElementById('details-modal');
        if (!modal) return;

        const titleEl = document.getElementById('details-modal-title');
        const bodyEl = document.getElementById('details-modal-body');
        const actionsEl = document.getElementById('details-modal-actions');

        let typeLabel = item.type || 'task';
        let priorityLabel = item.priority || 'medium';
        let priorityFlag = '';
        if (priorityLabel === 'high') priorityFlag = '<i class="fa-solid fa-flag" style="color: #FF4D4F;"></i> High';
        else if (priorityLabel === 'low') priorityFlag = '<i class="fa-solid fa-flag" style="color: #2F7BF6;"></i> Low';
        else priorityFlag = '<i class="fa-solid fa-flag" style="color: #FFA940;"></i> Medium';

        titleEl.textContent = item.title;

        // Formulate Dates & Times
        let scheduleHTML = '';
        if (item.type === 'event') {
            const startVal = item.startDate + (item.startTime ? ` at ${formatTime12h(item.startTime)}` : '');
            const endVal = item.endDate + (item.endTime ? ` at ${formatTime12h(item.endTime)}` : '');
            scheduleHTML = `
                <div class="details-block">
                    <span class="details-block-label">Duration</span>
                    <span class="details-block-value"><i class="fa-regular fa-calendar"></i> ${startVal} <br>to<br> <i class="fa-regular fa-calendar"></i> ${endVal}</span>
                </div>
            `;
        } else {
            const startVal = item.startDate + (item.startTime ? ` at ${formatTime12h(item.startTime)}` : '');
            const dueVal = item.dueDate ? `${item.dueDate}` : 'No deadline';
            scheduleHTML = `
                <div class="form-row" style="gap: 16px; margin-bottom: 0;">
                    <div class="details-block" style="flex: 1;">
                        <span class="details-block-label">Start Date</span>
                        <span class="details-block-value"><i class="fa-regular fa-calendar"></i> ${startVal}</span>
                    </div>
                    ${item.type === 'task' ? `
                    <div class="details-block" style="flex: 1;">
                        <span class="details-block-label">Deadline</span>
                        <span class="details-block-value"><i class="fa-regular fa-calendar-xmark"></i> ${dueVal}</span>
                    </div>
                    ` : ''}
                </div>
            `;
        }

        // Description
        let descHTML = '';
        if (item.description) {
            descHTML = `
                <div class="details-block">
                    <span class="details-block-label">Description / Notes</span>
                    <div class="details-description-box">${item.description}</div>
                </div>
            `;
        }

        // Repeat/Interval
        let repeatHTML = '';
        if (item.frequency && item.frequency !== 'none') {
            let freqLabel = '';
            if (item.frequency === 'custom') freqLabel = `Every ${item.customNum} ${item.customUnit}`;
            else if (item.frequency === 'specific_days') freqLabel = 'Specific Days';
            else freqLabel = item.frequency.charAt(0).toUpperCase() + item.frequency.slice(1);

            let daysText = '';
            if ((item.frequency === 'specific_days' || item.frequency === 'weekly') && item.specificDays && item.specificDays.length > 0) {
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                daysText = `<div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Days: ${item.specificDays.map(d => dayNames[d]).join(', ')}</div>`;
            }

            repeatHTML = `
                <div class="details-block">
                    <span class="details-block-label">Repetition</span>
                    <span class="details-block-value"><i class="fa-solid fa-repeat"></i> ${freqLabel} ${item.timesPerDay > 1 ? `(${item.timesPerDay} times per day)` : ''}</span>
                    ${daysText}
                </div>
            `;
        }

        // Subtasks checklist inside details modal
        let subtasksHTML = '';
        if (item.subtasks && item.subtasks.length > 0) {
            subtasksHTML = `
                <div class="details-block">
                    <span class="details-block-label">Sub-tasks checklist</span>
                    <ul class="details-subtasks-list">
            `;
            item.subtasks.forEach((sub, idx) => {
                subtasksHTML += `
                    <li class="details-subtask-item ${sub.completed ? 'completed' : ''}">
                        <input type="checkbox" class="custom-checkbox" ${sub.completed ? 'checked' : ''} onchange="toggleSubtaskInDetails(${item.id}, ${idx}, ${sub.completed})">
                        <span class="details-subtask-text">${sub.title}</span>
                    </li>
                `;
            });
            subtasksHTML += `
                    </ul>
                </div>
            `;
        }

        // Complete details body HTML
        bodyEl.innerHTML = `
            <div class="details-meta-row">
                <span class="details-badge ${typeLabel}">${typeLabel}</span>
                ${item.type === 'task' ? `<span class="details-priority">${priorityFlag}</span>` : ''}
                ${item.isCompleted ? `<span class="badge-completed" style="background: rgba(115,209,61,0.15); color: #73D13D; padding: 4px 10px; border-radius: 12px; font-size:12px; font-weight:600;">Completed</span>` : ''}
                ${item.isCancelled ? `<span class="badge-cancelled" style="background: rgba(255,77,79,0.15); color: #FF4D4F; padding: 4px 10px; border-radius: 12px; font-size:12px; font-weight:600;">Cancelled</span>` : ''}
            </div>
            ${scheduleHTML}
            ${repeatHTML}
            ${descHTML}
            ${subtasksHTML}
        `;

        // Action Buttons Setup
        let cancelBtn = (!item.isCompleted && !item.isCancelled && item.type !== 'habit');

        // Desktop Icons-Only Actions
        let desktopHTML = `
            <button class="btn btn-secondary" title="Delete" style="color: #FF4D4F; border-color: #FF4D4F33; background: #FF4D4F11;" onclick="deleteItemInDetails(${item.id})"><i class="fa-solid fa-trash"></i></button>
            ${cancelBtn ? `<button class="btn btn-secondary" title="Won't Do" onclick="cancelItemInDetails(${item.id})"><i class="fa-solid fa-ban"></i></button>` : ''}
            <button class="btn btn-primary" title="Edit" onclick="editItem(${item.id})"><i class="fa-solid fa-pen"></i></button>
        `;

        if (!item.isCompleted && !item.isCancelled) {
            if (item.type === 'habit') {
                let count = item.completedCount || 0;
                desktopHTML += `<button class="btn btn-primary" title="Log Progress (${count}/${item.timesPerDay})" onclick="logHabitInDetails(${item.id})"><i class="fa-solid fa-check"></i></button>`;
            } else {
                desktopHTML += `<button class="btn btn-primary" style="background-color:#73D13D; border-color:#73D13D;" title="Complete" onclick="completeItemInDetails(${item.id})"><i class="fa-solid fa-check"></i></button>`;
            }
        } else {
            desktopHTML += `<button class="btn btn-secondary" title="Restore" onclick="restoreItemInDetails(${item.id})"><i class="fa-solid fa-rotate-left"></i></button>`;
        }

        // Mobile Dropdown Actions
        let mobileHTML = `
            <button class="details-kebab-option" onclick="editItem(${item.id})"><i class="fa-solid fa-pen"></i> Edit</button>
        `;
        if (cancelBtn) {
            mobileHTML += `<button class="details-kebab-option" onclick="cancelItemInDetails(${item.id})"><i class="fa-solid fa-ban"></i> Won't Do</button>`;
        }
        if (!item.isCompleted && !item.isCancelled) {
            if (item.type === 'habit') {
                let count = item.completedCount || 0;
                mobileHTML += `<button class="details-kebab-option" onclick="logHabitInDetails(${item.id})"><i class="fa-solid fa-check"></i> Log Progress (${count}/${item.timesPerDay})</button>`;
            } else {
                mobileHTML += `<button class="details-kebab-option" onclick="completeItemInDetails(${item.id})"><i class="fa-solid fa-check"></i> Complete</button>`;
            }
        } else {
            mobileHTML += `<button class="details-kebab-option" onclick="restoreItemInDetails(${item.id})"><i class="fa-solid fa-rotate-left"></i> Restore</button>`;
        }
        mobileHTML += `
            <button class="details-kebab-option delete" onclick="deleteItemInDetails(${item.id})"><i class="fa-solid fa-trash"></i> Delete</button>
        `;

        const desktopContainer = document.getElementById('details-actions-desktop');
        const mobileDropdown = document.getElementById('details-kebab-menu');
        const kebabBtn = document.getElementById('details-kebab-btn');

        if (desktopContainer) desktopContainer.innerHTML = desktopHTML;
        if (mobileDropdown) mobileDropdown.innerHTML = mobileHTML;

        if (mobileDropdown) mobileDropdown.classList.remove('show');

        if (kebabBtn && mobileDropdown) {
            kebabBtn.onclick = (e) => {
                e.stopPropagation();
                mobileDropdown.classList.toggle('show');
            };
        }

        // Hide mobile dropdown when user clicks outside
        const closeKebabMenu = () => {
            if (mobileDropdown) mobileDropdown.classList.remove('show');
        };
        document.addEventListener('click', closeKebabMenu);

        // Wire close elements
        const closeDetailsBtn = document.getElementById('close-details-modal');
        if(closeDetailsBtn) {
            closeDetailsBtn.onclick = () => modal.classList.remove('active');
        }

        modal.onclick = (e) => {
            if(e.target === modal) modal.classList.remove('active');
        };

        modal.classList.add('active');
    };
};

window.toggleSubtaskInDetails = function(itemId, subIdx, currentStatus) {
    const store = db.transaction(['tasks'], 'readwrite').objectStore('tasks');
    store.get(parseInt(itemId)).onsuccess = (e) => {
        const item = e.target.result;
        if (item && item.subtasks) {
            item.subtasks[subIdx].completed = !currentStatus;
            if(!currentStatus) playSound('check');
            store.put(item).onsuccess = () => {
                displayTasks();
                showItemDetails(itemId); // dynamically refresh the details page!
            };
        }
    };
};

window.completeItemInDetails = function(id) {
    window.toggleItemComplete(id, false);
    document.getElementById('details-modal').classList.remove('active');
};

window.logHabitInDetails = function(id) {
    window.toggleItemComplete(id, false);
    setTimeout(() => showItemDetails(id), 100);
};

window.restoreItemInDetails = function(id) {
    window.restoreItem(id);
    document.getElementById('details-modal').classList.remove('active');
};

window.cancelItemInDetails = function(id) {
    window.cancelItem(id);
    document.getElementById('details-modal').classList.remove('active');
};

window.deleteItemInDetails = function(id) {
    window.deleteItem(id);
    document.getElementById('details-modal').classList.remove('active');
};

function initCalendar() {
    const calendarEl = document.getElementById('calendar-placeholder');
    if(!calendarEl) return;

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        direction: 'ltr',
        height: 'auto', 
        stickyHeaderDates: false,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
        buttonText: { today: 'Today', month: 'Month', week: 'Week', day: 'Day' },
        eventClick: function(info) { if(info.event.id) showItemDetails(info.event.id); },
        events: function(info, successCallback, failureCallback) {
            if(!db) { successCallback([]); return; }
            const currentUser = JSON.parse(localStorage.getItem('currentUser'));
            const currentUserId = currentUser ? currentUser.id : 'guest';

            // Load calendar filtering preferences
            const prefs = JSON.parse(localStorage.getItem('calendarPreferences')) || {
                showTasks: true,
                showEvents: true,
                showHabits: true
            };

            db.transaction(['tasks'], 'readonly').objectStore('tasks').getAll().onsuccess = (e) => {
                const allEvents = [];
                e.target.result.forEach(item => {
                    if (item.userId !== currentUserId) return; 

                    const isTask = (item.type === 'task' || !item.type);
                    const isEvent = (item.type === 'event');
                    const isHabit = (item.type === 'habit');

                    // Filter based on checkbox preferences
                    if (isTask && !prefs.showTasks) return;
                    if (isEvent && !prefs.showEvents) return;
                    if (isHabit && !prefs.showHabits) return;

                    // Curate sleek themed color coding
                    let color = getColor(item.priority);
                    if (isEvent) color = 'var(--color-ticktick-blue)';
                    else if (isHabit) color = '#FFA940';
                    
                    let className = item.isCompleted ? 'completed-event' : '';
                    if (item.isCancelled) className = 'cancelled-event';
                    
                    // Render recurring Habits up to 3 months into the future
                    if (isHabit) {
                        let currDate = new Date(item.startDate);
                        let limitDate = new Date(currDate);
                        limitDate.setMonth(limitDate.getMonth() + 3);
                        
                        const startZeroDate = new Date(item.startDate);
                        startZeroDate.setHours(0,0,0,0);
                        
                        while(currDate <= limitDate) {
                            let currentDayOfWeek = currDate.getDay();
                            let shouldRender = false;
                            
                            if (item.frequency === 'daily') {
                                shouldRender = true;
                            } else if (item.frequency === 'weekly') {
                                if (currentDayOfWeek === startZeroDate.getDay()) {
                                    shouldRender = true;
                                }
                            } else if (item.frequency === 'monthly') {
                                if (currDate.getDate() === startZeroDate.getDate()) {
                                    shouldRender = true;
                                }
                            } else if (item.frequency === 'yearly') {
                                if (currDate.getDate() === startZeroDate.getDate() && currDate.getMonth() === startZeroDate.getMonth()) {
                                    shouldRender = true;
                                }
                            } else if (item.frequency === 'custom') {
                                const unit = item.customUnit || 'days';
                                const num = item.customNum || 1;
                                
                                if (unit === 'days') {
                                    const diffTime = Math.abs(currDate - startZeroDate);
                                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                    if (diffDays % num === 0) {
                                        shouldRender = true;
                                    }
                                } else if (unit === 'weeks') {
                                    const diffTime = Math.abs(currDate - startZeroDate);
                                    const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
                                    if (diffWeeks % num === 0 && item.specificDays && item.specificDays.includes(currentDayOfWeek)) {
                                        shouldRender = true;
                                    }
                                } else if (unit === 'months') {
                                    const monthDiff = (currDate.getFullYear() - startZeroDate.getFullYear()) * 12 + (currDate.getMonth() - startZeroDate.getMonth());
                                    if (monthDiff % num === 0 && currDate.getDate() === startZeroDate.getDate()) {
                                        shouldRender = true;
                                    }
                                }
                            } else if (item.frequency === 'specific_days' && item.specificDays && item.specificDays.includes(currentDayOfWeek)) {
                                shouldRender = true;
                            }
                            
                            if (shouldRender) {
                                let dateStr = currDate.toISOString().split('T')[0];
                                let eventStart = dateStr + (item.startTime ? 'T' + item.startTime : '');
                                allEvents.push({ id: item.id, title: item.title, start: eventStart, color: color, className: className, allDay: !item.startTime });
                            }
                            currDate.setDate(currDate.getDate() + 1);
                        }
                    } else if (isTask && item.dueDate && item.dueDate !== item.startDate) {
                        let currDate = new Date(item.startDate);
                        let endDateObj = new Date(item.dueDate);
                        while(currDate <= endDateObj) {
                            let dateStr = currDate.toISOString().split('T')[0];
                            let eventStart = dateStr + (item.startTime ? 'T' + item.startTime : '');
                            allEvents.push({ id: item.id, title: item.title, start: eventStart, color: color, className: className, allDay: !item.startTime });
                            currDate.setDate(currDate.getDate() + 1);
                        }
                    } else if (item.type === 'event' && item.endDate && item.endDate !== item.startDate) {
                        let currDate = new Date(item.startDate);
                        let endDateObj = new Date(item.endDate);
                        while(currDate <= endDateObj) {
                            let dateStr = currDate.toISOString().split('T')[0];
                            let eventStart = dateStr + (item.startTime ? 'T' + item.startTime : '');
                            let eventEnd = item.endTime ? dateStr + 'T' + item.endTime : null;
                            allEvents.push({ id: item.id, title: item.title, start: eventStart, end: eventEnd, color: color, className: className });
                            currDate.setDate(currDate.getDate() + 1);
                        }
                    } else {
                        let startStr = item.startDate + (item.startTime ? 'T' + item.startTime : '');
                        let endStr = (item.type === 'event' && item.endDate) ? item.endDate + (item.endTime ? 'T' + item.endTime : '') : null;
                        allEvents.push({ id: item.id, title: item.title, start: startStr, end: endStr, color: color, className: className });
                    }
                });
                successCallback(allEvents);
            };
        }
    });

    calendar.render();
    window.calendarInstance = calendar;
}

function initPomodoroDrag() {
    const svgContainer = document.getElementById('svg-container');
    const knob = document.getElementById('timer-knob');
    const progressPath = document.getElementById('timer-progress');
    const clockText = document.getElementById('timer-clock');
    const sessionVal = document.getElementById('session-val');
    const breakVal = document.getElementById('break-val');
    const statusText = document.getElementById('timer-status');
    const btnStart = document.getElementById('btn-start-timer');
    const btnReset = document.getElementById('btn-reset-timer');
    const quickBtns = document.querySelectorAll('.quick-time-btn');
    
    const taskSelect = document.getElementById('pomodoro-task-select');
    const taskDoneBtn = document.getElementById('pomodoro-mark-done');

    let isDragging = false;
    let cx = 120, cy = 120, r = 100;

    if(taskSelect && taskDoneBtn) {
        taskSelect.addEventListener('change', (e) => {
            taskDoneBtn.style.display = e.target.value ? 'block' : 'none';
        });
        taskDoneBtn.addEventListener('click', () => {
            if(taskSelect.value) toggleItemComplete(taskSelect.value, false);
        });
    }

    function updateKnobByMinutes(minutes) {
        if(isRunning) return;
        sessionMinutes = Math.max(5, Math.min(120, minutes));
        let fraction = (sessionMinutes - 5) / 115;
        let angleDeg = 135 + (fraction * 270);
        let angleRad = angleDeg * Math.PI / 180;
        knob.setAttribute('cx', cx + r * Math.cos(angleRad));
        knob.setAttribute('cy', cy + r * Math.sin(angleRad));
        progressPath.style.strokeDashoffset = ARC_LENGTH - (fraction * ARC_LENGTH);
        sessionVal.textContent = sessionMinutes;
        breakVal.textContent = Math.round(sessionMinutes / 5);
        timeLeft = sessionMinutes * 60;
        updateTimeDisplay();
    }

    function updateTimeDisplay() {
        const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const secs = (timeLeft % 60).toString().padStart(2, '0');
        clockText.textContent = `${mins}:${secs}`;
        if(isRunning) {
            const totalSecs = (isWorkSession ? sessionMinutes : Math.round(sessionMinutes / 5)) * 60;
            const ratio = timeLeft / totalSecs;
            progressPath.style.strokeDashoffset = ARC_LENGTH - (ratio * ARC_LENGTH);
        }
    }

    quickBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (isRunning) return;
            const mins = parseInt(e.target.getAttribute('data-time'));
            updateKnobByMinutes(mins);
        });
    });

    function handleDrag(e) {
        if (!isDragging || isRunning) return;
        e.preventDefault();
        let rect = svgContainer.getBoundingClientRect();
        let clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let clientY = e.touches ? e.touches[0].clientY : e.clientY;
        let mouseX = clientX - rect.left;
        let mouseY = clientY - rect.top;
        let angle = Math.atan2(mouseY - cy, mouseX - cx) * 180 / Math.PI;
        if (angle < 0) angle += 360;
        let shifted = angle - 135;
        if (shifted < 0) shifted += 360;
        if (shifted > 270) shifted = shifted > 315 ? 0 : 270;
        let fraction = shifted / 270;
        let mins = 5 + Math.round(fraction * 115 / 5) * 5;
        updateKnobByMinutes(mins);
    }

    svgContainer.addEventListener('mousedown', () => { isDragging = true; });
    window.addEventListener('mousemove', handleDrag);
    window.addEventListener('mouseup', () => { isDragging = false; });
    svgContainer.addEventListener('touchstart', () => { isDragging = true; }, {passive: false});
    window.addEventListener('touchmove', handleDrag, {passive: false});
    window.addEventListener('touchend', () => { isDragging = false; });

    btnStart.addEventListener('click', () => {
        if (isRunning) {
            clearInterval(timerInterval);
            isRunning = false;
            btnStart.innerHTML = '<i class="fa-solid fa-play"></i> Resume';
        } else {
            isRunning = true;
            btnStart.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
            knob.style.display = 'none'; 
            timerInterval = setInterval(() => {
                timeLeft--;
                updateTimeDisplay();
                if (timeLeft <= 0) {
                    playSound('pomodoro');
                    
                    if (isWorkSession) {
                        isWorkSession = false;
                        statusText.innerHTML = '<i class="fa-solid fa-mug-hot"></i> Break';
                        progressPath.style.stroke = '#73D13D';
                        showToast('Focus finished! Break started.', 'info');
                        timeLeft = Math.round(sessionMinutes / 5) * 60;
                    } else {
                        clearInterval(timerInterval);
                        isRunning = false;
                        isWorkSession = true;
                        statusText.innerHTML = '<i class="fa-solid fa-bullseye"></i> Focus';
                        progressPath.style.stroke = 'var(--color-ticktick-blue)';
                        btnStart.innerHTML = '<i class="fa-solid fa-play"></i> Start';
                        knob.style.display = 'block';
                        showToast('Break over! Ready to focus?', 'info');
                        updateKnobByMinutes(sessionMinutes);
                    }
                }
            }, 1000);
        }
    });

    btnReset.addEventListener('click', () => {
        clearInterval(timerInterval);
        isRunning = false;
        isWorkSession = true;
        knob.style.display = 'block';
        statusText.innerHTML = '<i class="fa-solid fa-bullseye"></i> Focus';
        progressPath.style.stroke = 'var(--color-ticktick-blue)';
        btnStart.innerHTML = '<i class="fa-solid fa-play"></i> Start';
        updateKnobByMinutes(25);
    });

    updateKnobByMinutes(25);
}