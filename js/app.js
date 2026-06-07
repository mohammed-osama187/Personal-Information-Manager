import { initAuth } from './auth.js';
import { initMissedNotificationsUI } from './notifications.js';
import { 
    initCustomSelect, 
    initCustomTimePicker, 
    displayTasks, 
    initModalLogic, 
    initSettings,
    clearLiveDateErrors 
} from './ui.js';
import { initPomodoroDrag } from './timer.js';
import { initCalendar } from './calendar.js';
import { syncOfflineQueue } from './db.js';
import { parseLocalISOString, applyThemePreference } from './utils.js';

// Immediate synchronous routing check to eliminate auth screen page flash
(function() {
    const currentUser = localStorage.getItem('currentUser');
    const isGuestMode = localStorage.getItem('isGuestMode') === 'true';
    const authScreen = document.getElementById('auth-screen');
    const appScreen = document.getElementById('app-screen');
    if (authScreen && appScreen) {
        if (currentUser || isGuestMode) {
            authScreen.style.display = 'none';
            appScreen.style.display = 'flex';
        } else {
            authScreen.style.display = 'flex';
            appScreen.style.display = 'none';
        }
    }
})();

function initSidebar() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const menuItems = document.querySelectorAll('.menu-item');

    if (!hamburgerBtn || !sidebar || !overlay) return;

    function toggleSidebar() { sidebar.classList.toggle('active'); overlay.classList.toggle('active'); }
    function closeSidebar() { sidebar.classList.remove('active'); overlay.classList.remove('active'); }

    hamburgerBtn.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', closeSidebar);
    menuItems.forEach(item => item.addEventListener('click', closeSidebar));
}

window.navHistory = ['tasks-page'];

export function navigateToPage(targetPage, pushToHistory = true) {
    const menuItems = document.querySelectorAll('.menu-item');
    const pages = document.querySelectorAll('.page-section');

    // 1. Update menu items active class
    menuItems.forEach(item => {
        if (item.getAttribute('data-target') === targetPage) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // 2. Update page sections active class
    pages.forEach(p => {
        if (p.getAttribute('id') === targetPage) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });

    // 3. Update active page title
    const activePageTitle = document.getElementById('active-page-title');
    if (activePageTitle) {
        const pageTitles = {
            'tasks-page': 'Tasks',
            'habits-page': 'Habits',
            'calendar-page': 'Calendar',
            'history-page': 'History',
            'pomodoro-page': 'Focus Timer',
            'stats-page': 'Stats',
            'settings-page': 'Settings',
            'about-page': 'About Us'
        };
        activePageTitle.textContent = pageTitles[targetPage] || 'FlowTick';
    }

    // 4. Trigger target page actions
    if (targetPage === 'calendar-page' && window.calendarInstance) {
        setTimeout(() => window.calendarInstance.updateSize(), 100);
    }
    if (targetPage === 'stats-page') {
        if (typeof window.renderStatsPage === 'function') {
            window.renderStatsPage();
        }
    }

    // 5. Track history
    if (pushToHistory) {
        const currentTop = window.navHistory[window.navHistory.length - 1];
        if (currentTop !== targetPage) {
            window.navHistory.push(targetPage);
        }
    }
}
window.navigateToPage = navigateToPage;

function initRouter() {
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetPage = item.getAttribute('data-target');
            if (targetPage) {
                navigateToPage(targetPage, true);
            }
        });
    });
}

function initBackButtonHandler() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
        window.Capacitor.Plugins.App.addListener('backButton', () => {
            // 1. Close sidebar overlay if active
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            if (sidebar && sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
                overlay.classList.remove('active');
                return;
            }

            // 2. Close active modals
            const activeModals = document.querySelectorAll('.modal.active');
            if (activeModals.length > 0) {
                activeModals.forEach(modal => modal.classList.remove('active'));
                return;
            }

            // 3. Go back in history
            if (window.navHistory && window.navHistory.length > 1) {
                window.navHistory.pop(); // Pop current page
                const prevPage = window.navHistory[window.navHistory.length - 1];
                navigateToPage(prevPage, false);
                return;
            }

            // 4. Default native exit
            window.Capacitor.Plugins.App.exitApp();
        });
    }
}

async function requestBatteryOptimization() {
    if (window.Capacitor && typeof window.Capacitor.getPlatform === 'function' && window.Capacitor.getPlatform() === 'android') {
        const prompted = localStorage.getItem('battery_prompted');
        if (!prompted) {
            localStorage.setItem('battery_prompted', 'true');
            const pkg = 'com.flowtick.app'; 
            window.location.href = `intent://#Intent;action=android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS;package=${pkg};end`;
        }
    }
}

