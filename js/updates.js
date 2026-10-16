import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { showToast } from './utils.js';

const GITHUB_REPO_OWNER = 'mohammed-osama187';
const GITHUB_REPO_NAME = 'Personal-Information-Manager';
const DEFAULT_DOWNLOAD_URL = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest/download/FlowTick-latest.apk`;
const REMOTE_VERSION_URL = `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/main/version.json`;

export async function downloadApk(url = DEFAULT_DOWNLOAD_URL) {
    const isNative = isNativePlatform();
    if (isNative) {
        // Escapes the internal WebView and forces Android's default browser (e.g., Chrome)
        // to handle the download, triggering the native DownloadManager properly.
        try {
            if (typeof Browser !== 'undefined' && Browser.open) {
                await Browser.open({
                    url: url,
                    windowName: '_system'
                });
                return;
            }
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
                await window.Capacitor.Plugins.Browser.open({
                    url: url,
                    windowName: '_system'
                });
                return;
            }
        } catch (e) {
            console.warn('[Updates] Browser plugin open failed:', e);
        }
    }
    // Normal web environment
    window.open(url, '_blank');
}
window.downloadApk = downloadApk;

export function initAppUpdates() {
    const isNative = isNativePlatform();

    // 1. Manage Web-only APK download buttons visibility
    const webDownloadElements = document.querySelectorAll('.web-only-download');
    if (!isNative) {
        webDownloadElements.forEach(el => {
            el.style.display = 'block';
        });
        // Set dynamic download link
        const sidebarLink = document.getElementById('sidebar-download-link');
        const settingsLink = document.getElementById('settings-download-link');
        if (sidebarLink) sidebarLink.href = DEFAULT_DOWNLOAD_URL;
        if (settingsLink) settingsLink.href = DEFAULT_DOWNLOAD_URL;
    } else {
        webDownloadElements.forEach(el => {
            el.style.display = 'none';
        });
    }

    // Intercept click on download links to prevent default WebView navigation
    const interceptDownloadLink = (linkId) => {
        const linkEl = document.getElementById(linkId);
        if (linkEl) {
            linkEl.addEventListener('click', async (event) => {
                event.preventDefault();
                const apkUrl = (linkEl.href && !linkEl.href.endsWith('#')) ? linkEl.href : DEFAULT_DOWNLOAD_URL;
                await downloadApk(apkUrl);
            });
        }
    };
    interceptDownloadLink('sidebar-download-link');
    interceptDownloadLink('settings-download-link');

    // 2. App-only Update Check visibility (shown only in mobile app, hidden on website)
    const appUpdateCards = document.querySelectorAll('.app-only-update');
    if (isNative) {
        appUpdateCards.forEach(el => {
            el.style.display = 'block';
        });
        updateSettingsVersionDisplay();
    } else {
        appUpdateCards.forEach(el => {
            el.style.display = 'none';
        });
    }

    // Settings "Check for Updates" button
    const checkUpdatesBtn = document.getElementById('check-updates-btn');
    if (checkUpdatesBtn) {
        checkUpdatesBtn.addEventListener('click', () => {
            checkAppUpdate(true);
        });
    }

    // 3. Modal action buttons
    const updateCancelBtn = document.getElementById('update-cancel-btn');
    const updateModal = document.getElementById('update-modal');
    if (updateCancelBtn && updateModal) {
        updateCancelBtn.addEventListener('click', () => {
            updateModal.classList.remove('active');
        });
    }

    // 4. If native mobile app, automatically check for updates on startup
    if (isNative) {
        setTimeout(() => {
            checkAppUpdate(false);
        }, 2000);
    }
}

export function isNativePlatform() {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
}

export async function getCurrentAppInfo() {
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            const info = await window.Capacitor.Plugins.App.getInfo();
            return {
                versionCode: parseInt(info.build, 10) || 1,
                versionName: info.version || '1.0.0'
            };
        }
    } catch (e) {
        console.warn('[Updates] Failed to get native App info:', e);
    }
    return {
        versionCode: 3,
        versionName: '2.2.0'
    };
}

async function updateSettingsVersionDisplay() {
    const versionTextEl = document.getElementById('app-current-version-text');
    if (!versionTextEl) return;
    const appInfo = await getCurrentAppInfo();
    const platformLabel = isNativePlatform() ? 'Android App' : 'Web App';
    versionTextEl.textContent = `${platformLabel} • v${appInfo.versionName} (Build ${appInfo.versionCode})`;
}

export async function checkAppUpdate(isManual = false) {
    const checkUpdatesBtn = document.getElementById('check-updates-btn');
    if (checkUpdatesBtn && isManual) {
        checkUpdatesBtn.disabled = true;
        checkUpdatesBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';
    }

    try {
        const appInfo = await getCurrentAppInfo();
        const currentBuild = appInfo.versionCode;

        // Try remote URL first, then fallback to local version.json
        let latest = null;
        try {
            const remoteRes = await fetch(`${REMOTE_VERSION_URL}?cache_bust=${Date.now()}`);
            if (remoteRes.ok) {
                latest = await remoteRes.json();
            }
        } catch (_) {}

        if (!latest) {
            const localRes = await fetch(`./version.json?cache_bust=${Date.now()}`);
            if (localRes.ok) {
                latest = await localRes.json();
            }
        }

        if (!latest) {
            if (isManual) {
                showToast('Unable to check for updates. Check internet connection.', 'error');
            }
            return;
        }

        const remoteBuild = parseInt(latest.versionCode, 10) || 1;

        if (remoteBuild > currentBuild) {
            showUpdateModal(latest);
        } else {
            if (isManual) {
                showToast(`You are on the latest version (v${appInfo.versionName})`, 'success');
            }
        }
    } catch (error) {
        console.error('[Updates] Update check failed:', error);
        if (isManual) {
            showToast('Update check failed. Please try again.', 'error');
        }
    } finally {
        if (checkUpdatesBtn && isManual) {
            checkUpdatesBtn.disabled = false;
            checkUpdatesBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Check for Updates';
        }
    }
}

export function showUpdateModal(latest) {
    const modal = document.getElementById('update-modal');
    const versionBadge = document.getElementById('update-version-badge');
    const notesEl = document.getElementById('update-release-notes');
    const confirmBtn = document.getElementById('update-confirm-btn');

    if (!modal) return;

    if (versionBadge) {
        versionBadge.textContent = `v${latest.versionName || '1.1.0'}`;
    }

    if (notesEl) {
        notesEl.textContent = latest.releaseNotes || 'Bug fixes and performance improvements.';
    }

    if (confirmBtn) {
        confirmBtn.onclick = async (event) => {
            if (event) event.preventDefault();
            const downloadUrl = latest.downloadUrl || DEFAULT_DOWNLOAD_URL;
            await downloadApk(downloadUrl);
            modal.classList.remove('active');
        };
    }

    modal.classList.add('active');
}

window.checkAppUpdate = checkAppUpdate;
