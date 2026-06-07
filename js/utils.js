export function parseLocalISOString(dateStr, timeStr) {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min] = (timeStr || '00:00').split(':').map(Number);
    return new Date(y, m - 1, d, h, min, 0);
}

export function parseLocalDate(dateStr) {
    if (!dateStr) return new Date();
    const parts = dateStr.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

export function formatLocalDate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Returns today's date as 'YYYY-MM-DD' in local time. */
export function getTodayStr() {
    return formatLocalDate(new Date());
}

export function formatTime12h(time24) {
    if (!time24) return '';
    const [hourStr, min] = time24.split(':');
    let hour = parseInt(hourStr, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return `${hour}:${min} ${ampm}`;
}

export function formatTaskTimeDisplay(time24) {
    if (!time24) return '';
    const is24h = (localStorage.getItem('timeFormat') || '12h') === '24h';
    if (is24h) return time24;
    return formatTime12h(time24);
}

export function getStableNumericId(strId) {
    if (!strId) return Math.floor(Math.random() * 1000000) + 1;
    let hash = 0;
    for (let i = 0; i < strId.length; i++) {
        hash = strId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 999999 + 1; // Unique positive integer between 1 and 1,000,000
}

const audioFiles = {
    check: new Audio('sounds/check.mp3'),
    success: new Audio('sounds/success.mp3'),
    delete: new Audio('sounds/delete.mp3'),
    pomodoro: new Audio('sounds/pomodoro.mp3'),
    error: new Audio('sounds/delete.mp3') 
};

export function playSound(type) {
    if (audioFiles[type]) {
        const soundClone = audioFiles[type].cloneNode();
        soundClone.volume = 0.7; 
        soundClone.play().catch(e => console.log("Audio play blocked:", e));
    }
}

export function showToast(message, type = 'success', playAudio = true) {
    const container = document.getElementById('toast-container');
    if (!container) return;
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

export function showConfirm(message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-message');
    const yesBtn = document.getElementById('confirm-yes');
    const noBtn = document.getElementById('confirm-no');
    if (!modal || !msgEl || !yesBtn || !noBtn) return;
    
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

export function getColor(priority) {
    if (priority === 'high') return '#FF4D4F';
    if (priority === 'low') return '#2F7BF6';
    return '#FFA940'; // medium or default
}

let systemThemeMedia = null;

function handleSystemThemeChange(e) {
    if (localStorage.getItem('theme') === 'system') {
        if (e.matches) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }
}

export function applyThemePreference(theme) {
    if (!systemThemeMedia) {
        systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)');
        if (systemThemeMedia.addEventListener) {
            systemThemeMedia.addEventListener('change', handleSystemThemeChange);
        } else if (systemThemeMedia.addListener) {
            systemThemeMedia.addListener(handleSystemThemeChange);
        }
    }

    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else if (theme === 'light') {
        document.body.classList.remove('dark-theme');
    } else {
        // system theme
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }
}