function checkIfDashboardNeedsUpdate() {
    if (!window.activeTasksList || window.activeTasksList.length === 0) return false;
    
    const now = new Date();
    let fingerprint = "";
    
    window.activeTasksList.forEach(item => {
        let startInstant = item.startDate ? parseLocalISOString(item.startDate, item.startTime || '00:00') : new Date();
        let dueInstant = item.dueDate ? parseLocalISOString(item.dueDate, item.dueTime || '23:59') : null;

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

function initDatabase() {
    displayTasks();
    initCalendar();

    // Poll until the Firebase globals are injected by the <script type="module"> in index.html.
    // `db` is declared as a global var in bundle.js and populated by that inline module.
    const checkFb = setInterval(() => {
        if (db) {
            clearInterval(checkFb);
            displayTasks();
            syncOfflineQueue();
            if (window.calendarInstance) {
                window.calendarInstance.refetchEvents();
            }
        }
    }, 100);
}

// Global click handler to close dropdowns and custom menus
document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-select-wrapper')) {
        document.querySelectorAll('.custom-select-options.show').forEach(el => el.classList.remove('show'));
        document.querySelectorAll('.custom-select-wrapper.open').forEach(el => el.classList.remove('open'));
    }
    document.querySelectorAll('.task-dropdown.show').forEach(el => {
        el.classList.remove('show');
        const col = el.closest('.kanban-column');
        if (col) col.style.overflow = '';
    });
});

