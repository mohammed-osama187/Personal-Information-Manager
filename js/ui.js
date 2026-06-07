import { 
    getTasksFromFirebase, 
    saveTaskToFirebase, 
    deleteTaskFromFirebase 
} from './db.js';
import { 
    parseLocalDate, 
    parseLocalISOString, 
    formatLocalDate, 
    formatTime12h, 
    formatTaskTimeDisplay, 
    getStableNumericId, 
    playSound, 
    showToast, 
    showConfirm,
    getTodayStr,
    applyThemePreference
} from './utils.js';


let tempSubtasks = [];

// Module-level tracker so we can replace the kebab-close handler on each details open
// without accumulating stale listeners on `document`.
let _detailsKebabCloseHandler = null;
let settingsInitialized = false;


// ==========================================
// Custom Select dropdown helper
// ==========================================
export function initCustomSelect(wrapperId, onChangeCallback) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return null;

    const display = wrapper.querySelector('.custom-select-display');
    const optionsDiv = wrapper.querySelector('.custom-select-options');
    const hiddenInput = wrapper.querySelector('input[type="hidden"]');

    if (!display || !optionsDiv || !hiddenInput) return null;

    display.addEventListener('click', (e) => {
        e.stopPropagation();
        
        document.querySelectorAll('.custom-select-options.show').forEach(el => {
            if (el !== optionsDiv) el.classList.remove('show');
        });
        document.querySelectorAll('.custom-select-wrapper.open').forEach(el => {
            if (el !== wrapper) el.classList.remove('open');
        });

        optionsDiv.classList.toggle('show');
        wrapper.classList.toggle('open');
    });

    optionsDiv.addEventListener('click', (e) => {
        const option = e.target.closest('.custom-select-option');
        if (!option) return;
        
        e.stopPropagation();
        const value = option.getAttribute('data-value');
        hiddenInput.value = value;

        display.innerHTML = `${option.innerHTML} <i class="fa-solid fa-chevron-down caret-icon"></i>`;

        optionsDiv.classList.remove('show');
        wrapper.classList.remove('open');

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
            const opt = optionsDiv.querySelector(`.custom-select-option[data-value="${value}"]`);
            if (opt) {
                display.innerHTML = `${opt.innerHTML} <i class="fa-solid fa-chevron-down caret-icon"></i>`;
            } else {
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
export function initCustomTimePicker(id, isOptional = true, onChange = null) {
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
            if (onChange) {
                onChange();
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

export function toggleTaskDropdown(event, id) {
    event.stopPropagation();
    
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
            if (column) column.style.overflow = 'visible';
            
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
            if (column) column.style.overflow = '';
        }
    }
}

window.toggleTaskDropdown = toggleTaskDropdown;

export function initSettings() {
    const form = document.getElementById('settings-form');
    const passForm = document.getElementById('password-form');
    const nameInput = document.getElementById('settings-name');
    const emailInput = document.getElementById('settings-email');
    const clearBtn = document.getElementById('clear-data-btn');
    
    if (!form) return;
    
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    
    if (currentUser) {
        nameInput.value = currentUser.name || '';
        emailInput.value = currentUser.email || '';
        emailInput.disabled = true;
        if (passForm) {
            passForm.style.opacity = '1';
            passForm.style.pointerEvents = 'auto';
            passForm.querySelectorAll('input, button').forEach(el => el.disabled = false);
        }
    } else {
        const guestName = localStorage.getItem('guestName') || 'Guest User';
        nameInput.value = guestName;
        emailInput.value = 'guest@local.device';
        emailInput.disabled = true;
        if (passForm) {
            passForm.style.opacity = '0.5';
            passForm.style.pointerEvents = 'none';
            passForm.querySelectorAll('input, button').forEach(el => el.disabled = true);
        }
    }

    if (settingsInitialized) return;
    settingsInitialized = true;

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

        const dashboardLayout = localStorage.getItem('dashboardLayout') || 'list';
        window.customDashboardLayoutSelect = initCustomSelect('pref-dashboard-layout-wrapper', (val) => {
            localStorage.setItem('dashboardLayout', val);
            const listBtn = document.getElementById('view-list-btn');
            const kanbanBtn = document.getElementById('view-kanban-btn');
            if (listBtn && kanbanBtn) {
                if (val === 'kanban') {
                    listBtn.classList.remove('active');
                    kanbanBtn.classList.add('active');
                } else {
                    listBtn.classList.add('active');
                    kanbanBtn.classList.remove('active');
                }
            }
            displayTasks();
        });
        window.customDashboardLayoutSelect.setValue(dashboardLayout, dashboardLayout === 'kanban' ? 'Kanban Board' : 'Standard List');

        const currentTheme = localStorage.getItem('theme') || 'system';
        const themeCards = document.querySelectorAll('.theme-option-card');
        const themeInput = document.getElementById('pref-theme');

        function setThemeActiveCard(val) {
            themeCards.forEach(card => {
                if (card.getAttribute('data-value') === val) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }
            });
            if (themeInput) {
                themeInput.value = val;
                themeInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        themeCards.forEach(card => {
            card.addEventListener('click', () => {
                const val = card.getAttribute('data-value');
                localStorage.setItem('theme', val);
                applyThemePreference(val);
                setThemeActiveCard(val);
            });
        });

        setThemeActiveCard(currentTheme);
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const newName = nameInput.value.trim();
        const loggedUser = JSON.parse(localStorage.getItem('currentUser'));
        
        if (!loggedUser) {
            localStorage.setItem('guestName', newName);
            document.getElementById('display-username').textContent = newName;
            const dTitle = document.getElementById('dashboard-title');
            if (dTitle) dTitle.textContent = `Hello, ${newName}`;
            showToast('Guest profile updated successfully!', 'success', false);
            return;
        }

        // Use globals injected by the Firebase module script in index.html
        const user = auth ? auth.currentUser : null;
        if (!user) {
            showToast('You must be logged in!', 'error');
            return;
        }
        updateProfile(user, { displayName: newName })
            .then(() => {
                const cachedUser = JSON.parse(localStorage.getItem('currentUser')) || {};
                cachedUser.name = newName;
                localStorage.setItem('currentUser', JSON.stringify(cachedUser));
                document.getElementById('display-username').textContent = newName;
                const dTitle = document.getElementById('dashboard-title');
                if (dTitle) dTitle.textContent = `Hello, ${newName}`;
                showToast('Profile updated successfully!', 'success', false);
            })
            .catch((error) => {
                showToast(error.message, 'error');
            });
    });

    if (passForm) {
        passForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const currentPass = document.getElementById('current-password').value;
            const newPass = document.getElementById('new-password').value;

            // Use globals injected by the Firebase module script in index.html
            const user = auth ? auth.currentUser : null;
            if (!user) {
                showToast('You must be logged in!', 'error');
                return;
            }
            const credential = EmailAuthProvider.credential(user.email, currentPass);
            reauthenticateWithCredential(user, credential)
                .then(() => {
                    return updatePassword(user, newPass);
                })
                .then(() => {
                    passForm.reset();
                    showToast('Password updated securely!', 'success');
                })
                .catch((error) => {
                    console.error(error);
                    if (error.code === 'auth/invalid-credential') {
                        showToast('Current password incorrect!', 'error');
                    } else {
                        showToast(error.message, 'error');
                    }
                });
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            showConfirm('This will permanently delete all your tasks, habits, and events. Are you sure?', () => {
                const currentUser = JSON.parse(localStorage.getItem('currentUser'));
                const currentUserId = currentUser ? currentUser.id : 'guest';
                getTasksFromFirebase().then(async (allItems) => {
                    const userTasks = allItems.filter(t => t.userId === currentUserId);
                    for (const task of userTasks) {
                        await deleteTaskFromFirebase(task.id);
                    }
                    localStorage.removeItem('firebase_tasks_cache');
                    const DB_NAME = 'ProductivityAppDB';
                    const req = indexedDB.deleteDatabase(DB_NAME);
                    req.onsuccess = () => {
                        setTimeout(() => window.location.reload(), 500);
                    };
                    req.onerror = () => {
                        setTimeout(() => window.location.reload(), 500);
                    };
                });
            });
        });
    }
}

export function renderTempSubtasks() {
    const list = document.getElementById('subtasks-list');
    if (!list) return;
    list.innerHTML = '';
    tempSubtasks.forEach((sub, idx) => {
        list.innerHTML += `
            <li style="display:flex; justify-content:space-between; align-items:center; background: var(--item-bg); padding:8px 12px; border: 1px solid var(--border-color); border-radius:8px; font-size:13px;">
                <span style="${sub.completed ? 'text-decoration:line-through; opacity:0.6;' : ''}">${sub.title}</span>
                <i class="fa-solid fa-trash" style="cursor:pointer; color:#FF4D4F; padding:4px;" onclick="removeTempSubtask(${idx})"></i>
            </li>`;
    });
}

