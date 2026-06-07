import { 
    auth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged, 
    sendPasswordResetEmail, 
    updatePassword, 
    EmailAuthProvider, 
    reauthenticateWithCredential, 
    updateProfile 
} from './firebase.js';
import { showToast } from './utils.js';
import { displayTasks, initSettings } from './ui.js';

export function togglePasswordVisibility(inputId, iconEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === 'password') {
        input.type = 'text';
        iconEl.classList.remove('fa-eye-slash');
        iconEl.classList.add('fa-eye');
    } else {
        input.type = 'password';
        iconEl.classList.remove('fa-eye');
        iconEl.classList.add('fa-eye-slash');
    }
}

export function closeAuthScreen(event) {
    if (event) event.preventDefault();
    localStorage.setItem('isGuestMode', 'true');
    const authScreen = document.getElementById('auth-screen');
    const appScreen = document.getElementById('app-screen');
    if (authScreen) authScreen.style.display = 'none';
    if (appScreen) appScreen.style.display = 'flex';
    displayTasks();
    if (window.calendarInstance) window.calendarInstance.refetchEvents();
    initSettings();
}

export function toggleAuth(type) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    if (type === 'signup') {
        if (loginForm) loginForm.style.display = 'none';
        if (signupForm) signupForm.style.display = 'block';
    } else {
        if (loginForm) loginForm.style.display = 'block';
        if (signupForm) signupForm.style.display = 'none';
    }
}

window.togglePasswordVisibility = togglePasswordVisibility;
window.closeAuthScreen = closeAuthScreen;
window.toggleAuth = toggleAuth;

export function initAuth() {
    const authScreen = document.getElementById('auth-screen');
    const appScreen = document.getElementById('app-screen');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const logoutBtn = document.getElementById('logout-btn');
    const loginSidebarBtn = document.getElementById('login-sidebar-btn');

    // Programmatic event listeners for password eye toggles
    document.querySelectorAll('.toggle-password-icon').forEach(icon => {
        icon.addEventListener('click', () => {
            const targetId = icon.getAttribute('data-toggle');
            if (targetId) {
                togglePasswordVisibility(targetId, icon);
            }
        });
    });

    // Programmatic event listeners for continue as guest buttons
    document.querySelectorAll('.continue-guest-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            closeAuthScreen(e);
        });
    });

    // Programmatic event listeners for auth form switch links
    document.querySelectorAll('.auth-toggle-link').forEach(link => {
        link.addEventListener('click', () => {
            const target = link.getAttribute('data-auth-target');
            if (target) {
                toggleAuth(target);
            }
        });
    });

    // Login Sidebar Button handler
    if (loginSidebarBtn) {
        loginSidebarBtn.addEventListener('click', () => {
            authScreen.style.display = 'flex';
            appScreen.style.display = 'none';
        });
    }

    // Register Firebase Auth State Listener
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in
            const currentUser = {
                id: user.uid,
                email: user.email,
                name: user.displayName || user.email.split('@')[0]
            };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            localStorage.removeItem('isGuestMode');
            
            authScreen.style.display = 'none';
            appScreen.style.display = 'flex';
            document.getElementById('display-username').textContent = currentUser.name;
            const dTitle = document.getElementById('dashboard-title');
            if (dTitle) dTitle.textContent = `Hello, ${currentUser.name}`;
            
            if (logoutBtn) logoutBtn.style.display = 'block';
            if (loginSidebarBtn) loginSidebarBtn.style.display = 'none';

            // Sync Guest tasks if any
            import('./db.js').then(module => {
                module.syncGuestDataToFirebase(user.uid);
            });
            
            displayTasks();
            if (window.calendarInstance) window.calendarInstance.refetchEvents();
            initSettings();
        } else {
            // User is signed out
            localStorage.removeItem('currentUser');
            
            const justLoggedOut = localStorage.getItem('justLoggedOut');
            const isGuestMode = localStorage.getItem('isGuestMode') === 'true';

            if (justLoggedOut === 'true') {
                localStorage.removeItem('justLoggedOut');
                localStorage.removeItem('isGuestMode');
                authScreen.style.display = 'flex';
                appScreen.style.display = 'none';
            } else if (isGuestMode) {
                authScreen.style.display = 'none';
                appScreen.style.display = 'flex';
            } else {
                authScreen.style.display = 'flex';
                appScreen.style.display = 'none';
            }
            
            const guestName = localStorage.getItem('guestName') || 'Guest User';
            document.getElementById('display-username').textContent = guestName;
            const dTitle = document.getElementById('dashboard-title');
            if (dTitle) dTitle.textContent = `Hello, ${guestName}`;
            
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (loginSidebarBtn) loginSidebarBtn.style.display = 'block';

            displayTasks();
            if (window.calendarInstance) window.calendarInstance.refetchEvents();
            initSettings();
        }
    });

    // Forms event handlers
    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;

        if (password !== confirmPassword) {
            showToast('Passwords do not match!', 'error');
            return;
        }

        createUserWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                const user = userCredential.user;
                return updateProfile(user, { displayName: name });
            })
            .then(() => {
                showToast('Account created successfully!', 'success');
            })
            .catch((error) => {
                showToast(error.message, 'error');
            });
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                showToast('Logged in successfully!', 'success');
            })
            .catch((error) => {
                showToast('Invalid email or password!', 'error');
            });
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.setItem('justLoggedOut', 'true');
        signOut(auth).then(() => {
            showToast('Logged out successfully', 'info');
        }).catch((error) => console.error(error));
    });

    const forgotPassLink = document.getElementById('forgot-password-link');
    if (forgotPassLink) {
        forgotPassLink.addEventListener('click', (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('login-email').value;
            
            if (!emailInput) {
                showToast('Please enter your email address first!', 'info');
                document.getElementById('login-email').focus();
                return;
            }

            sendPasswordResetEmail(auth, emailInput)
                .then(() => {
                    showToast('Reset email sent! Please check your Inbox and Spam/Junk folder.', 'success');
                })
                .catch((error) => {
                    console.error("Firebase Password Reset Error:", error);
                    showToast('Failed to send reset link: ' + error.message, 'error');
                });
        });
    }
}
