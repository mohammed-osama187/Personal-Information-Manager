import { getTasksFromFirebase } from './db.js';
import { parseLocalDate, formatLocalDate, getColor } from './utils.js';
import { showItemDetails } from './ui.js';

export function initCalendar() {
    const calendarEl = document.getElementById('calendar-placeholder');
    if (!calendarEl) return;

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        direction: 'ltr',
        height: 'auto', 
        stickyHeaderDates: false,
        headerToolbar: { 
            left: 'prev,next today', 
            center: 'title', 
            right: 'dayGridMonth,timeGridWeek,timeGridDay' 
        },
        buttonText: { 
            today: 'Today', 
            month: 'Month', 
            week: 'Week', 
            day: 'Day' 
        },
        eventClick: function(info) { 
            if (info.event.id) showItemDetails(info.event.id); 
        },
        events: function(info, successCallback, failureCallback) {
            const currentUser = JSON.parse(localStorage.getItem('currentUser'));
            const currentUserId = currentUser ? currentUser.id : 'guest';

            const prefs = JSON.parse(localStorage.getItem('calendarPreferences')) || {
                showTasks: true,
                showEvents: true,
                showHabits: true
            };

            getTasksFromFirebase().then(items => {
                const allEvents = [];
                items.forEach(item => {
                    if (item.userId !== currentUserId) return; 
                    if (item.isDeleted || item.isCancelled) return; 

                    const isTask = (item.type === 'task' || !item.type);
                    const isEvent = (item.type === 'event');
                    const isHabit = (item.type === 'habit');

                    if (isTask && !prefs.showTasks) return;
                    if (isEvent && !prefs.showEvents) return;
                    if (isHabit && !prefs.showHabits) return;

                    let color = getColor(item.priority);
                    if (isEvent) color = 'var(--color-ticktick-blue)';
                    else if (isHabit) color = '#FFA940';
                    
                    let className = item.isCompleted ? 'completed-event' : '';
                    if (item.isCancelled) className = 'cancelled-event';
                    
                    const hasRepeat = item.frequency && item.frequency !== 'none';
                    
                    if (hasRepeat) {
                        let currDate = parseLocalDate(item.startDate);
                        let limitDate = new Date(currDate);
                        limitDate.setMonth(limitDate.getMonth() + 3);
                        if (item.dueDate) {
                            const dueLimit = parseLocalDate(item.dueDate);
                            if (dueLimit < limitDate) {
                                limitDate = dueLimit;
                            }
                        }
                        
                        const startZeroDate = parseLocalDate(item.startDate);
                        
                        while (currDate <= limitDate) {
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
                                    const startSunday = new Date(startZeroDate);
                                    startSunday.setDate(startSunday.getDate() - startSunday.getDay());
                                    const currSunday = new Date(currDate);
                                    currSunday.setDate(currSunday.getDate() - currSunday.getDay());
                                    const diffTime = Math.abs(currSunday - startSunday);
                                    const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));
                                    
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
                                let dateStr = formatLocalDate(currDate);
                                let eventStart = dateStr + (item.startTime ? 'T' + item.startTime : '');
                                allEvents.push({ 
                                    id: item.id, 
                                    title: item.title, 
                                    start: eventStart, 
                                    color: color, 
                                    className: className, 
                                    allDay: !item.startTime 
                                });
                            }
                            currDate.setDate(currDate.getDate() + 1);
                        }
                    } else if (isTask && item.dueDate && item.dueDate !== item.startDate) {
                        let currDate = parseLocalDate(item.startDate);
                        let endDateObj = parseLocalDate(item.dueDate);
                        while (currDate <= endDateObj) {
                            let dateStr = formatLocalDate(currDate);
                            let eventStart = dateStr + (item.startTime ? 'T' + item.startTime : '');
                            allEvents.push({ 
                                id: item.id, 
                                title: item.title, 
                                start: eventStart, 
                                color: color, 
                                className: className, 
                                allDay: !item.startTime 
                            });
                            currDate.setDate(currDate.getDate() + 1);
                        }
                    } else if (item.type === 'event' && item.endDate && item.endDate !== item.startDate) {
                        let currDate = parseLocalDate(item.startDate);
                        let endDateObj = parseLocalDate(item.endDate);
                        while (currDate <= endDateObj) {
                            let dateStr = formatLocalDate(currDate);
                            let eventStart = dateStr + (item.startTime ? 'T' + item.startTime : '');
                            let eventEnd = item.endTime ? dateStr + 'T' + item.endTime : null;
                            allEvents.push({ 
                                id: item.id, 
                                title: item.title, 
                                start: eventStart, 
                                end: eventEnd, 
                                color: color, 
                                className: className 
                            });
                            currDate.setDate(currDate.getDate() + 1);
                        }
                    } else {
                        let startStr = item.startDate + (item.startTime ? 'T' + item.startTime : '');
                        let endStr = (item.type === 'event' && item.endDate) ? item.endDate + (item.endTime ? 'T' + item.endTime : '') : null;
                        allEvents.push({ 
                            id: item.id, 
                            title: item.title, 
                            start: startStr, 
                            end: endStr, 
                            color: color, 
                            className: className 
                        });
                    }
                });
                successCallback(allEvents);
            });
        }
    });

    calendar.render();
    window.calendarInstance = calendar;
}