export function removeTempSubtask(idx) {
    tempSubtasks.splice(idx, 1);
    renderTempSubtasks();
}

window.removeTempSubtask = removeTempSubtask;

export function initModalLogic() {
    const modal = document.getElementById('task-modal');
    const openBtns = document.querySelectorAll('.open-modal-btn');
    const closeBtn = document.getElementById('close-modal');
    const customFreqRow = document.getElementById('custom-freq-row');
    const specificDaysRow = document.getElementById('specific-days-row');
    const modalDelBtn = document.getElementById('modal-delete-btn');
    const addSubBtn = document.getElementById('add-subtask-btn');
    const subInput = document.getElementById('subtask-input');

    if (!modal) return;

    if (addSubBtn && subInput) {
        addSubBtn.addEventListener('click', () => {
            if (subInput.value.trim()) {
                tempSubtasks.push({ title: subInput.value.trim(), completed: false });
                subInput.value = '';
                renderTempSubtasks();
            }
        });
        subInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addSubBtn.click(); }
        });
    }

    openBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const form = document.getElementById('task-form');
            if (form) form.reset();
            clearLiveDateErrors();
            document.getElementById('edit-item-id').value = ''; 
            document.getElementById('submit-btn').textContent = 'Save Details';
            if (modalDelBtn) modalDelBtn.style.display = 'none'; 
            if (customFreqRow) customFreqRow.style.display = 'none';
            if (specificDaysRow) specificDaysRow.style.display = 'none';
            
            document.getElementById('item-description').value = '';

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

            document.querySelectorAll('.day-toggle input').forEach(cb => cb.checked = false);

            const defaultChoice = document.querySelector('input[name="event-end-choice"][value="date"]');
            if (defaultChoice) {
                defaultChoice.checked = true;
                defaultChoice.dispatchEvent(new Event('change'));
            }
            const durationNumInput = document.getElementById('event-duration-num');
            if (durationNumInput) durationNumInput.value = 60;
            if (window.customEventDurationUnitSelect) {
                window.customEventDurationUnitSelect.setValue('minutes', 'Minutes');
            }

            tempSubtasks = [];
            renderTempSubtasks();
            
            const type = btn.getAttribute('data-type'); 
            openModalUI(type);
        });
    });

    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });

    if (modalDelBtn) {
        modalDelBtn.addEventListener('click', () => {
            const id = document.getElementById('edit-item-id').value;
            if (id) {
                showConfirm('Are you sure you want to delete this?', () => {
                    deleteTaskFromFirebase(id).then(() => {
                        showToast('Deleted successfully', 'success', false); 
                        modal.classList.remove('active');
                        displayTasks();
                        if (window.calendarInstance) window.calendarInstance.refetchEvents();
                    });
                });
            }
        });
    }

    const choiceRadios = document.querySelectorAll('input[name="event-end-choice"]');
    const endDateGroup = document.getElementById('event-end-date-group');
    const endTimeGroup = document.getElementById('event-end-time-group');
    const durationContainer = document.getElementById('event-duration-container');

    choiceRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'duration') {
                if (durationContainer) durationContainer.style.display = 'block';
                if (endDateGroup) endDateGroup.style.display = 'none';
                if (endTimeGroup) endTimeGroup.style.display = 'none';
            } else {
                if (durationContainer) durationContainer.style.display = 'none';
                if (endDateGroup) endDateGroup.style.display = 'block';
                if (endTimeGroup) endTimeGroup.style.display = 'block';
            }
        });
    });

    initFormSubmit(modal);
}

export function openModalUI(type) {
    const modal = document.getElementById('task-modal');
    const modalTitle = document.getElementById('modal-title');
    const itemTypeInput = document.getElementById('item-type');
    const startDateRow = document.getElementById('start-date-row');
    const taskDetailsRow = document.getElementById('task-details-row');
    const deadlineContainer = document.getElementById('deadline-container');
    const eventOnlyElements = document.querySelectorAll('.id-event-only');
    const taskOnlyElements = document.querySelectorAll('.id-task-only');
    const labelTimeStart = document.getElementById('label-time-start');

    if (!modal) return;
    itemTypeInput.value = type;
    
    if (!document.getElementById('task-start-date').value) {
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
        
        const choiceContainer = document.getElementById('event-end-choice-container');
        if (choiceContainer) choiceContainer.style.display = 'block';
        
        const currentChoice = document.querySelector('input[name="event-end-choice"]:checked').value;
        const endDateGroup = document.getElementById('event-end-date-group');
        const endTimeGroup = document.getElementById('event-end-time-group');
        const durationContainer = document.getElementById('event-duration-container');
        
        if (currentChoice === 'duration') {
            if (durationContainer) durationContainer.style.display = 'block';
            if (endDateGroup) endDateGroup.style.display = 'none';
            if (endTimeGroup) endTimeGroup.style.display = 'none';
        } else {
            if (durationContainer) durationContainer.style.display = 'none';
            if (endDateGroup) endDateGroup.style.display = 'block';
            if (endTimeGroup) endTimeGroup.style.display = 'block';
        }
        
        taskOnlyElements.forEach(el => el.style.display = 'none');
        
        if (!document.getElementById('event-end-date').value) {
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
        
        if (window.customFrequencySelect && window.customFrequencySelect.getValue() === 'none') {
            window.customFrequencySelect.setValue('daily', 'Daily');
        }
    }
    modal.classList.add('active');
}

export function editItem(id) {
    getTasksFromFirebase().then(tasks => {
        const item = tasks.find(t => String(t.id) === String(id));
        if (!item) return;

        const form = document.getElementById('task-form');
        if (form) form.reset();
        clearLiveDateErrors();
        document.getElementById('edit-item-id').value = item.id;
        document.getElementById('submit-btn').textContent = 'Update Details';
        document.getElementById('modal-delete-btn').style.display = 'block'; 

        document.getElementById('task-title').value = item.title;
        document.getElementById('task-start-date').value = item.startDate;
        
        document.getElementById('item-description').value = item.description || '';
        
        if (window.timePickerStart) {
            window.timePickerStart.setValue24h(item.startTime || '');
        }
        
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
                    cb.checked = item.specificDays && item.specificDays.includes(parseInt(cb.value, 10));
                });
            }
            document.getElementById('times-per-day').value = item.timesPerDay || 1;
        } else {
            document.getElementById('times-per-day').value = item.timesPerDay || 1;
        }

        if (item.type === 'task') {
            if (item.dueDate) document.getElementById('task-due-date').value = item.dueDate;
            if (window.timePickerDue) {
                window.timePickerDue.setValue24h(item.dueTime || '');
            }
            
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

        const detailsModal = document.getElementById('details-modal');
        if (detailsModal) detailsModal.classList.remove('active');

        openModalUI(item.type);
    });
}

window.editItem = editItem;

