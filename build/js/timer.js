import { playSound, showToast } from './utils.js';
import { 
    cancelMobileNotification, 
    scheduleMobileNotification, 
    updateMobileTimerNotification 
} from './notifications.js';

let sessionMinutes = 25;
let timeLeft = 25 * 60;
let timerInterval = null;
let isRunning = false;
let isWorkSession = true;
const ARC_LENGTH = 471.24; 

export function initPomodoroDrag() {
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

    if (taskSelect && taskDoneBtn) {
        taskSelect.addEventListener('change', (e) => {
            taskDoneBtn.style.display = e.target.value ? 'block' : 'none';
        });
        taskDoneBtn.addEventListener('click', () => {
            if (taskSelect.value) {
                import('./ui.js').then(module => {
                    module.toggleItemComplete(taskSelect.value, false);
                });
            }
        });
    }

    function updateKnobByMinutes(minutes) {
        if (isRunning) return;
        sessionMinutes = Math.max(5, Math.min(120, minutes));
        let fraction = (sessionMinutes - 5) / 115;
        let angleDeg = 135 + (fraction * 270);
        let angleRad = angleDeg * Math.PI / 180;
        if (knob) {
            knob.setAttribute('cx', cx + r * Math.cos(angleRad));
            knob.setAttribute('cy', cy + r * Math.sin(angleRad));
        }
        if (progressPath) {
            progressPath.style.strokeDashoffset = ARC_LENGTH - (fraction * ARC_LENGTH);
        }
        if (sessionVal) sessionVal.textContent = sessionMinutes;
        if (breakVal) breakVal.textContent = Math.round(sessionMinutes / 5);
        timeLeft = sessionMinutes * 60;
        updateTimeDisplay();
    }

    function updateTimeDisplay() {
        const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const secs = (timeLeft % 60).toString().padStart(2, '0');
        const newText = `${mins}:${secs}`;
        if (clockText && clockText.textContent !== newText) {
            clockText.textContent = newText;
        }
        if (isRunning && progressPath) {
            const totalSecs = (isWorkSession ? sessionMinutes : Math.round(sessionMinutes / 5)) * 60;
            const ratio = timeLeft / totalSecs;
            const newOffset = ARC_LENGTH - (ratio * ARC_LENGTH);
            if (progressPath.style.strokeDashoffset !== `${newOffset}`) {
                progressPath.style.strokeDashoffset = newOffset;
            }
        }
    }

    if (quickBtns) {
        quickBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (isRunning) return;
                const mins = parseInt(e.target.getAttribute('data-time'), 10);
                updateKnobByMinutes(mins);
            });
        });
    }

    function handleDrag(e) {
        if (!isDragging || isRunning || !svgContainer) return;
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

    if (svgContainer) {
        svgContainer.addEventListener('mousedown', () => { isDragging = true; });
        svgContainer.addEventListener('touchstart', () => { isDragging = true; }, { passive: false });
    }
    window.addEventListener('mousemove', handleDrag);
    window.addEventListener('mouseup', () => { isDragging = false; });
    window.addEventListener('touchmove', handleDrag, { passive: false });
    window.addEventListener('touchend', () => { isDragging = false; });

    function cancelAllPomodoroNotifications() {
        if (cancelMobileNotification) {
            cancelMobileNotification(999991);
            cancelMobileNotification(999992);
            cancelMobileNotification(999993);
            cancelMobileNotification(888888);
        }
    }

    function syncTimerWithTimePassed() {
        if (!isRunning) return;
        const expectedEnd = localStorage.getItem('pomodoro_expected_end');
        if (expectedEnd) {
            const remainingMs = parseInt(expectedEnd, 10) - Date.now();
            timeLeft = Math.max(0, Math.ceil(remainingMs / 1000));
            updateTimeDisplay();

            if (timeLeft > 0 && updateMobileTimerNotification) {
                const mins = Math.ceil(timeLeft / 60);
                if (typeof window.lastMinutesRemaining === 'undefined' || window.lastMinutesRemaining !== mins) {
                    window.lastMinutesRemaining = mins;
                    updateMobileTimerNotification(isWorkSession, timeLeft);
                }
            }

            if (timeLeft <= 0) {
                playSound('pomodoro');
                cancelAllPomodoroNotifications();
                delete window.lastMinutesRemaining;

                if (isWorkSession) {
                    isWorkSession = false;
                    if (statusText) statusText.innerHTML = '<i class="fa-solid fa-mug-hot"></i> Break';
                    if (progressPath) progressPath.style.stroke = '#73D13D';
                    showToast('Focus finished! Break started.', 'info');
                    timeLeft = Math.round(sessionMinutes / 5) * 60;
                    const nextEnd = Date.now() + (timeLeft * 1000);
                    localStorage.setItem('pomodoro_expected_end', nextEnd);
                    
                    if (scheduleMobileNotification) {
                        scheduleMobileNotification(
                            999991,
                            'Focus Session Finished!',
                            'Great focus! Time for a short break.',
                            Date.now() + 100,
                            null,
                            'pomodoro.mp3'
                        );
                        scheduleMobileNotification(
                            999993,
                            'Break Time Finished!',
                            'Break over! Ready to focus on the next task?',
                            nextEnd,
                            null,
                            'pomodoro.mp3'
                        );
                    }
                    updateTimeDisplay();
                } else {
                    clearInterval(timerInterval);
                    isRunning = false;
                    isWorkSession = true;
                    if (statusText) statusText.innerHTML = '<i class="fa-solid fa-bullseye"></i> Focus';
                    if (progressPath) progressPath.style.stroke = 'var(--color-ticktick-blue)';
                    if (btnStart) btnStart.innerHTML = '<i class="fa-solid fa-play"></i> Start';
                    if (knob) knob.style.display = 'block';
                    showToast('Break over! Ready to focus?', 'info');
                    localStorage.removeItem('pomodoro_expected_end');
                    
                    if (scheduleMobileNotification) {
                        scheduleMobileNotification(
                            999992,
                            'Break Time Finished!',
                            'Break over! Ready to focus on the next task?',
                            Date.now() + 100,
                            null,
                            'pomodoro.mp3'
                        );
                    }
                    updateKnobByMinutes(sessionMinutes);
                }
            }
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            syncTimerWithTimePassed();
        }
    });
    window.addEventListener('focus', syncTimerWithTimePassed);

    if (btnStart) {
        btnStart.addEventListener('click', () => {
            if (isRunning) {
                clearInterval(timerInterval);
                isRunning = false;
                btnStart.innerHTML = '<i class="fa-solid fa-play"></i> Resume';
                localStorage.removeItem('pomodoro_expected_end');
                cancelAllPomodoroNotifications();
                delete window.lastMinutesRemaining;
            } else {
                isRunning = true;
                btnStart.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
                if (knob) knob.style.display = 'none'; 
                
                const expectedEnd = Date.now() + (timeLeft * 1000);
                localStorage.setItem('pomodoro_expected_end', expectedEnd);
                
                if (scheduleMobileNotification) {
                    scheduleMobileNotification(
                        999993,
                        isWorkSession ? 'Focus Session Finished!' : 'Break Time Finished!',
                        isWorkSession ? 'Great focus! Time for a short break.' : 'Break over! Ready to focus on the next task?',
                        expectedEnd,
                        null,
                        'pomodoro.mp3'
                    );
                }

                if (timeLeft > 0 && updateMobileTimerNotification) {
                    const mins = Math.ceil(timeLeft / 60);
                    window.lastMinutesRemaining = mins;
                    updateMobileTimerNotification(isWorkSession, timeLeft);
                }

                timerInterval = setInterval(() => {
                    syncTimerWithTimePassed();
                }, 200);
            }
        });
    }

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            clearInterval(timerInterval);
            isRunning = false;
            isWorkSession = true;
            if (knob) knob.style.display = 'block';
            if (statusText) statusText.innerHTML = '<i class="fa-solid fa-bullseye"></i> Focus';
            if (progressPath) progressPath.style.stroke = 'var(--color-ticktick-blue)';
            if (btnStart) btnStart.innerHTML = '<i class="fa-solid fa-play"></i> Start';
            localStorage.removeItem('pomodoro_expected_end');
            cancelAllPomodoroNotifications();
            delete window.lastMinutesRemaining;
            updateKnobByMinutes(25);
        });
    }

    updateKnobByMinutes(25);
}
