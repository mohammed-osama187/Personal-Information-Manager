import { Filesystem, Directory } from '@capacitor/filesystem';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { showToast } from './utils.js';

const UPDATE_METADATA_URL = 'https://mohammed-osama187.github.io/Personal-Information-Manager/version.json';
const GITHUB_REPO_OWNER = 'mohammed-osama187';
const GITHUB_REPO_NAME = 'Personal-Information-Manager';
const DEFAULT_DOWNLOAD_URL = 'https://mohammed-osama187.github.io/Personal-Information-Manager/FlowTick.apk';

const getFilesystem = () => (typeof Filesystem !== 'undefined' ? Filesystem : (window.Capacitor?.Plugins?.Filesystem || null));
const getApp = () => (typeof App !== 'undefined' ? App : (window.Capacitor?.Plugins?.App || null));
const DirectoryCache = (typeof Directory !== 'undefined' && Directory.Cache) ? Directory.Cache : 'CACHE';

export async function downloadApk(url = DEFAULT_DOWNLOAD_URL) {
    const isNative = isNativePlatform();
    if (isNative) {
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

export async function startDirectDownloadAndInstall(apkUrl, versionName) {
    const isNative = isNativePlatform();
    if (!isNative) {
        window.open(apkUrl || DEFAULT_DOWNLOAD_URL, '_blank');
        return;
    }

    const confirmBtn = document.getElementById('update-confirm-btn');
    try {
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Downloading...';
        }
        showToast('Downloading update... Please wait.', 'info');

        const fileName = `FlowTick-v${versionName || 'latest'}.apk`;
        const fs = getFilesystem();

        if (fs && typeof fs.downloadFile === 'function') {
            // 1. Download file directly into app storage without browser redirects
            await fs.downloadFile({
                url: apkUrl || DEFAULT_DOWNLOAD_URL,
                path: fileName,
                directory: DirectoryCache
            });

            showToast('Download complete. Launching installer...', 'success');

            // 2. Open the downloaded APK with Android Package Installer
            if (window.Capacitor?.Plugins?.AppInstaller) {
                await window.Capacitor.Plugins.AppInstaller.installApk({ fileName });
            } else if (typeof fs.getUri === 'function') {
                const uriResult = await fs.getUri({
                    directory: DirectoryCache,
                    path: fileName
                });
                window.location.href = uriResult.uri;
            }
        } else {
            // Fallback to external browser if filesystem plugin isn't available
            await downloadApk(apkUrl || DEFAULT_DOWNLOAD_URL);
        }
    } catch (error) {
        console.error('In-app installation error:', error);
        showToast('Failed to install update automatically: ' + error.message, 'error');
        try {
            await downloadApk(apkUrl || DEFAULT_DOWNLOAD_URL);
        } catch (_) {}
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Update Now';
        }
    }
}
window.startDirectDownloadAndInstall = startDirectDownloadAndInstall;

export async function updateDownloadLinks() {
    const downloadBtn = document.getElementById('apk-download-btn') || document.getElementById('settings-download-link');
    const sidebarBtn = document.getElementById('sidebar-download-link');
    if (!downloadBtn && !sidebarBtn) return;

    try {
        const response = await fetch('./version.json?cache_bust=' + Date.now());
        if (response.ok) {
            const data = await response.json();
            const versionName = data.versionName || '1.0.0';

            // Keep the direct static file URL
            if (downloadBtn) {
                downloadBtn.href = './FlowTick.apk';
                downloadBtn.setAttribute('download', `FlowTick-v${versionName}.apk`);
            }
            if (sidebarBtn) {
                sidebarBtn.href = './FlowTick.apk';
                sidebarBtn.setAttribute('download', `FlowTick-v${versionName}.apk`);
            }
        }
    } catch (error) {
        console.error('Failed to load version details:', error);
        if (downloadBtn) {
            downloadBtn.href = './FlowTick.apk';
            downloadBtn.setAttribute('download', 'FlowTick.apk');
        }
        if (sidebarBtn) {
            sidebarBtn.href = './FlowTick.apk';
            sidebarBtn.setAttribute('download', 'FlowTick.apk');
        }
    }
}

// Fetch the Version Dynamically on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
    await updateDownloadLinks();
});

export function initAppUpdates() {
    const isNative = isNativePlatform();

    // 1. Manage Web-only APK download buttons visibility
    const webDownloadElements = document.querySelectorAll('.web-only-download');
    if (!isNative) {
        webDownloadElements.forEach(el => {
            el.style.display = 'block';
        });
        updateDownloadLinks();
    } else {
        webDownloadElements.forEach(el => {
            el.style.display = 'none';
        });
    }

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
        versionCode: 4,
        versionName: '2.3.0'
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
            modal.classList.remove('active');
            await startDirectDownloadAndInstall(downloadUrl, latest.versionName);
        };
    }

    modal.classList.add('active');
}

export async function checkForAppUpdate() {
    if (!isNativePlatform()) return;

    try {
        const info = await getCurrentAppInfo();
        const currentBuild = parseInt(info.versionCode, 10) || 1;

        const response = await fetch(`${UPDATE_METADATA_URL}?t=${Date.now()}`);
        if (!response.ok) return;

        const remoteData = await response.json();
        const remoteBuild = parseInt(remoteData.versionCode, 10) || 1;

        if (remoteBuild > currentBuild) {
            showUpdateModal(remoteData);
        }
    } catch (err) {
        console.error('Update checking failed:', err);
    }
}

// Run update check on app launch
window.addEventListener('DOMContentLoaded', () => {
    checkForAppUpdate();
});

window.checkAppUpdate = checkAppUpdate;
window.checkForAppUpdate = checkForAppUpdate;
window.startDirectDownloadAndInstall = startDirectDownloadAndInstall;