export function initFormSubmit(modal) {
    const form = document.getElementById('task-form');
    if (!form) return;
    // Guard: only attach the submit listener once even if initFormSubmit is called again.
    if (form.dataset.listenerAttached) return;
    form.dataset.listenerAttached = 'true';

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const submitBtn = document.getElementById('submit-btn');
        if (submitBtn.disabled) return;
        
        submitBtn.disabled = true;
        const originalBtnText = submitBtn.textContent;
        submitBtn.textContent = 'Saving...';

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

        dataItem.timesPerDay = parseInt(document.getElementById('times-per-day').value, 10) || 1;
        
        if (frequency === 'custom') {
            dataItem.customNum = parseInt(document.getElementById('custom-freq-num').value, 10) || 1;
            dataItem.customUnit = window.customFreqUnitSelect ? window.customFreqUnitSelect.getValue() : 'days';
            
            if (dataItem.customUnit === 'weeks') {
                const selectedDays = Array.from(document.querySelectorAll('.day-toggle input:checked')).map(cb => parseInt(cb.value, 10));
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
            if (dueDate) {
                const startDateTime = new Date(`${startDate}T${startTime || '00:00'}`);
                const dueDateTime = new Date(`${dueDate}T${dueTime || '23:59'}`);
                if (dueDateTime < startDateTime) {
                    showToast('Deadline cannot be before start time!', 'error');
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                    return;
                }
            }
            dataItem.dueDate = dueDate || null;
            dataItem.dueTime = dueTime || null;
            dataItem.priority = window.customPrioritySelect ? window.customPrioritySelect.getValue() : 'medium';
            dataItem.subtasks = [...tempSubtasks]; 
        } else if (type === 'event') {
            const eventEndChoice = document.querySelector('input[name="event-end-choice"]:checked').value;
            let endDate = '';
            let endTime = null;

            if (eventEndChoice === 'duration') {
                const durationNum = parseInt(document.getElementById('event-duration-num').value, 10) || 60;
                const durationUnit = document.getElementById('event-duration-unit').value || 'minutes';
                
                const startDateTimeStr = `${startDate}T${startTime || '00:00'}`;
                const startDateTime = new Date(startDateTimeStr);
                const endDateTime = new Date(startDateTime.getTime());
                
                if (durationUnit === 'minutes') {
                    endDateTime.setMinutes(endDateTime.getMinutes() + durationNum);
                } else if (durationUnit === 'hours') {
                    endDateTime.setHours(endDateTime.getHours() + durationNum);
                } else if (durationUnit === 'days') {
                    endDateTime.setDate(endDateTime.getDate() + durationNum);
                } else if (durationUnit === 'weeks') {
                    endDateTime.setDate(endDateTime.getDate() + (durationNum * 7));
                } else if (durationUnit === 'months') {
                    endDateTime.setMonth(endDateTime.getMonth() + durationNum);
                } else if (durationUnit === 'years') {
                    endDateTime.setFullYear(endDateTime.getFullYear() + durationNum);
                }
                
                const ey = endDateTime.getFullYear();
                const em = String(endDateTime.getMonth() + 1).padStart(2, '0');
                const ed = String(endDateTime.getDate()).padStart(2, '0');
                endDate = `${ey}-${em}-${ed}`;
                
                const eh = String(endDateTime.getHours()).padStart(2, '0');
                const emin = String(endDateTime.getMinutes()).padStart(2, '0');
                endTime = `${eh}:${emin}`;
            } else {
                endDate = document.getElementById('event-end-date').value;
                endTime = document.getElementById('event-end-time').value;
                
                const startFull = new Date(`${startDate}T${startTime || '00:00'}`);
                const endFull = new Date(`${endDate}T${endTime || '00:00'}`);
                if (startFull > endFull) {
                    showToast('End time cannot be before start time!', 'error');
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalBtnText;
                    return;
                }
            }
            dataItem.endDate = endDate;
            dataItem.endTime = endTime || null;
            dataItem.priority = 'medium'; 
        } else if (type === 'habit') {
            dataItem.priority = 'medium';
        }

        getTasksFromFirebase().then(allItems => {
            const originalItem = allItems.find(t => String(t.id) === String(editId));
            if (originalItem) {
                if (originalItem.completedDates) {
                    dataItem.completedDates = originalItem.completedDates;
                }
                if (originalItem.createdAt) {
                    dataItem.createdAt = originalItem.createdAt;
                }
            } else {
                if (type === 'habit') {
                    dataItem.completedDates = [];
                }
            }

            if (editId) {
                dataItem.id = editId;
            } else {
                dataItem.createdAt = new Date().getTime();
            }

            saveTaskToFirebase(dataItem).then(() => {
                finishSubmit(editId ? 'Updated successfully!' : 'Saved successfully!', false);
            }).catch(e => {
                console.error(e);
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
                showToast('Failed to save task: ' + e.message, 'error');
            });
        });

        function finishSubmit(msg, playAudioFlag) {
            form.reset();
            document.getElementById('edit-item-id').value = '';
            modal.classList.remove('active');
            showToast(msg, 'success', playAudioFlag);
            displayTasks();
            if (window.calendarInstance) window.calendarInstance.refetchEvents();
            
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Details';
        }
    });
}

export function clearLiveDateErrors() {
    const dueDateInput = document.getElementById('task-due-date');
    if (dueDateInput) {
        dueDateInput.style.border = '';
        dueDateInput.style.boxShadow = '';
        const err = dueDateInput.parentElement.querySelector('.live-date-error');
        if (err) err.remove();
    }
}

export function isHabitScheduledOnDay(item, dateObj) {
    if (item.type !== 'habit') return false;
    const freq = item.frequency;
    if (freq === 'daily') return true;
    if (freq === 'custom') {
        const unit = item.customUnit;
        if (unit === 'days') {
            const start = new Date(item.startDate);
            start.setHours(0,0,0,0);
            const target = new Date(dateObj);
            target.setHours(0,0,0,0);
            const diffTime = target - start;
            if (diffTime < 0) return false;
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            return (diffDays % (item.customNum || 1)) === 0;
        }
        if (unit === 'weeks') {
            const dayOfWeek = dateObj.getDay();
            if (item.specificDays && item.specificDays.includes(dayOfWeek)) {
                const start = new Date(item.startDate);
                start.setHours(0,0,0,0);
                const target = new Date(dateObj);
                target.setHours(0,0,0,0);
                
                const startSun = new Date(start);
                startSun.setDate(start.getDate() - start.getDay());
                const targetSun = new Date(target);
                targetSun.setDate(target.getDate() - target.getDay());
                
                const diffTime = targetSun - startSun;
                if (diffTime < 0) return false;
                const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));
                return (diffWeeks % (item.customNum || 1)) === 0;
            }
            return false;
        }
        if (unit === 'months') {
            const start = new Date(item.startDate);
            const target = new Date(dateObj);
            if (target < start) return false;
            if (target.getDate() !== start.getDate()) return false;
            
            const diffMonths = (target.getFullYear() - start.getFullYear()) * 12 + (target.getMonth() - start.getMonth());
            return (diffMonths % (item.customNum || 1)) === 0;
        }
    }
    
    if (freq === 'weekly') {
        const start = new Date(item.startDate);
        return dateObj.getDay() === start.getDay();
    }
    if (freq === 'monthly') {
        const start = new Date(item.startDate);
        return dateObj.getDate() === start.getDate();
    }
    if (freq === 'yearly') {
        const start = new Date(item.startDate);
        return dateObj.getDate() === start.getDate() && dateObj.getMonth() === start.getMonth();
    }
    
    return true;
}

window._habitCalendarOffset = window._habitCalendarOffset || new Map();
export function shiftHabitCalendar(itemId, delta) {
    const current = window._habitCalendarOffset.get(itemId) || 0;
    window._habitCalendarOffset.set(itemId, current + delta);
    displayTasks();
}

window.shiftHabitCalendar = shiftHabitCalendar;