document.addEventListener('DOMContentLoaded', () => {
    initAuth(); 
    applyThemePreference(localStorage.getItem('theme') || 'system');
    initSidebar();
    initRouter();
    initBackButtonHandler();
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

    window.customEventDurationUnitSelect = initCustomSelect('event-duration-unit-wrapper');

    window.currentTaskFilter = 'all';
    window.currentTaskSort = 'default';
    window.customFilterStartDate = '';
    window.customFilterEndDate = '';

    // Task filtering setup
    const filterBtns = document.querySelectorAll('.btn-filter');

    function syncFilterUI() {
        filterBtns.forEach(btn => {
            const isCustom = btn.getAttribute('data-filter') === 'custom';
            if (btn.getAttribute('data-filter') === window.currentTaskFilter) {
                btn.classList.add('active');
                if (isCustom && window.customFilterStartDate && window.customFilterEndDate) {
                    btn.textContent = `Custom (${window.customFilterStartDate} - ${window.customFilterEndDate})`;
                }
            } else {
                btn.classList.remove('active');
                if (isCustom) {
                    btn.textContent = 'Custom';
                }
            }
        });

        if (window.customTaskFilterSelect) {
            const labelMap = {
                all: 'All Tasks',
                today: 'Today',
                tomorrow: 'Tomorrow',
                week: 'This Week',
                month: 'This Month',
                year: 'This Year',
                custom: 'Custom Range'
            };
            window.customTaskFilterSelect.setValue(window.currentTaskFilter, labelMap[window.currentTaskFilter] || 'All Tasks');
            
            if (window.currentTaskFilter === 'custom' && window.customFilterStartDate && window.customFilterEndDate) {
                const displayEl = document.getElementById('task-filter-display');
                if (displayEl) {
                    displayEl.innerHTML = `<span style="font-size:11px;">${window.customFilterStartDate} - ${window.customFilterEndDate}</span> <i class="fa-solid fa-chevron-down caret-icon"></i>`;
                }
            }
        }
    }

    const customFilterModal = document.getElementById('custom-filter-modal');
    const closeCustomFilterModalBtn = document.getElementById('close-custom-filter-modal');
    const customFilterCancelBtn = document.getElementById('custom-filter-cancel');
    const customFilterForm = document.getElementById('custom-filter-form');
    const filterStartDateInput = document.getElementById('filter-start-date');
    const filterEndDateInput = document.getElementById('filter-end-date');
    const customFilterError = document.getElementById('custom-filter-error');

    function openCustomFilterModal() {
        if (customFilterModal) {
            filterStartDateInput.value = window.customFilterStartDate || new Date().toISOString().split('T')[0];
            filterEndDateInput.value = window.customFilterEndDate || new Date().toISOString().split('T')[0];
            customFilterError.style.display = 'none';
            customFilterModal.classList.add('active');
        }
    }

    function closeCustomFilterModal() {
        if (customFilterModal) {
            customFilterModal.classList.remove('active');
            syncFilterUI();
        }
    }

    if (closeCustomFilterModalBtn) {
        closeCustomFilterModalBtn.addEventListener('click', closeCustomFilterModal);
    }
    if (customFilterCancelBtn) {
        customFilterCancelBtn.addEventListener('click', closeCustomFilterModal);
    }

    if (customFilterForm) {
        customFilterForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const startVal = filterStartDateInput.value;
            const endVal = filterEndDateInput.value;

            if (startVal && endVal && endVal < startVal) {
                customFilterError.style.display = 'block';
                return;
            }

            window.customFilterStartDate = startVal;
            window.customFilterEndDate = endVal;
            window.currentTaskFilter = 'custom';
            
            customFilterModal.classList.remove('active');
            syncFilterUI();
            
            if (typeof window.sortAndRenderDashboard === 'function') {
                window.sortAndRenderDashboard();
            }
        });
    }

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetFilter = btn.getAttribute('data-filter');
            if (targetFilter === 'custom') {
                openCustomFilterModal();
                return;
            }
            window.currentTaskFilter = targetFilter;
            syncFilterUI();

            if (typeof window.sortAndRenderDashboard === 'function') {
                window.sortAndRenderDashboard();
            }
        });
    });

    window.customTaskFilterSelect = initCustomSelect('task-filter-wrapper', (val) => {
        if (val === 'custom') {
            openCustomFilterModal();
            return;
        }
        window.currentTaskFilter = val || 'all';
        syncFilterUI();

        if (typeof window.sortAndRenderDashboard === 'function') {
            window.sortAndRenderDashboard();
        }
    });

    window.customTaskSortSelect = initCustomSelect('task-sort-wrapper', (val) => {
        window.currentTaskSort = val || 'default';
        if (typeof window.sortAndRenderDashboard === 'function') {
            window.sortAndRenderDashboard();
        }
    });

    // Date/deadline range checker
    const startDateInput = document.getElementById('task-start-date');
    const dueDateInput = document.getElementById('task-due-date');
    
    function validateDates() {
        if (!startDateInput || !dueDateInput) return;
        const startDateVal = startDateInput.value;
        const dueDateVal = dueDateInput.value;
        
        const existingError = dueDateInput.parentElement.querySelector('.live-date-error');
        if (existingError) {
            existingError.remove();
        }
        dueDateInput.style.border = '';
        dueDateInput.style.boxShadow = '';
        
        if (startDateVal && dueDateVal) {
            const startTimeVal = window.timePickerStart ? window.timePickerStart.getValue() : '';
            const dueTimeVal = window.timePickerDue ? window.timePickerDue.getValue() : '';
            
            const startDateTime = new Date(`${startDateVal}T${startTimeVal || '00:00'}`);
            const dueDateTime = new Date(`${dueDateVal}T${dueTimeVal || '23:59'}`);
            
            if (dueDateTime < startDateTime) {
                dueDateInput.style.border = '2px solid #FF4D4F';
                dueDateInput.style.boxShadow = '0 0 8px rgba(255, 77, 79, 0.2)';
                
                const errMsg = document.createElement('div');
                errMsg.className = 'live-date-error';
                errMsg.style.color = '#FF4D4F';
                errMsg.style.fontSize = '12px';
                errMsg.style.marginTop = '6px';
                errMsg.style.fontWeight = '500';
                errMsg.style.display = 'flex';
                errMsg.style.alignItems = 'center';
                errMsg.style.gap = '4px';
                errMsg.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Deadline can\'t be before start time';
                dueDateInput.parentElement.appendChild(errMsg);
                
                dueDateInput.style.backgroundColor = 'rgba(255, 77, 79, 0.08)';
                setTimeout(() => {
                    dueDateInput.style.backgroundColor = '';
                }, 800);
            }
        }
    }

    window.timePickerStart = initCustomTimePicker('time-picker-start', true, () => {
        validateDates();
    });
    window.timePickerEnd = initCustomTimePicker('time-picker-end', true);
    
    window.timePickerDue = initCustomTimePicker('time-picker-due', true, () => {
        if (dueDateInput && !dueDateInput.value && window.timePickerDue.getValue()) {
            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            dueDateInput.value = `${year}-${month}-${day}`;
        }
        validateDates();
    });

    if (startDateInput && dueDateInput) {
        startDateInput.addEventListener('change', validateDates);
        dueDateInput.addEventListener('change', validateDates);
    }

    initPomodoroDrag();
    initModalLogic();

    const listBtn = document.getElementById('view-list-btn');
    const kanbanBtn = document.getElementById('view-kanban-btn');
    
    function setDashboardLayout(layout) {
        localStorage.setItem('dashboardLayout', layout);
        if (listBtn && kanbanBtn) {
            if (layout === 'kanban') {
                listBtn.classList.remove('active');
                kanbanBtn.classList.add('active');
            } else {
                listBtn.classList.add('active');
                kanbanBtn.classList.remove('active');
            }
        }
        if (window.customDashboardLayoutSelect) {
            window.customDashboardLayoutSelect.setValue(layout, layout === 'kanban' ? 'Kanban Board' : 'Standard List');
        }
        displayTasks();
    }

    if (listBtn && kanbanBtn) {
        listBtn.addEventListener('click', () => setDashboardLayout('list'));
        kanbanBtn.addEventListener('click', () => setDashboardLayout('kanban'));
    }

    const initialLayout = localStorage.getItem('dashboardLayout') || 'list';
    setDashboardLayout(initialLayout);
    initSettings();
    initMissedNotificationsUI();
    requestBatteryOptimization();

    // Every 60 s, re-sort the already-loaded task list so tasks move between
    // "current" / "overdue" / "upcoming" columns as time passes.
    // We call sortAndRenderDashboard() rather than displayTasks() to avoid
    // an unnecessary Firebase round-trip for a pure time-based re-categorisation.
    setInterval(() => {
        if (checkIfDashboardNeedsUpdate() && typeof window.sortAndRenderDashboard === 'function') {
            window.sortAndRenderDashboard();
        }
    }, 60000);
});