export function renderTaskCard(item, { isHistory = false, showHabitCalendar = true, showSubtasks = true } = {}) {
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

    let habitCalendarHTML = '';
    if (item.type === 'habit' && showHabitCalendar && !isHistory) {
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const offset = (window._habitCalendarOffset && window._habitCalendarOffset.get(item.id)) || 0;
        
        const curDate = new Date();
        const targetDate = new Date(curDate.getFullYear(), curDate.getMonth() + offset, 1);
        const curYear = targetDate.getFullYear();
        const curMonth = targetDate.getMonth();
        const daysInMonth = new Date(curYear, curMonth + 1, 0).getDate();
        const monthTitle = `${monthNames[curMonth]} ${curYear}`;
        
        const firstDayIndex = new Date(curYear, curMonth, 1).getDay(); 
        
        const cDate = new Date(item.createdAt || Date.now());
        const cYear = cDate.getFullYear();
        const cMonth = cDate.getMonth();
        const cDay = cDate.getDate();
        
        let gridHTML = '';
        
        const dayInitials = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        dayInitials.forEach(initial => {
            gridHTML += `<div class="day-initial">${initial}</div>`;
        });
        
        const renderDayHelper = (y, m, d, isOtherMonth) => {
            const dayDateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            let dayClass = 'day-circle';
            if (isOtherMonth) dayClass += ' other-month';
            let dayContent = `${d}`;

            const dDate = new Date(y, m, d);
            const isBeforeCreation = (y < cYear) || 
                                     (y === cYear && m < cMonth) || 
                                     (y === cYear && m === cMonth && d < cDay);
                                     
            const isFuture = (y > curDate.getFullYear()) ||
                             (y === curDate.getFullYear() && m > curDate.getMonth()) ||
                             (y === curDate.getFullYear() && m === curDate.getMonth() && d > curDate.getDate());
                             
            const isScheduled = isHabitScheduledOnDay(item, dDate);
            const isToday = y === curDate.getFullYear() && m === curDate.getMonth() && d === curDate.getDate();

            if (isBeforeCreation) {
                dayClass += ' untouched';
            } else if (isFuture) {
                dayClass += ' future';
                if (isScheduled) {
                    dayClass += ' scheduled';
                }
            } else {
                const isChecked = item.completedDates && item.completedDates.includes(dayDateStr);
                const isSkipped = item.skippedDates && item.skippedDates.includes(dayDateStr);
                if (isChecked) {
                    dayClass += ' checked';
                    dayContent = '<i class="fa-solid fa-check"></i>';
                } else if (isSkipped) {
                    dayClass += ' skipped';
                    dayContent = '<i class="fa-solid fa-ban"></i>';
                } else if (isToday && isScheduled) {
                    dayClass += ' today-scheduled';
                    dayContent = `${d}`;
                } else {
                    dayClass += ' unchecked';
                    dayContent = '<i class="fa-solid fa-xmark"></i>';
                }
            }

            const clickAttr = (!isBeforeCreation && !isFuture) ? `onclick="toggleHabitDay(event, '${item.id}', '${dayDateStr}')"` : '';
            return `<div class="${dayClass}" title="${dayDateStr}" ${clickAttr}>${dayContent}</div>`;
        };

        // 1. Previous month days
        const prevMonthDate = new Date(curYear, curMonth, 0);
        const prevMonthYear = prevMonthDate.getFullYear();
        const prevMonth = prevMonthDate.getMonth();
        const daysInPrevMonth = prevMonthDate.getDate();

        for (let s = firstDayIndex - 1; s >= 0; s--) {
            const prevD = daysInPrevMonth - s;
            gridHTML += renderDayHelper(prevMonthYear, prevMonth, prevD, true);
        }

        // 2. Current month days
        for (let d = 1; d <= daysInMonth; d++) {
            gridHTML += renderDayHelper(curYear, curMonth, d, false);
        }

        // 3. Next month days
        const nextMonthDate = new Date(curYear, curMonth + 1, 1);
        const nextMonthYear = nextMonthDate.getFullYear();
        const nextMonth = nextMonthDate.getMonth();
        const remainingCells = 42 - (firstDayIndex + daysInMonth);
        for (let nextD = 1; nextD <= remainingCells; nextD++) {
            gridHTML += renderDayHelper(nextMonthYear, nextMonth, nextD, true);
        }
        
        const minOffset = (cYear - curDate.getFullYear()) * 12 + (cMonth - curDate.getMonth());
        const maxOffset = 1;
        const prevDisabled = offset <= minOffset ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : '';
        const nextDisabled = offset >= maxOffset ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : '';

        habitCalendarHTML = `
            <div class="habit-calendar-wrapper" onclick="event.stopPropagation();">
                <div class="habit-calendar-header" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <button class="habit-nav-btn" onclick="shiftHabitCalendar('${item.id}', -1)" ${prevDisabled} style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 4px; display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-chevron-left"></i></button>
                        <span class="habit-calendar-title" style="font-weight: 600; min-width: 100px; text-align: center; color: var(--text-main); font-size: 14px;">${monthTitle}</span>
                        <button class="habit-nav-btn" onclick="shiftHabitCalendar('${item.id}', 1)" ${nextDisabled} style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; padding: 2px 6px; border-radius: 4px; display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-chevron-right"></i></button>
                    </div>
                    <div class="habit-calendar-legend" style="margin-left: auto;">
                        <div class="legend-item"><span class="legend-dot checked"></span> Done</div>
                        <div class="legend-item"><span class="legend-dot skipped"></span> Skipped</div>
                        <div class="legend-item"><span class="legend-dot unchecked"></span> Missed</div>
                    </div>
                </div>
                <div class="habit-calendar-grid">
                    ${gridHTML}
                </div>
            </div>
        `;
    }

    let subtasksHTML = '';
    if (item.subtasks && item.subtasks.length > 0 && showSubtasks && !isHistory) {
        subtasksHTML = '<div class="subtasks-wrapper">';
        item.subtasks.forEach((sub, idx) => {
            subtasksHTML += `
                <div class="subtask-item ${sub.completed ? 'completed' : ''}">
                    <input type="checkbox" class="subtask-checkbox" ${sub.completed ? 'checked' : ''} onchange="toggleSubtask('${item.id}', ${idx}, ${sub.completed})">
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
            <button onclick="restoreItem('${item.id}')" class="btn-icon btn-edit" title="Restore"><i class="fa-solid fa-rotate-left"></i></button>
            <button onclick="deleteItem('${item.id}')" class="btn-icon btn-delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
        `;
        dropdownItems = `
            <button class="dropdown-item" onclick="restoreItem('${item.id}')"><i class="fa-solid fa-rotate-left"></i> Restore</button>
            <button class="dropdown-item danger" onclick="deleteItem('${item.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
        `;
    } else {
        let cancelBtnDesktop = (!item.isCompleted && !item.isCancelled && item.type !== 'habit') ? `<button onclick="cancelItem('${item.id}')" class="btn-icon btn-cancel" title="Mark as Won't Do"><i class="fa-solid fa-ban"></i></button>` : '';
        let cancelBtnMobile = (!item.isCompleted && !item.isCancelled && item.type !== 'habit') ? `<button class="dropdown-item" onclick="cancelItem('${item.id}')"><i class="fa-solid fa-ban"></i> Won't Do</button>` : '';
        
        actionButtons = `
            <button onclick="editItem('${item.id}')" class="btn-icon btn-edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
            ${cancelBtnDesktop}
            <button onclick="deleteItem('${item.id}')" class="btn-icon btn-delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
        `;
        dropdownItems = `
            <button class="dropdown-item" onclick="editItem('${item.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
            ${cancelBtnMobile}
            <button class="dropdown-item danger" onclick="deleteItem('${item.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
        `;
    }

    let checkboxHTML = isHistory ? '' : `<input type="checkbox" class="custom-checkbox" ${item.isCompleted ? 'checked' : ''} ${item.isCancelled ? 'disabled' : ''} onchange="toggleItemComplete('${item.id}', ${item.isCompleted})">`;

    let dueInfo = '';
    if (item.dueDate) {
        dueInfo = ` <span style="font-size:11px; color:#FF4D4F; margin-left: 8px; font-weight: 500;"><i class="fa-regular fa-calendar-xmark"></i> Due: ${item.dueDate}${item.dueTime ? ' ' + formatTaskTimeDisplay(item.dueTime) : ''}</span>`;
    }

    return `
        <div class="task-wrapper type-${item.type}" onclick="showItemDetails('${item.id}')">
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
                        <button class="btn-menu" onclick="toggleTaskDropdown(event, '${item.id}')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                        <div class="task-dropdown" id="dropdown-${item.id}">
                            ${dropdownItems}
                        </div>
                    </div>
                </div>
            </div>
            ${subtasksHTML ? `<span onclick="event.stopPropagation();">${subtasksHTML}</span>` : ''}
            ${habitCalendarHTML || ''}
        </div>
    `;
}

export function displayTasks() {
    const habitsContainer = document.getElementById('habits-container');
    const historyContainer = document.getElementById('history-tasks');
    const pomodoroSelect = document.getElementById('pomodoro-task-select');
    const pomodoroBtn = document.getElementById('pomodoro-mark-done');

    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const currentUserId = currentUser ? currentUser.id : 'guest';

    getTasksFromFirebase().then(allItems => {
        const items = allItems.filter(item => item.userId === currentUserId);
        window.allUserItemsList = items; 
        
        if (habitsContainer) habitsContainer.innerHTML = '';
        if (historyContainer) historyContainer.innerHTML = '';

        const todayStr = getTodayStr();
        const now = new Date();
        const currentDayOfWeek = now.getDay();
        const nowMs = Date.now();

        const tasks = items.filter(i => (i.type === 'task' || !i.type) && !i.isDeleted);
        const habits = items.filter(i => i.type === 'habit' && !i.isDeleted);

        window.activeTasksList = tasks.filter(t => !t.isCompleted && !t.isCancelled).sort((a, b) => b.createdAt - a.createdAt);
        window.allActiveItemsList = items.filter(t => (!t.isCompleted || t.type === 'habit' || (t.frequency && t.frequency !== 'none')) && !t.isCancelled && !t.isDeleted);
        
        window.allActiveItemsList = items.filter(t => (!t.isCompleted || t.type === 'habit' || (t.frequency && t.frequency !== 'none')) && !t.isCancelled && !t.isDeleted);

        habits.forEach(h => {
            h.isCompleted = !!(h.completedDates && h.completedDates.includes(todayStr));
        });
        const activeHabits = habits.sort((a, b) => b.createdAt - a.createdAt);
        const historyItems = items.filter(t => (t.isCompleted || t.isCancelled || t.isDeleted) && t.type !== 'habit').sort((a, b) => b.createdAt - a.createdAt);

        const repeatingHistoryItems = [];
        tasks.forEach(t => {
            const hasRepeat = t.frequency && t.frequency !== 'none';
            if (hasRepeat && t.completedDates) {
                t.completedDates.forEach(dateStr => {
                    repeatingHistoryItems.push({
                        ...t,
                        id: t.id + '_completed_' + dateStr, 
                        isCompleted: true,
                        completedAtDate: dateStr, 
                        title: t.title + ` (Completed ${dateStr})`,
                        startDate: dateStr,
                        dueDate: null, 
                        isVirtualOccurrence: true,
                        originalTaskId: t.id
                    });
                });
            }
        });

        const combinedHistoryItems = [...historyItems, ...repeatingHistoryItems].sort((a, b) => b.createdAt - a.createdAt);

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
        if (historyContainer && combinedHistoryItems.length === 0) historyContainer.innerHTML = '<p class="empty-state">No completed or cancelled items yet.</p>';

        if (habitsContainer) {
            habitsContainer.innerHTML = activeHabits.map(t => renderTaskCard(t, { isHistory: false, showHabitCalendar: true, showSubtasks: true })).join('');
        }
        if (historyContainer) {
            historyContainer.innerHTML = combinedHistoryItems.map(t => renderTaskCard(t, { isHistory: true, showHabitCalendar: false, showSubtasks: false })).join('');
        }

        sortAndRenderDashboard();
        // Note: window.sortAndRenderDashboard is also assigned once at module level
        // below; the assignment here is kept for timing safety on first load.
    });
}

export function sortAndRenderDashboard() {
    const container = document.getElementById('dashboard-view-container');
    if (!container) return;

    const now = new Date();
    let fingerprint = `${window.currentTaskFilter || 'all'}:${window.currentTaskSort || 'default'}|`;
    (window.activeTasksList || []).forEach(item => {
        let startInstant = item.startDate ? parseLocalISOString(item.startDate, item.startTime || '00:00') : now;
        let dueInstant = item.dueDate ? parseLocalISOString(item.dueDate, item.dueTime || '23:59') : null;
        let cat = "current";
        if (dueInstant && dueInstant < now) cat = "overdue";
        else if (startInstant > now) cat = "upcoming";
        fingerprint += `${item.id}:${cat}|`;
    });
    window.lastDashboardFingerprint = fingerprint;

    const board = container.querySelector('.kanban-board');
    const savedScrollLeft = board ? board.scrollLeft : 0;
    
    const columns = container.querySelectorAll('.kanban-column');
    const savedScrollTops = Array.from(columns).map(col => col.scrollTop);

    const upcomingTasks = [];
    const currentTasks = [];
    const overdueTasks = [];

    let filteredTasks = [...(window.activeTasksList || [])];

    const filterVal = window.currentTaskFilter || 'all';
    if (filterVal !== 'all') {
        const todayStr = now.toLocaleDateString('sv'); 
        
        const tomorrow = new Date();
        tomorrow.setDate(now.getDate() + 1);
        const tomorrowStr = tomorrow.toLocaleDateString('sv');
        
        const getWeekBounds = (d) => {
            const start = new Date(d);
            const day = start.getDay();
            const diff = start.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(start.setDate(diff));
            monday.setHours(0,0,0,0);
            
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            sunday.setHours(23,59,59,999);
            return { start: monday, end: sunday };
        };
        const weekBounds = getWeekBounds(now);

        filteredTasks = filteredTasks.filter(item => {
            let startInstant = item.startDate ? parseLocalISOString(item.startDate, item.startTime || '00:00') : now;
            let dueInstant = item.dueDate ? parseLocalISOString(item.dueDate, item.dueTime || '23:59') : null;
            
            const isOverdue = dueInstant && dueInstant < now;
            const isUpcoming = startInstant > now;
            const isCurrent = !isOverdue && !isUpcoming;
            
            if (isOverdue || isCurrent) {
                return true;
            }

            const targetDateStr = item.dueDate || item.startDate;
            if (!targetDateStr) return false;
            
            if (filterVal === 'today') {
                return targetDateStr === todayStr;
            }
            if (filterVal === 'tomorrow') {
                return targetDateStr === tomorrowStr;
            }
            if (filterVal === 'week') {
                const tDate = new Date(targetDateStr);
                tDate.setHours(0,0,0,0);
                return tDate >= weekBounds.start && tDate <= weekBounds.end;
            }
            if (filterVal === 'month') {
                const tDate = new Date(targetDateStr);
                return tDate.getFullYear() === now.getFullYear() && tDate.getMonth() === now.getMonth();
            }
            if (filterVal === 'year') {
                const tDate = new Date(targetDateStr);
                return tDate.getFullYear() === now.getFullYear();
            }
            if (filterVal === 'custom') {
                if (!window.customFilterStartDate || !window.customFilterEndDate) return true;
                return targetDateStr >= window.customFilterStartDate && targetDateStr <= window.customFilterEndDate;
            }
            return true;
        });
    }

    const sortVal = window.currentTaskSort || 'default';
    if (sortVal === 'a-z') {
        filteredTasks.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortVal === 'z-a') {
        filteredTasks.sort((a, b) => b.title.localeCompare(a.title));
    } else if (sortVal === 'priority') {
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        filteredTasks.sort((a, b) => {
            const weightA = priorityWeight[a.priority] || 2;
            const weightB = priorityWeight[b.priority] || 2;
            return weightB - weightA;
        });
    } else if (sortVal === 'time') {
        filteredTasks.sort((a, b) => {
            const timeA = new Date(`${a.startDate}T${a.startTime || '00:00'}`).getTime();
            const timeB = new Date(`${b.startDate}T${b.startTime || '00:00'}`).getTime();
            return timeA - timeB;
        });
    }

    filteredTasks.forEach(item => {
        let startInstant = item.startDate ? parseLocalISOString(item.startDate, item.startTime || '00:00') : now;
        let dueInstant = item.dueDate ? parseLocalISOString(item.dueDate, item.dueTime || '23:59') : null;

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

        html += `
            <div class="kanban-column" style="border-top: 3px solid #FF4D4F;">
                <div class="dashboard-view-header">
                    <span class="dashboard-view-title" style="color: #FF4D4F; font-size: 13.5px;"><i class="fa-solid fa-circle-exclamation"></i> Overdue</span>
                    <span class="dashboard-view-count badge-overdue">${overdueTasks.length}</span>
                </div>
                <div class="tasks-container">
                    ${overdueTasks.length === 0 ? '<p class="empty-state" style="padding:16px 0; font-size:12px;">No overdue tasks</p>' : overdueTasks.map(t => renderTaskCard(t, { isHistory: false, showHabitCalendar: false, showSubtasks: false })).join('')}
                </div>
            </div>
        `;

        html += `
            <div class="kanban-column" style="border-top: 3px solid var(--color-ticktick-blue);">
                <div class="dashboard-view-header">
                    <span class="dashboard-view-title" style="color: var(--color-ticktick-blue); font-size: 13.5px;"><i class="fa-solid fa-play"></i> Current</span>
                    <span class="dashboard-view-count badge-current">${currentTasks.length}</span>
                </div>
                <div class="tasks-container">
                    ${currentTasks.length === 0 ? '<p class="empty-state" style="padding:16px 0; font-size:12px;">No current tasks</p>' : currentTasks.map(t => renderTaskCard(t, { isHistory: false, showHabitCalendar: false, showSubtasks: false })).join('')}
                </div>
            </div>
        `;

        html += `
            <div class="kanban-column" style="border-top: 3px solid #73D13D;">
                <div class="dashboard-view-header">
                    <span class="dashboard-view-title" style="color: #73D13D; font-size: 13.5px;"><i class="fa-solid fa-forward"></i> Upcoming</span>
                    <span class="dashboard-view-count badge-upcoming">${upcomingTasks.length}</span>
                </div>
                <div class="tasks-container">
                    ${upcomingTasks.length === 0 ? '<p class="empty-state" style="padding:16px 0; font-size:12px;">No upcoming tasks</p>' : upcomingTasks.map(t => renderTaskCard(t, { isHistory: false, showHabitCalendar: false, showSubtasks: false })).join('')}
                </div>
            </div>
        `;

        html += '</div>';

        if (container.innerHTML !== html) {
            container.innerHTML = html;

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
                        <span class="dashboard-view-count badge-overdue">${overdueTasks.length}</span>
                    </div>
                    <div class="tasks-container">
                        ${overdueTasks.map(t => renderTaskCard(t, { isHistory: false, showHabitCalendar: false, showSubtasks: false })).join('')}
                    </div>
                </div>
            `;
        }

        html += `
            <div class="tasks-list-card">
                <div class="dashboard-view-header">
                    <span class="dashboard-view-title" style="color: var(--color-ticktick-blue);"><i class="fa-solid fa-play"></i> Current Tasks</span>
                    <span class="dashboard-view-count badge-current">${currentTasks.length}</span>
                </div>
                <div class="tasks-container">
                    ${currentTasks.length === 0 ? '<p class="empty-state">No current tasks active.</p>' : currentTasks.map(t => renderTaskCard(t, { isHistory: false, showHabitCalendar: false, showSubtasks: false })).join('')}
                </div>
            </div>
        `;

        html += `
            <div class="tasks-list-card">
                <div class="dashboard-view-header">
                    <span class="dashboard-view-title" style="color: #73D13D;"><i class="fa-solid fa-forward"></i> Upcoming Tasks</span>
                    <span class="dashboard-view-count badge-upcoming">${upcomingTasks.length}</span>
                </div>
                <div class="tasks-container">
                    ${upcomingTasks.length === 0 ? '<p class="empty-state">No upcoming tasks scheduled.</p>' : upcomingTasks.map(t => renderTaskCard(t, { isHistory: false, showHabitCalendar: false, showSubtasks: false })).join('')}
                </div>
            </div>
        `;

        html += '</div>';

        if (container.innerHTML !== html) {
            container.innerHTML = html;
        }
    }
}

window.sortAndRenderDashboard = sortAndRenderDashboard;

export function cancelItem(id) {
    showConfirm('Mark this task as "Won\'t Do"?', () => {
        getTasksFromFirebase().then(tasks => {
            const item = tasks.find(t => String(t.id) === String(id));
            if (item) {
                item.isCancelled = true;
                item.isCompleted = false; 
                saveTaskToFirebase(item).then(() => {
                    if (scheduleItemNotifications) {
                        scheduleItemNotifications(item);
                    }
                    showToast('Task marked as Won\'t Do', 'info', false);
                    displayTasks();
                    if (window.calendarInstance) window.calendarInstance.refetchEvents();
                });
            }
        });
    });
}

window.cancelItem = cancelItem;

export function restoreItem(id) {
    if (String(id).includes('_completed_')) {
        const [originalId, completedDate] = id.split('_completed_');
        getTasksFromFirebase().then(tasks => {
            const item = tasks.find(t => String(t.id) === String(originalId));
            if (item && item.completedDates) {
                item.completedDates = item.completedDates.filter(d => d !== completedDate);
                
                if (completedDate < item.startDate) {
                    const currentStart = new Date(item.startDate);
                    const restoredStart = new Date(completedDate);
                    const diffTime = currentStart - restoredStart;
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                    
                    item.startDate = completedDate;
                    
                    if (item.dueDate) {
                        const currentDue = new Date(item.dueDate);
                        const restoredDue = new Date(currentDue);
                        restoredDue.setDate(restoredDue.getDate() - diffDays);
                        
                        const dy = restoredDue.getFullYear();
                        const dm = String(restoredDue.getMonth() + 1).padStart(2, '0');
                        const dd = String(restoredDue.getDate()).padStart(2, '0');
                        item.dueDate = `${dy}-${dm}-${dd}`;
                    }
                }

                saveTaskToFirebase(item).then(() => {
                    showToast('Occurrence restored!', 'info', false);
                    displayTasks();
                    if (window.calendarInstance) window.calendarInstance.refetchEvents();
                });
            }
        });
        return;
    }

    getTasksFromFirebase().then(tasks => {
        const item = tasks.find(t => String(t.id) === String(id));
        if (item) {
            item.isCompleted = false;
            item.isCancelled = false;
            item.isDeleted = false;
            item.completedCount = 0;
            saveTaskToFirebase(item).then(() => {
                if (scheduleItemNotifications) {
                    scheduleItemNotifications(item);
                }
                showToast('Task restored!', 'info', false);
                displayTasks();
                if (window.calendarInstance) window.calendarInstance.refetchEvents();
            });
        }
    });
}

window.restoreItem = restoreItem;

export function deleteItem(id) {
    if (String(id).includes('_completed_')) {
        const [originalId, completedDate] = id.split('_completed_');
        showConfirm('Permanently delete this occurrence from history?', () => {
            getTasksFromFirebase().then(tasks => {
                const item = tasks.find(t => String(t.id) === String(originalId));
                if (item && item.completedDates) {
                    item.completedDates = item.completedDates.filter(d => d !== completedDate);
                    saveTaskToFirebase(item).then(() => {
                        showToast('Occurrence deleted', 'success', false);
                        displayTasks();
                        if (window.calendarInstance) window.calendarInstance.refetchEvents();
                    });
                }
            });
        });
        return;
    }

    getTasksFromFirebase().then(tasks => {
        const item = tasks.find(t => String(t.id) === String(id));
        if (!item) return;
        
        if (item.isCompleted || item.isCancelled || item.isDeleted) {
            showConfirm('Permanently delete this item from history?', () => {
                deleteTaskFromFirebase(id).then(() => {
                    showToast('Permanently deleted', 'success', false);
                    displayTasks();
                    if (window.calendarInstance) window.calendarInstance.refetchEvents();
                });
            });
        } else {
            showConfirm('Are you sure you want to delete this task?', () => {
                item.isDeleted = true;
                item.isCompleted = false;
                item.isCancelled = false;
                saveTaskToFirebase(item).then(() => {
                    if (scheduleItemNotifications) {
                        scheduleItemNotifications(item);
                    }
                    showToast('Task moved to history', 'success', false);
                    displayTasks();
                    if (window.calendarInstance) window.calendarInstance.refetchEvents();
                });
            });
        }
    });
}

window.deleteItem = deleteItem;

export function toggleItemComplete(id, currentStatus) {
    getTasksFromFirebase().then(tasks => {
        const item = tasks.find(t => String(t.id) === String(id));
        if (!item) return;

        const todayStr = getTodayStr();

        const hasRepeat = item.frequency && item.frequency !== 'none';

        if (item.type === 'habit') {
            if (!item.completedDates) item.completedDates = [];
            const idx = item.completedDates.indexOf(todayStr);
            if (idx > -1) {
                item.completedDates.splice(idx, 1);
                item.isCompleted = false;
                item.completedCount = 0;
            } else {
                item.completedDates.push(todayStr);
                item.isCompleted = true;
                item.completedCount = 1;
                showToast('Awesome! Marked as complete.', 'success', true);
            }
        } else if (hasRepeat) {
            if (!item.completedDates) item.completedDates = [];
            
            if (!item.completedDates.includes(item.startDate)) {
                item.completedDates.push(item.startDate);
            }

            import('./notifications.js').then(module => {
                let nextStart = module.getNextOccurrenceTime(
                    item.startDate,
                    item.startTime || '09:00',
                    item.frequency,
                    item.specificDays,
                    item.customNum,
                    item.customUnit,
                    false
                );

                if (!nextStart) {
                    nextStart = new Date(item.startDate);
                    nextStart.setDate(nextStart.getDate() + 1);
                }

                const ny = nextStart.getFullYear();
                const nm = String(nextStart.getMonth() + 1).padStart(2, '0');
                const nd = String(nextStart.getDate()).padStart(2, '0');
                const nextStartDateStr = `${ny}-${nm}-${nd}`;

                if (item.dueDate) {
                    const currentStart = new Date(item.startDate);
                    const currentDue = new Date(item.dueDate);
                    const diffTime = currentDue - currentStart;
                    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

                    const nextDue = new Date(nextStart);
                    nextDue.setDate(nextDue.getDate() + diffDays);
                    
                    const dy = nextDue.getFullYear();
                    const dm = String(nextDue.getMonth() + 1).padStart(2, '0');
                    const dd = String(nextDue.getDate()).padStart(2, '0');
                    item.dueDate = `${dy}-${dm}-${dd}`;
                }

                item.startDate = nextStartDateStr;
                item.isCompleted = false; 
                item.completedCount = 0;
                item.lastCompletedDate = todayStr;
                showToast('Awesome! Marked as complete.', 'success', true);

                saveTaskToFirebase(item).then(() => {
                    if (scheduleItemNotifications) {
                        scheduleItemNotifications(item);
                    }
                    displayTasks();
                    if (window.calendarInstance) window.calendarInstance.refetchEvents();
                    
                    const pomSelect = document.getElementById('pomodoro-task-select');
                    if (pomSelect && pomSelect.value == id && item.isCompleted) {
                        pomSelect.value = '';
                        document.getElementById('pomodoro-mark-done').style.display = 'none';
                    }
                });
            });
            return;
        } else {
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
                item.isCompleted = false;
                item.completedCount = 0;
            }
        }

        saveTaskToFirebase(item).then(() => {
            displayTasks();
            if (window.calendarInstance) window.calendarInstance.refetchEvents();
            
            const pomSelect = document.getElementById('pomodoro-task-select');
            if (pomSelect && pomSelect.value == id && item.isCompleted) {
                pomSelect.value = '';
                document.getElementById('pomodoro-mark-done').style.display = 'none';
            }
        });
    });
}

window.toggleItemComplete = toggleItemComplete;

export function toggleHabitDay(event, id, dateStr) {
    if (event) event.stopPropagation();
    getTasksFromFirebase().then(tasks => {
        const item = tasks.find(t => String(t.id) === String(id));
        if (!item) return;
        
        if (!item.completedDates) item.completedDates = [];
        if (!item.skippedDates) item.skippedDates = [];
        
        const doneIdx = item.completedDates.indexOf(dateStr);
        const skippedIdx = item.skippedDates.indexOf(dateStr);
        
        if (doneIdx === -1 && skippedIdx === -1) {
            item.completedDates.push(dateStr);
            playSound('check');
        } else if (doneIdx > -1) {
            item.completedDates.splice(doneIdx, 1);
            item.skippedDates.push(dateStr);
        } else if (skippedIdx > -1) {
            item.skippedDates.splice(skippedIdx, 1);
        }
        
        const todayStr = getTodayStr();
        
        item.isCompleted = item.completedDates.includes(todayStr);
        item.completedCount = item.isCompleted ? 1 : 0;
        
        saveTaskToFirebase(item).then(() => {
            displayTasks();
            if (window.calendarInstance) window.calendarInstance.refetchEvents();
        });
    });
}

window.toggleHabitDay = toggleHabitDay;

export function toggleSubtask(taskId, subIdx, currentStatus) {
    getTasksFromFirebase().then(tasks => {
        const item = tasks.find(t => String(t.id) === String(taskId));
        if (item && item.subtasks) {
            item.subtasks[subIdx].completed = !currentStatus;
            if (!currentStatus) playSound('check');
            saveTaskToFirebase(item).then(() => displayTasks());
        }
    });
}

window.toggleSubtask = toggleSubtask;

// NOTE: getColor is defined in utils.js (returns #FF4D4F high, #2F7BF6 low, #FFA940 medium).
// The duplicate that was here has been removed. All callers in this file use the
// global function from utils.js which is bundled first.

export function showItemDetails(id) {
    getTasksFromFirebase().then(tasks => {
        const item = tasks.find(t => String(t.id) === String(id));
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

        let descHTML = '';
        if (item.description) {
            descHTML = `
                <div class="details-block">
                    <span class="details-block-label">Description / Notes</span>
                    <div class="details-description-box">${item.description}</div>
                </div>
            `;
        }

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
                        <input type="checkbox" class="custom-checkbox" ${sub.completed ? 'checked' : ''} onchange="toggleSubtaskInDetails('${item.id}', ${idx}, ${sub.completed})">
                        <span class="details-subtask-text">${sub.title}</span>
                    </li>
                `;
            });
            subtasksHTML += `
                    </ul>
                </div>
            `;
        }

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

        let cancelBtn = (!item.isCompleted && !item.isCancelled && item.type !== 'habit');

        let desktopHTML = `
            <button class="btn btn-secondary" title="Delete" style="color: #FF4D4F; border-color: #FF4D4F33; background: #FF4D4F11;" onclick="deleteItemInDetails('${item.id}')"><i class="fa-solid fa-trash"></i></button>
            ${cancelBtn ? `<button class="btn btn-secondary" title="Won't Do" onclick="cancelItemInDetails('${item.id}')"><i class="fa-solid fa-ban"></i></button>` : ''}
            <button class="btn btn-primary" title="Edit" onclick="editItem('${item.id}')"><i class="fa-solid fa-pen"></i></button>
        `;

        if (!item.isCompleted && !item.isCancelled) {
            if (item.type === 'habit') {
                let count = item.completedCount || 0;
                desktopHTML += `<button class="btn btn-secondary" title="Won't Do Today" onclick="skipHabitInDetails('${item.id}')"><i class="fa-solid fa-ban"></i></button>`;
                desktopHTML += `<button class="btn btn-primary" title="Log Progress (${count}/${item.timesPerDay})" onclick="logHabitInDetails('${item.id}')"><i class="fa-solid fa-check"></i></button>`;
            } else {
                desktopHTML += `<button class="btn btn-primary" style="background-color:#73D13D; border-color:#73D13D;" title="Complete" onclick="completeItemInDetails('${item.id}')"><i class="fa-solid fa-check"></i></button>`;
            }
        } else {
            desktopHTML += `<button class="btn btn-secondary" title="Restore" onclick="restoreItemInDetails('${item.id}')"><i class="fa-solid fa-rotate-left"></i></button>`;
        }

        let mobileHTML = `
            <button class="details-kebab-option" onclick="editItem('${item.id}')"><i class="fa-solid fa-pen"></i> Edit</button>
        `;
        if (cancelBtn) {
            mobileHTML += `<button class="details-kebab-option" onclick="cancelItemInDetails('${item.id}')"><i class="fa-solid fa-ban"></i> Won't Do</button>`;
        }
        if (!item.isCompleted && !item.isCancelled) {
            if (item.type === 'habit') {
                let count = item.completedCount || 0;
                mobileHTML += `<button class="details-kebab-option" onclick="skipHabitInDetails('${item.id}')"><i class="fa-solid fa-ban"></i> Won't Do Today</button>`;
                mobileHTML += `<button class="details-kebab-option" onclick="logHabitInDetails('${item.id}')"><i class="fa-solid fa-check"></i> Log Progress (${count}/${item.timesPerDay})</button>`;
            } else {
                mobileHTML += `<button class="details-kebab-option" onclick="completeItemInDetails('${item.id}')"><i class="fa-solid fa-check"></i> Complete</button>`;
            }
        } else {
            mobileHTML += `<button class="details-kebab-option" onclick="restoreItemInDetails('${item.id}')"><i class="fa-solid fa-rotate-left"></i> Restore</button>`;
        }
        mobileHTML += `
            <button class="details-kebab-option delete" onclick="deleteItemInDetails('${item.id}')"><i class="fa-solid fa-trash"></i> Delete</button>
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

        // Kebab close handler — remove any previous listener and register a fresh one
        // so we don't accumulate stale listeners on `document` across multiple opens.
        if (_detailsKebabCloseHandler) {
            document.removeEventListener('click', _detailsKebabCloseHandler);
        }
        _detailsKebabCloseHandler = () => {
            if (mobileDropdown) mobileDropdown.classList.remove('show');
        };
        document.addEventListener('click', _detailsKebabCloseHandler);

        const closeDetailsBtn = document.getElementById('close-details-modal');
        if (closeDetailsBtn) {
            closeDetailsBtn.onclick = () => {
                modal.classList.remove('active');
                document.removeEventListener('click', _detailsKebabCloseHandler);
                _detailsKebabCloseHandler = null;
            };
        }

        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                document.removeEventListener('click', _detailsKebabCloseHandler);
                _detailsKebabCloseHandler = null;
            }
        };

        modal.classList.add('active');
    });
}

window.showItemDetails = showItemDetails;

export function toggleSubtaskInDetails(itemId, subIdx, currentStatus) {
    getTasksFromFirebase().then(tasks => {
        const item = tasks.find(t => String(t.id) === String(itemId));
        if (item && item.subtasks) {
            item.subtasks[subIdx].completed = !currentStatus;
            if (!currentStatus) playSound('check');
            saveTaskToFirebase(item).then(() => {
                displayTasks();
                showItemDetails(itemId); 
            });
        }
    });
}

window.toggleSubtaskInDetails = toggleSubtaskInDetails;

export function completeItemInDetails(id) {
    toggleItemComplete(id, false);
    document.getElementById('details-modal').classList.remove('active');
}

window.completeItemInDetails = completeItemInDetails;

export function logHabitInDetails(id) {
    toggleItemComplete(id, false);
    setTimeout(() => showItemDetails(id), 100);
}

window.logHabitInDetails = logHabitInDetails;

export function skipHabitInDetails(id) {
    getTasksFromFirebase().then(tasks => {
        const item = tasks.find(t => String(t.id) === String(id));
        if (!item) return;
        
        const todayStr = getTodayStr();
        if (!item.skippedDates) item.skippedDates = [];
        if (!item.completedDates) item.completedDates = [];
        
        const skippedIdx = item.skippedDates.indexOf(todayStr);
        const completedIdx = item.completedDates.indexOf(todayStr);
        
        if (skippedIdx > -1) {
            item.skippedDates.splice(skippedIdx, 1);
        } else {
            item.skippedDates.push(todayStr);
            if (completedIdx > -1) {
                item.completedDates.splice(completedIdx, 1);
            }
        }
        
        item.isCompleted = item.completedDates.includes(todayStr);
        item.completedCount = item.isCompleted ? 1 : 0;
        
        saveTaskToFirebase(item).then(() => {
            displayTasks();
            if (window.calendarInstance) window.calendarInstance.refetchEvents();
            showItemDetails(id);
        });
    });
}

window.skipHabitInDetails = skipHabitInDetails;

export function restoreItemInDetails(id) {
    restoreItem(id);
    document.getElementById('details-modal').classList.remove('active');
}

window.restoreItemInDetails = restoreItemInDetails;

export function cancelItemInDetails(id) {
    cancelItem(id);
    document.getElementById('details-modal').classList.remove('active');
}

window.cancelItemInDetails = cancelItemInDetails;

export function deleteItemInDetails(id) {
    deleteItem(id);
    document.getElementById('details-modal').classList.remove('active');
}

window.deleteItemInDetails = deleteItemInDetails;

export function renderStatsPage() {
    const container = document.getElementById('stats-container');
    if (!container) return;

    const items = window.allUserItemsList || [];

    const tasks = items.filter(i => (i.type === 'task' || !i.type) && !i.isDeleted);
    const habits = items.filter(i => i.type === 'habit' && !i.isDeleted);
    const events = items.filter(i => i.type === 'event' && !i.isDeleted);

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.isCompleted).length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const nowStr = new Date().toISOString().split('T')[0];
    const overdueTasks = tasks.filter(t => {
        if (t.isCompleted || t.isCancelled) return false;
        if (!t.dueDate) return false;
        return t.dueDate < nowStr;
    }).length;

    const todayStr = new Date().toLocaleDateString('sv'); 
    const todayTasks = tasks.filter(t => t.startDate === todayStr).length;
    const todayEvents = events.filter(e => e.startDate === todayStr).length;
    const todayCount = todayTasks + todayEvents;

    const focusMinutes = parseInt(localStorage.getItem('totalFocusMinutes') || '0', 10);
    const hours = Math.floor(focusMinutes / 60);
    const mins = focusMinutes % 60;
    const focusDisplay = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    const habitStreaks = habits.map(h => {
        const completedDates = h.completedDates || [];
        if (completedDates.length === 0) return { name: h.title, current: 0, longest: 0 };

        const sortedDates = [...new Set(completedDates)].sort();
        
        let longest = 0;
        let tempStreak = 0;
        let lastDate = null;

        for (let i = 0; i < sortedDates.length; i++) {
            const cur = new Date(sortedDates[i]);
            cur.setHours(0,0,0,0);
            
            if (lastDate === null) {
                tempStreak = 1;
            } else {
                const diffTime = cur - lastDate;
                const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays === 1) {
                    tempStreak++;
                } else if (diffDays > 1) {
                    if (tempStreak > longest) longest = tempStreak;
                    tempStreak = 1;
                }
            }
            lastDate = cur;
        }
        if (tempStreak > longest) longest = tempStreak;

        let currentStreak = 0;
        if (sortedDates.length > 0) {
            const latestDateStr = sortedDates[sortedDates.length - 1];
            const latestDate = new Date(latestDateStr);
            latestDate.setHours(0,0,0,0);
            
            const today = new Date();
            today.setHours(0,0,0,0);
            
            const diffTime = today - latestDate;
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0 || diffDays === 1) {
                let count = 0;
                let checkDate = new Date(latestDate);
                while (true) {
                    const checkStr = checkDate.toISOString().split('T')[0];
                    if (completedDates.includes(checkStr)) {
                        count++;
                        checkDate.setDate(checkDate.getDate() - 1);
                    } else {
                        break;
                    }
                }
                currentStreak = count;
            }
        }

        return {
            name: h.title,
            current: currentStreak,
            longest: longest
        };
    });

    habitStreaks.sort((a, b) => b.current - a.current);

    let habitsListHTML = '';
    if (habitStreaks.length > 0) {
        habitsListHTML = habitStreaks.map(s => `
            <div class="stat-habit-row" style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--item-bg); border-radius: 12px; margin-bottom: 8px; border: 1px solid var(--border-color);">
                <div style="font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-fire" style="color: #FFA940;"></i> ${s.name}
                </div>
                <div style="display: flex; gap: 16px; font-size: 13.5px;">
                    <span style="color: var(--text-muted);">Current: <strong style="color: var(--color-ticktick-blue);">${s.current} days</strong></span>
                    <span style="color: var(--text-muted);">Longest: <strong style="color: #FFA940;">${s.longest} days</strong></span>
                </div>
            </div>
        `).join('');
    } else {
        habitsListHTML = `<div style="text-align: center; color: var(--text-muted); padding: 16px;">No habits defined yet. Start tracking to build streaks!</div>`;
    }

    container.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px;">
            <div class="card stat-card" style="text-align: center; display: flex; flex-direction: column; justify-content: center; padding: 20px; border-radius: 16px; position: relative; overflow: hidden; background: linear-gradient(135deg, var(--item-bg), var(--bg-notion-sidebar)); border: 1px solid var(--border-color);">
                <div style="font-size: 28px; color: #52C41A; margin-bottom: 8px;"><i class="fa-solid fa-circle-check"></i></div>
                <div style="font-size: 24px; font-weight: 700; color: var(--text-main);">${completedTasks}</div>
                <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Tasks Completed</div>
            </div>

            <div class="card stat-card" style="text-align: center; display: flex; flex-direction: column; justify-content: center; padding: 20px; border-radius: 16px; position: relative; overflow: hidden; background: linear-gradient(135deg, var(--item-bg), var(--bg-notion-sidebar)); border: 1px solid var(--border-color);">
                <div style="font-size: 28px; color: #FF4D4F; margin-bottom: 8px;"><i class="fa-solid fa-triangle-exclamation"></i></div>
                <div style="font-size: 24px; font-weight: 700; color: var(--text-main);">${overdueTasks}</div>
                <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Overdue Tasks</div>
            </div>

            <div class="card stat-card" style="text-align: center; display: flex; flex-direction: column; justify-content: center; padding: 20px; border-radius: 16px; position: relative; overflow: hidden; background: linear-gradient(135deg, var(--item-bg), var(--bg-notion-sidebar)); border: 1px solid var(--border-color);">
                <div style="font-size: 28px; color: var(--color-ticktick-blue); margin-bottom: 8px;"><i class="fa-regular fa-calendar-check"></i></div>
                <div style="font-size: 24px; font-weight: 700; color: var(--text-main);">${todayCount}</div>
                <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Today's Schedule</div>
            </div>

            <div class="card stat-card" style="text-align: center; display: flex; flex-direction: column; justify-content: center; padding: 20px; border-radius: 16px; position: relative; overflow: hidden; background: linear-gradient(135deg, var(--item-bg), var(--bg-notion-sidebar)); border: 1px solid var(--border-color);">
                <div style="font-size: 28px; color: #FFA940; margin-bottom: 8px;"><i class="fa-solid fa-stopwatch"></i></div>
                <div style="font-size: 24px; font-weight: 700; color: var(--text-main);">${focusDisplay}</div>
                <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Focus Time</div>
            </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 20px; width: 100%;">
            <div class="card" style="padding: 24px; border-radius: 16px; background: var(--item-bg); border: 1px solid var(--border-color); display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%;">
                <h3 style="margin-bottom: 20px; font-size: 16px; font-weight: 600; color: var(--text-main); align-self: flex-start;">Task Completion Rate</h3>
                <div style="position: relative; width: 140px; height: 140px; display: flex; align-items: center; justify-content: center;">
                    <svg width="140" height="140" style="transform: rotate(-90deg);">
                        <circle cx="70" cy="70" r="55" stroke="var(--border-color)" stroke-width="10" fill="transparent" />
                        <circle cx="70" cy="70" r="55" stroke="var(--color-ticktick-blue)" stroke-width="10" fill="transparent"
                                stroke-dasharray="345.5" stroke-dashoffset="${345.5 - (345.5 * completionRate / 100)}"
                                style="transition: stroke-dashoffset 0.8s ease-in-out;" />
                    </svg>
                    <div style="position: absolute; font-size: 24px; font-weight: 700; color: var(--text-main);">${completionRate}%</div>
                </div>
                <div style="margin-top: 16px; font-size: 14px; color: var(--text-muted); text-align: center;">
                    You completed <strong style="color: var(--text-main);">${completedTasks}</strong> out of <strong style="color: var(--text-main);">${totalTasks}</strong> total tasks assigned.
                </div>
            </div>

            <div class="card" style="padding: 24px; border-radius: 16px; background: var(--item-bg); border: 1px solid var(--border-color); width: 100%;">
                <h3 style="margin-bottom: 20px; font-size: 16px; font-weight: 600; color: var(--text-main);">Habit Streaks</h3>
                <div class="stats-habits-list">
                    ${habitsListHTML}
                </div>
            </div>
        </div>
    `;
}

window.renderStatsPage = renderStatsPage;
window.initSettings = initSettings;

window.addEventListener('flowtick-data-changed', () => {
    displayTasks();
});
